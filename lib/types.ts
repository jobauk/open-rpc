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

export type GetDeep<TObject, TPath extends string> = TObject extends Record<
  string | number,
  unknown
>
  ? TPath extends `${infer TPrefix}.${infer TSuffix}`
    ? TPrefix extends keyof TObject
      ? GetDeep<TObject[TPrefix], TSuffix>
      : TPrefix extends `${number}`
        ? IsNumberLiteral<TPrefix> extends true
          ? never
          : GetDeep<TObject[Extract<keyof TObject, number>], TSuffix>
        : never
    : TPath extends keyof TObject
      ? TObject[TPath]
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

export type RemoveLeadingSlash<in out T extends object> = {
  [K in keyof T as K extends `/${infer P}` ? P : K]: T[K];
};

export type PrepareParams<in out T extends LooseRecord> = {
  [K in keyof T as K extends `${infer Path}.{${infer Param}}`
    ? `${Path}/./{${Param}}`
    : K extends `${infer Path}.${infer Extension}`
      ? `${Path}/.${Extension}`
      : K]: T[K];
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
  parameterTypeKey: string;
  responseTypeKey: string;
  responseValueTypeKey: string;
};

export type Sign<T extends LooseRecord, Config extends SchemaConfig> = Extract<
  keyof T,
  `{${string}}`
> extends infer Path extends string
  ? IsNever<Path> extends true
    ? {
        [K in keyof T]: K extends HttpMethod
          ? CreateHttpMethod<
              K,
              GetDeep<T[K], Config["bodyTypeKey"]>,
              GetDeep<T[K], Config["parameterTypeKey"]>,
              Promise<
                Result<
                  GetDeep<
                    Success<GetDeep<T[K], Config["responseTypeKey"]>>,
                    Config["responseValueTypeKey"]
                  >
                >
              >
            >
          : Sign<T[K], Config>;
      }
    : Prettify<Sign<Omit<T, Extract<Path, `{${string}}`>>, Config>> &
        UnionToIntersection<
          {
            [K in Path as K extends `{${string}}` ? K : never]: (
              params: {
                [param in K extends `{${infer Param}}` ? Param : never]:
                  | string
                  | number;
              },
            ) => Sign<T[K], Config>; // DO NOT PRETTIFY!
          }[Extract<Path, `{${string}}`>]
        >
  : never;

export type CreateApiSpec<
  in out T extends object,
  Config extends SchemaConfig = {
    bodyTypeKey: `requestBody.content.${string}`;
    parameterTypeKey: "parameters.query";
    responseTypeKey: `responses`;
    responseValueTypeKey: `${number}.content.${string}`;
  },
> = Prettify<Sign<Unflatten<PrepareParams<RemoveLeadingSlash<T>>>, Config>>;
