import { serializePath, serializeSearchParams } from "./serialize";
import type {
  Data,
  Format,
  Generator,
  Middleware,
  Prepare,
  ProxyCallback,
  ProxyCallbackOptions,
  Result,
} from "./types";
import { unwrapResponse } from "./unwrap";
import { ResponseError, ensureError, isJsonable, type Jsonable } from "./utils";

const noop = () => {};

export const methods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

export const methodsWithoutBody = ["get", "head", "options", "trace"];

function createInnerProxy(
  callback: ProxyCallback,
  opts: ProxyCallbackOptions,
  generators: Record<string, Generator> | undefined,
  ctx: {
    isGenerator: boolean;
    generatorOpts: ProxyCallbackOptions[];
  },
) {
  const proxy: unknown = new Proxy(noop, {
    get(_obj, key) {
      if (typeof key !== "string" || key === "then") {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }

      if (generators && Object.keys(generators).includes(key)) {
        ctx.isGenerator = true;
      }

      return createInnerProxy(
        callback,
        {
          path:
            key === "index" && opts.path.length === 0
              ? [...opts.path]
              : [...opts.path, key],
          args: opts.args,
        },
        generators,
        ctx,
      );
    },
    apply(_1, _2, args) {
      const isApply = opts.path[opts.path.length - 1] === "apply";
      const lastSegment = opts.path[opts.path.length - (isApply ? 2 : 1)];
      const isMethod =
        (typeof lastSegment === "string" && methods.includes(lastSegment)) ||
        (generators &&
          typeof lastSegment === "string" &&
          lastSegment in generators);

      if (!isMethod) {
        return createInnerProxy(
          callback,
          {
            path: [...opts.path, args[0]],
            args: opts.args,
          },
          generators,
          ctx,
        );
      }

      if (generators?.[lastSegment]) {
        const _generatorOpts = ctx.generatorOpts;
        // Cleanup
        ctx.isGenerator = false;
        ctx.generatorOpts = [];
        return callback(generators?.[lastSegment](_generatorOpts));
      }

      if (ctx.isGenerator) {
        return ctx.generatorOpts.push({
          args: methodsWithoutBody.includes(lastSegment)
            ? ([null, ...args] as ProxyCallbackOptions["args"])
            : opts.args,
          path: opts.path,
        });
      }

      const _args = isApply ? (args.length >= 2 ? args[1] : []) : args;
      return callback({
        args: methodsWithoutBody.includes(lastSegment)
          ? [null, ..._args]
          : _args,
        path: isApply ? opts.path.slice(0, -1) : opts.path,
      });
    },
  });

  return proxy;
}

/**
 * Creates a proxy that calls the callback with the path and arguments
 *
 * @internal
 */
const createRecursiveProxy = (
  callback: ProxyCallback,
  generators: Record<string, Generator> | undefined,
) =>
  createInnerProxy(
    callback,
    {
      path: [],
      args: [null, {}],
    },
    generators,
    { isGenerator: false, generatorOpts: [] },
  );

/**
 *
 * @param h1 Base headers.
 * @param h Array of extra headers to merge.
 * @returns Merged headers.
 * @internal
 */
function mergeHeaders(h1?: HeadersInit, ...h: (HeadersInit | undefined)[]) {
  const toLowerCaseKeys = (obj: HeadersInit) => {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key.toLowerCase(), value]),
    );
  };

  let rawHeaders = h1;
  for (const headers of h) {
    if (
      Array.isArray(headers) &&
      headers.every((header) => Array.isArray(header))
    ) {
      const joinedHeaders: Record<string, string> = {};
      for (const [key, value] of headers) {
        joinedHeaders[key.toLowerCase()] = value;
      }
      rawHeaders = { ...rawHeaders, ...joinedHeaders };
    } else {
      if (headers) {
        rawHeaders = { ...rawHeaders, ...toLowerCaseKeys(headers) };
      }
    }
  }

  return new Headers(rawHeaders);
}

// TODO: Add response type validation
async function handleFetch(
  req: Request,
): Promise<
  [
    Result<
      | object
      | Blob
      | ArrayBuffer
      | Jsonable
      | Record<string, FormDataEntryValue>
    >,
    Response | null,
  ]
> {
  try {
    const res = await fetch(req);
    const _res = res.clone();
    const data = await unwrapResponse(res);
    const context = isJsonable(data) ? data : null;
    if (!res.ok) {
      throw new ResponseError(res.statusText, {
        response: res,
        context,
      });
    }
    return [{ success: true, data, error: null }, _res];
  } catch (err) {
    const error = ensureError(err);

    return [{ success: false, data: null, error }, null];
  }
}

export const createClient =
  <
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ApiSpec extends { [key: string]: any },
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    TExtended extends Record<string | number, unknown> = {},
  >(
    baseUrl: string,
  ) =>
  <TMiddleware extends Middleware>(options?: {
    init?: RequestInit;
    middleware?: TMiddleware;
    generators?: Record<string, Generator>;
  }) =>
    createRecursiveProxy(async (opts) => {
      const _baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      let req: Request;

      if (opts instanceof Request) {
        req = new Request(opts, { ...options?.init });
      } else {
        const path = opts.path;
        const args = opts.args;
        const method = path.pop() as string;
        const fullPath = serializePath(path);

        const params = serializeSearchParams(args[1]?.$query);
        const uri = `${_baseUrl}${fullPath}${params}`;
        const body = args[0] ? JSON.stringify(args[0]) : null;
        const headers = args[1]?.$headers;

        req = new Request(uri, {
          ...options?.init,
          method,
          body,
          headers: mergeHeaders(
            options?.init?.headers,
            [["content-type", "application/json"]],
            headers,
          ),
        });
      }

      if (options?.middleware?.onRequest) {
        req = options.middleware.onRequest(req, {
          baseUrl,
          init: options?.init,
        });
      }

      const [response, clonedResponse] = await handleFetch(req);
      if (options?.middleware?.onResponse) {
        return options.middleware.onResponse(response as Result<Data>, {
          baseUrl,
          init: options?.init,
          response: clonedResponse,
        });
      }
      return response;
    }, options?.generators) as Format<
      Prepare<ApiSpec>,
      Extract<TMiddleware["onResponse"], undefined> extends never
        ? ReturnType<Exclude<TMiddleware["onResponse"], undefined>>
        : Result<Data>
    > &
      TExtended;
