import type { ResponseError } from "./utils";

// Constants
type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace";

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type LooseRecord = Record<string, any>;

// Utilities
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type IsNever<T> = [T] extends [never] ? true : false;

export type IsNull<T> = [T] extends [null] ? true : false;

export type IsUnknown<T> = unknown extends T // `T` can be `unknown` or `any`
  ? IsNull<T> extends false // `any` can be `null`, but `unknown` can't be
    ? true
    : false
  : false;

type UnionToIntersection<Union> = (
  Union extends unknown
    ? (distributedUnion: Union) => void
    : never
) extends (mergedIntersection: infer Intersection) => void
  ? Intersection & Union
  : never;

type ParentOf<T> = T extends `${infer Parent}/${string}` ? Parent : never;
type ChildOf<T> = T extends `${string}/${infer Child}` ? Child : never;

export type Unflatten<T> = {
  [Property in keyof T as Exclude<
    Property,
    `${string}/${string}`
  >]: T[Property];
} & {
  [Property in keyof T as ParentOf<Property>]: Prettify<
    Unflatten<{
      [ChildProperty in ChildOf<Property>]: T[`${ParentOf<Property>}/${ChildProperty}` &
        keyof T];
    }>
  >;
};

type Primitive = null | undefined | string | number | boolean | symbol | bigint;

type LiteralCheck<T, LiteralType extends Primitive> = IsNever<T> extends false
  ? [T] extends [LiteralType & infer U]
    ? [U] extends [LiteralType]
      ? [LiteralType] extends [U]
        ? false
        : true
      : false
    : false
  : false;

type IsStringLiteral<T> = LiteralCheck<T, string>;
type IsNumberLiteral<T> = LiteralCheck<T, number>;

type PrivateGetDeep<
  TObject,
  TPath extends string,
  Depth extends number = 15,
> = Depth extends 0
  ? never
  : TObject extends Record<string | number, unknown>
    ? TPath extends `${infer TPrefix}/${infer TSuffix}`
      ? TPrefix extends keyof TObject
        ? PrivateGetDeep<TObject[TPrefix], TSuffix, Decrement<Depth>>
        : TPrefix extends `${number}`
          ? IsNumberLiteral<TPrefix> extends true
            ? never
            : PrivateGetDeep<
                TObject[Extract<keyof TObject, number>],
                TSuffix,
                Decrement<Depth>
              >
          : never
      : TPath extends keyof TObject
        ? TObject[TPath]
        : TPath extends ""
          ? TObject
          : TPath extends `${infer Num extends number}`
            ? IsNumberLiteral<Num> extends true
              ? Num extends keyof TObject
                ? TObject[Num]
                : never
              : TObject[Extract<keyof TObject, number>]
            : TPath extends string
              ? IsStringLiteral<TPath> extends true
                ? never
                : TObject[Extract<keyof TObject, string>]
              : never
    : never;

export type GetDeep<TObject, TPath extends string> = PrivateGetDeep<
  TObject,
  TPath
>;

export type RemoveLeadingSlash<in out T extends object> = {
  [K in keyof T as K extends `/${infer P}` ? P : K]: T[K];
};

type CreateParam<
  T extends string,
  Delimiter extends string,
> = T extends `${infer Operator}${Delimiter}{${infer Param}}${infer Modifier extends "*" | ""}`
  ? `${Operator}${Operator extends "" ? "" : "/"}~${Delimiter}${Modifier}/{${Param}}`
  : T extends `${infer Head}${Delimiter}${infer Tail}`
    ? `${Head}/~${Delimiter}/${Tail}`
    : T;

export type CreateMaybeParam<T extends string> = T extends `${string}.${string}`
  ? CreateParam<T, ".">
  : T extends `${string};${string}`
    ? CreateParam<T, ";">
    : T;

export type TransformPath<T extends string> =
  T extends `${infer Segment}/${infer Rest}`
    ? `${CreateMaybeParam<Segment>}/${TransformPath<Rest>}`
    : CreateMaybeParam<T>;

export type PrepareParams<in out T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? TransformPath<K> : never]: T[K];
};

export type Success<in out T extends Record<number, unknown>> = {
  [K in keyof T as `${K extends number ? K : never}` extends `2${number}`
    ? K
    : never]: T[K];
};

export type Result<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: ResponseError };

export type CreateHttpMethod<
  Method extends HttpMethod,
  Body,
  Parameters extends Record<string, unknown>,
  ReturnType extends Promise<unknown>,
> = Method extends "get" | "head" | "options" | "trace"
  ? (options?: {
      $query?: IsNever<Parameters> extends true
        ? Record<string, unknown>
        : Parameters & Record<string, unknown>;
      $headers?: HeadersInit;
    }) => ReturnType
  : (
      body?: null | Body,
      options?: {
        $query?: IsNever<Parameters> extends true
          ? Record<string, unknown>
          : Parameters & Record<string, unknown>;
        $headers?: HeadersInit;
      },
    ) => ReturnType;

export type SchemaConfig = {
  bodyTypeKey: string;
  searchParameterTypeKey: string;
  pathParameterTypeKey: string;
  responseTypeKey: string;
  responseValueTypeKey: string;
};

export type UnknownData = unknown & { __brand: "UnknownData" };

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;

type Decrement<N extends number> = [
  never,
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
][N];

type FindPathToKey<T, K extends string> = K extends keyof T
  ? Extract<keyof T, K>
  : T extends object
    ? {
        [P in Exclude<keyof T, K>]: `${P & string}/${FindPathToKey<T[P], K>}`;
      }[Exclude<keyof T, K>]
    : never;

type PrivatePathToUnknownData<
  T,
  Key extends keyof T = keyof T,
  Depth extends number = 5,
> = Depth extends 0
  ? never
  : T extends UnknownData
    ? null
    : Key extends keyof T
      ? Extract<T[Key], UnknownData> extends never
        ? Join<
            Key,
            PrivatePathToUnknownData<
              NonNullable<T[Key]>,
              keyof NonNullable<T[Key]>,
              Decrement<Depth>
            >
          >
        : Key
      : never;

export type PathToUnknownData<T> = PrivatePathToUnknownData<T> extends infer P
  ? P extends string
    ? P
    : IsNull<P> extends true
      ? null
      : never
  : never;

export type ReplaceDeep<
  T,
  Path extends string | null,
  Value,
  Depth extends number = 5,
> = Depth extends 0
  ? T
  : IsNever<Path> extends true
    ? T
    : IsNull<Path> extends true
      ? Value
      : Path extends `${infer Key}.${infer Rest}`
        ? {
            [K in keyof T]: K extends Key
              ?
                  | ReplaceDeep<
                      NonNullable<T[K]>,
                      Rest,
                      Value,
                      Decrement<Depth>
                    >
                  | Extract<T[K], null>
              : T[K];
          }
        : Path extends `${infer Key}`
          ? {
              [K in keyof T]: K extends Key
                ? Exclude<T[K], UnknownData> | Value
                : T[K];
            }
          : never;

export type Sign<
  T extends LooseRecord,
  Config extends SchemaConfig,
  TReturn,
> = Extract<keyof T, `{${string}}`> extends infer Path extends string
  ? IsNever<Path> extends true
    ? {
        [K in keyof T]: K extends HttpMethod
          ? CreateHttpMethod<
              K,
              GetDeep<T[K], Config["bodyTypeKey"]>,
              GetDeep<T[K], Config["searchParameterTypeKey"]>,
              Promise<
                IsNever<TReturn> extends true
                  ? Result<
                      GetDeep<
                        Success<GetDeep<T[K], Config["responseTypeKey"]>>,
                        Config["responseValueTypeKey"]
                      >
                    >
                  : ReplaceDeep<
                      TReturn,
                      PathToUnknownData<TReturn>,
                      GetDeep<
                        Success<GetDeep<T[K], Config["responseTypeKey"]>>,
                        Config["responseValueTypeKey"]
                      >
                    >
              >
            >
          : Sign<T[K], Config, TReturn>;
      }
    : Prettify<Sign<Omit<T, Extract<Path, `{${string}}`>>, Config, TReturn>> &
        UnionToIntersection<
          {
            [K in Path as K extends `{${string}}` ? K : never]: (
              params: K extends `{${infer Param}}`
                ? Prettify<
                    Pick<
                      GetDeep<
                        T[K],
                        `${FindPathToKey<T[K], HttpMethod>}/${Config["pathParameterTypeKey"]}`
                      >,
                      Param
                    >
                  >
                : never,
            ) => Sign<T[K], Config, TReturn>; // DO NOT PRETTIFY!
          }[Extract<Path, `{${string}}`>]
        >
  : never;

export type CreateApiSpec<
  in out T extends object,
  Config extends SchemaConfig,
  TReturn,
> = Prettify<
  Sign<Unflatten<PrepareParams<RemoveLeadingSlash<T>>>, Config, TReturn>
>;
