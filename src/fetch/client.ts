import { serializePath, serializeSearchParams } from "./serialize";
import type {
  Data,
  ExtendedHeadersInit,
  ExtractFunctions,
  Format,
  Generator,
  GetResponseFormat,
  Middleware,
  Prepare,
  ProxyCallback,
  ProxyCallbackOptions,
  Result,
} from "./types";
import { unwrapResponse } from "./unwrap";
import {
  type Jsonable,
  ResponseError,
  ensureError,
  isJsonable,
  isResponseError,
} from "./utils";

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
  staticProperties: // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    | Record<string, ((...args: any[]) => any) | Record<string, unknown>>
    | typeof noop,
  ctx: {
    isGenerator: boolean;
    generatorOpts: ProxyCallbackOptions[];
  },
) {
  const proxy: unknown = new Proxy(staticProperties || noop, {
    get(_obj, key) {
      if (typeof key !== "string" || key === "then") {
        // special case for if the proxy is accidentally treated
        // like a PromiseLike (like in `Promise.resolve(proxy)`)
        return undefined;
      }

      if (staticProperties && key in staticProperties) {
        return Reflect.get(_obj, key);
      }

      if (generators && key in generators) {
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
        noop,
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
          noop,
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
  staticProperties: // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    | Record<string, ((...args: any[]) => any) | Record<string, unknown>>
    | undefined,
) =>
  createInnerProxy(
    callback,
    {
      path: [],
      args: [null, {}],
    },
    generators,
    staticProperties || noop,
    { isGenerator: false, generatorOpts: [] },
  );

/**
 *
 * @param headersArray Array of headers to merge.
 * @returns Merged headers.
 * @internal
 */
function mergeHeaders(headersArray: (HeadersInit | undefined)[]) {
  const _headers = new Headers();

  for (const init of headersArray) {
    if (!init) continue;

    const iterable =
      init instanceof Headers
        ? init.entries()
        : Array.isArray(init)
          ? init
          : Object.entries(init);

    for (const [key, value] of iterable) {
      _headers.set(key, value);
    }
  }

  return _headers;
}

/**
 *
 * Adds support for functions as headers.
 *
 * @internal
 */
function initToHeaders(
  init: HeadersInit | ((path: string) => HeadersInit | undefined) | undefined,
  path: string,
) {
  if (typeof init === "function") {
    return new Headers(init(path));
  }

  return new Headers(init);
}

/**
 *
 * Builds headers different sources including dynamic functions
 *
 * @internal
 */
function buildHeaders(
  headersArray: ExtendedHeadersInit | undefined,
  path: string,
) {
  if (!headersArray) {
    return [];
  }

  const _headers: Headers[] = [];
  if (Array.isArray(headersArray) && !headersArray.every(Array.isArray)) {
    for (const headers of headersArray) {
      _headers.push(initToHeaders(headers, path));
    }
  } else {
    _headers.push(initToHeaders(headersArray, path));
  }

  return _headers;
}

// TODO: Add response type validation

/**
 *
 * Handles the fetch request, unwraps the response, construct errors, and formats the response
 *
 * @internal
 */
export async function handleFetch(
  req: Request,
): Promise<
  Result<
    object | Blob | ArrayBuffer | Jsonable | Record<string, FormDataEntryValue>
  >
> {
  try {
    const res = await fetch(req);
    const _res = res.clone();
    const data = await unwrapResponse(res);
    const context = isJsonable(data) ? data : null;
    if (!res.ok) {
      throw new ResponseError(res.statusText, {
        response: _res,
        context,
      });
    }
    return { success: true, data, error: null, response: _res };
  } catch (err) {
    const error = ensureError(err);

    if (isResponseError(error)) {
      return {
        success: false,
        data: null,
        error,
        response: error.response || null,
      };
    }

    return { success: false, data: null, error, response: null };
  }
}

/**
 *
 * Creates a new client
 *
 * @example
 * ```ts
 * const client = createClient<ApiSpec>("https://api.example.com")({
 *   headers: [
 *     {
 *       "content-type": "application/json;charset=utf-8",
 *     },
 *     (path) => {
 *       if (path.startsWith("/users")) {
 *         return {
 *           authorization: "Bearer 123",
 *         };
 *       }
 *     },
 *   ],
 * });
 * ```
 *
 */
export const createClient =
  <
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ApiSpec extends { [key: string]: any },
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    TExtended extends Record<string | number, unknown> = {},
  >(
    baseUrl: string,
  ) =>
  <
    TMiddleware extends Middleware,
    TStatic extends Record<
      string,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      ((...args: any[]) => any) | Record<string, unknown>
      // biome-ignore lint/complexity/noBannedTypes: <explanation>
    > = {},
  >(options?: {
    init?: Omit<RequestInit, "headers">;
    headers?: ExtendedHeadersInit;
    middleware?: TMiddleware;
    generators?: Record<string, Generator>;
    static?: TStatic;
  }) =>
    createRecursiveProxy(
      async (opts) => {
        const _baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        let req: Request;

        if (opts instanceof Request) {
          const headers = mergeHeaders([
            { "content-type": "application/json" },
            ...buildHeaders(options?.headers, new URL(opts.url).pathname),
            opts.headers,
          ]);
          req = new Request(opts, {
            ...options?.init,
            headers,
          });
        } else {
          const path = opts.path;
          const args = opts.args;
          const method = path.pop() as string;
          const fullPath = serializePath(path);

          const params = serializeSearchParams(args[1]?.query);
          const uri = `${_baseUrl}${fullPath}${params}`;
          const body = args[0] ? JSON.stringify(args[0]) : null;
          const headers = args[1]?.headers;

          req = new Request(uri, {
            ...options?.init,
            method,
            body,
            headers: mergeHeaders([
              { "content-type": "application/json" },
              ...buildHeaders(options?.headers, fullPath),
              headers,
            ]),
          });
        }

        if (options?.middleware?.onRequest) {
          req = options.middleware.onRequest(req, {
            baseUrl,
            init: options?.init,
          });
        }

        const result = await handleFetch(req);
        if (options?.middleware?.onResponse) {
          return options.middleware.onResponse(result as Result<Data>, {
            baseUrl,
            init: options?.init,
          });
        }

        return result;
      },
      options?.generators,
      options?.static,
    ) as Format<
      Prepare<ApiSpec, ExtractFunctions<ApiSpec>>,
      GetResponseFormat<TMiddleware>
    > &
      TStatic &
      TExtended;
