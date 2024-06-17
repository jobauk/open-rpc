import type { CreateApiSpec, Result, SchemaConfig, UnknownData } from "./types";
import { ResponseError, ensureError } from "./utils";

export interface ProxyCallbackOptions {
  path: string[];
  args: [
    null | undefined | BodyInit,
    (
      | {
          $query?: Record<string, unknown>;
          $headers?: Record<string, string>;
        }
      | undefined
    ),
  ];
}

type ProxyCallback = (opts: ProxyCallbackOptions | Request) => unknown;

export type GeneratorOptions = ProxyCallbackOptions[];

export type Generator = (opts: GeneratorOptions) => Request;

const noop = () => {};

const methods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

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
          path: [...opts.path, key],
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
        methods.includes(lastSegment) ||
        (generators && lastSegment in generators);

      if (!isMethod) {
        const parameter = Object.values(args[0]).join("");
        return createInnerProxy(
          callback,
          {
            path: [...opts.path, parameter],
            args: opts.args,
          },
          generators,
          ctx,
        );
      }

      if (generators?.[lastSegment]) {
        const _generatorOps = ctx.generatorOpts;
        // Cleanup
        ctx.isGenerator = false;
        ctx.generatorOpts = [];
        return callback(generators?.[lastSegment](_generatorOps));
      }

      if (ctx.isGenerator) {
        return ctx.generatorOpts.push(opts);
      }

      return callback({
        args: isApply ? (args.length >= 2 ? args[1] : []) : args,
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

function createSearchParams(args?: Record<string, unknown>) {
  if (!args) {
    return "";
  }

  const params = new URLSearchParams();
  for (const key in args) {
    const value = args[key];
    switch (typeof value) {
      case "number":
      case "string":
      case "boolean":
        params.append(key, String(value));
        break;
      case "object":
        if (
          Array.isArray(value) &&
          value.every((value) => typeof value === "string" || "number")
        ) {
          params.append(key, value.join(","));
        } else {
          params.append(key, JSON.stringify(value));
        }
        break;
    }
  }

  return `?${params}`;
}

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
async function handleFetch(req: Request): Promise<Result<unknown>> {
  try {
    const res = await fetch(req);
    const data = await res.json();
    if (!res.ok) {
      throw new ResponseError(res.statusText, {
        response: res,
        context: data,
      });
    }
    return { success: true, data, error: null };
  } catch (err) {
    const error = ensureError(err);

    return { success: false, data: null, error };
  }
}

type Middleware = {
  onResponse?: (res: Result<UnknownData>) => unknown;
};

export const createClient =
  <
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ApiSpec extends { [key: string]: any },
    TConfig extends SchemaConfig = {
      bodyTypeKey: `requestBody.content.${string}`;
      parameterTypeKey: "parameters.query";
      responseTypeKey: `responses`;
      responseValueTypeKey: `${number}.content.${string}`;
    },
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    TExtended extends Record<string | number, unknown> = {},
  >() =>
  <TMiddleware extends Middleware>(
    baseUrl: string,
    options?: {
      init?: RequestInit;
      middleware?: TMiddleware;
      generators?: Record<string, Generator>;
    },
  ) =>
    createRecursiveProxy(async (opts) => {
      let req: Request;

      if (opts instanceof Request) {
        req = new Request(opts, { ...options?.init });
      } else {
        const path = opts.path;
        const args = opts.args;
        const method = path.pop();
        const fullPath = path
          .join("/")
          .replaceAll("/.", ".")
          .replaceAll("./", ".");
        const params = createSearchParams(args[1]?.$query);
        const uri = `${baseUrl}/${fullPath}${params}`;

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

      return handleFetch(req);
    }, options?.generators) as CreateApiSpec<
      ApiSpec,
      TConfig,
      Extract<TMiddleware["onResponse"], undefined> extends never
        ? ReturnType<Exclude<TMiddleware["onResponse"], undefined>>
        : never
    > &
      TExtended;
