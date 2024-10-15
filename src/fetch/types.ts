import type { ResponseError } from "./utils";

export type Prettify<in out T> = {
  [K in keyof T]: T[K];
} & {};

export type Primitive =
  | null
  | undefined
  | string
  | number
  | boolean
  | symbol
  | bigint;

export type DefinedPrimitive = Prettify<Exclude<Primitive, undefined>>;

export interface ProxyCallbackOptions {
  path: Segment[];
  args: [
    null | undefined | BodyInit,
    (
      | {
          query?: Record<string, unknown>;
          headers?: Record<string, string>;
        }
      | undefined
    ),
  ];
}

export type ProxyCallback = (opts: ProxyCallbackOptions | Request) => unknown;

export type GeneratorOptions = ProxyCallbackOptions[];

export type Generator = (opts: GeneratorOptions) => Request;

export type ExtendedHeadersInit =
  | HeadersInit
  | ((path: string) => HeadersInit | undefined)
  | (((path: string) => HeadersInit | undefined) | HeadersInit | undefined)[];

export type Param = Record<
  string | number,
  | DefinedPrimitive
  | DefinedPrimitive[]
  | Record<string | number, DefinedPrimitive>
>;

export type Segment = DefinedPrimitive | Param;

type onRequestHandler = (
  request: Request,
  ctx: { baseUrl: string; init?: RequestInit },
) => Request;

type onResponseHandler = (
  response: Result<Data>,
  ctx: { baseUrl: string; init?: RequestInit },
) => unknown;

export type Middleware = {
  onRequest?: onRequestHandler;
  onResponse?: onResponseHandler;
};

export type Result<T> =
  | { success: true; data: T; error: null; response: Response }
  | {
      success: false;
      data: null;
      error: ResponseError;
      response: Response | null;
    };

export declare const brand: unique symbol;
export type Branded<T, U> = T & { [k in typeof brand]: U };

export type Data = Branded<unknown, "data">;

type FormatResponse<T, D> = T extends Data
  ? D
  : T extends ResponseError
    ? ResponseError
    : T extends object
      ? {
          [K in keyof T]: FormatResponse<T[K], D>;
        }
      : T;

export type UnionToIntersection<Union> = (
  Union extends unknown
    ? (distributedUnion: Union) => void
    : never
) extends (mergedIntersection: infer Intersection) => void
  ? Intersection & Union
  : never;

export type LastInUnion<U> = UnionToIntersection<
  U extends unknown ? (x: U) => 0 : never
> extends (x: infer L) => 0
  ? L
  : never;

export type UnionToTuple<T, Last = LastInUnion<T>> = [T] extends [never]
  ? []
  : [Last, ...UnionToTuple<Exclude<T, Last>>];

export type ExtractFunctions<T> = UnionToTuple<T> extends [
  (...args: infer P) => infer R,
  ...infer Rest,
]
  ? ((...args: P) => R) | ExtractFunctions<Rest>
  : // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    T extends [...any, (...args: infer P) => infer R]
    ? (...arg: P) => R
    : // biome-ignore lint/complexity/noBannedTypes: <explanation>
      {};

type FormatFunction<T, ResponseFormat> = UnionToIntersection<
  T extends (body?: infer Body, options?: infer Options) => Promise<infer D>
    ? unknown extends Options
      ? (options?: Body) => Promise<FormatResponse<ResponseFormat, D>>
      : (
          body?: Body,
          options?: Options,
        ) => Promise<FormatResponse<ResponseFormat, D>>
    : T extends (params: infer Params) => infer R
      ? (
          params: Params,
          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        ) => R extends (...args: any) => any
          ? Prettify<Format<R, ResponseFormat>> &
              FormatFunction<R, ResponseFormat>
          : Format<R, ResponseFormat>
      : never
>;

export type Prepare<T, Functions = unknown> = unknown extends Functions
  ? T
  : Prettify<
      Pick<T, keyof T> & {
        index: Functions;
      }
    >;

export type Format<in out T, ResponseFormat> = {
  [K in keyof T]: T[K] extends object
    ? // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      T[K] extends (...args: any) => any
      ? Prettify<Format<Pick<T[K], keyof T[K]>, ResponseFormat>> &
          FormatFunction<T[K], ResponseFormat>
      : Prettify<Format<T[K], ResponseFormat>>
    : T[K];
};

export type GetResponseFormat<
  TMiddleware extends Partial<Record<"onResponse", onResponseHandler>>,
> = Extract<TMiddleware["onResponse"], undefined> extends never
  ? ReturnType<Exclude<TMiddleware["onResponse"], undefined>>
  : Result<Data>;
