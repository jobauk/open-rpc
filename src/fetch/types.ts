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
          $query?: Record<string, unknown>;
          $headers?: Record<string, string>;
        }
      | undefined
    ),
  ];
}

export type ProxyCallback = (opts: ProxyCallbackOptions | Request) => unknown;

export type GeneratorOptions = ProxyCallbackOptions[];

export type Generator = (opts: GeneratorOptions) => Request;

export type Param = Record<
  string | number,
  | DefinedPrimitive
  | DefinedPrimitive[]
  | Record<string | number, DefinedPrimitive>
>;

export type Segment = DefinedPrimitive | Param;

export type Middleware = {
  onResponse?: (
    response: Result<Data>,
    options: { baseUrl: string; init?: RequestInit },
  ) => unknown;
};

export type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ResponseError };

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

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type ExtractFunction<T> = Extract<T, (...args: any) => any>;

export type Format<T, ResponseFormat> = T extends (
  ...args: infer P
) => Promise<infer D>
  ? P extends [body?: infer Body, options?: infer Options]
    ? unknown extends Options
      ? (options?: P[0]) => Promise<FormatResponse<ResponseFormat, D>>
      : (
          body?: Body,
          options?: Options,
        ) => Promise<FormatResponse<ResponseFormat, D>>
    : (options?: P[0]) => Promise<FormatResponse<ResponseFormat, D>>
  : T extends (...args: infer P) => infer R
    ? (params: P[0]) => Format<R, ResponseFormat>
    : {
        [K in keyof T]: T[K] extends object
          ? ExtractFunction<T[K]> extends never
            ? Format<Pick<T[K], keyof T[K]>, ResponseFormat>
            : // biome-ignore lint/complexity/noBannedTypes: <explanation>
              {} extends Pick<T[K], keyof T[K]>
              ? Format<ExtractFunction<T[K]>, ResponseFormat>
              : Format<Pick<T[K], keyof T[K]>, ResponseFormat> &
                  UnionToIntersection<
                    Format<ExtractFunction<T[K]>, ResponseFormat>
                  >
          : T[K];
      };
