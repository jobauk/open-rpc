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

// Utilities
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type ParentOf<T> = T extends `${infer Parent}/${string}` ? Parent : never;
type ChildOf<T> = T extends `${string}/${infer Child}` ? Child : never;

type Unflatten<T> = {
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

type CamelToSnake<T extends string> = string extends T
  ? string
  : T extends `${infer C0}${infer R}`
    ? `${C0 extends Lowercase<C0> ? "" : "_"}${Lowercase<C0>}${CamelToSnake<R>}`
    : "";

type CamelKeysToSnakeDeep<T> = T extends object
  ? T extends Array<infer U>
    ? {
        [K in keyof U as K extends string
          ? CamelToSnake<K>
          : K]: CamelKeysToSnakeDeep<U[K]>;
      }[]
    : {
        [K in keyof T as K extends string
          ? CamelToSnake<K>
          : K]: CamelKeysToSnakeDeep<T[K]>;
      }
  : T;

type RemoveLeadingSlash<T> = {
  [K in keyof T as K extends `/${infer P}` ? P : K]: T[K];
};

type TransformPath<T> = T extends `${infer Parent}/${infer Child}`
  ? Parent extends `${number}`
    ? Child extends `{${infer Param}}${infer Rest}`
      ? TransformPath<`${Parent}/:${Param}${Rest}`>
      : `${Parent}/${TransformPath<Child>}`
    : Child extends `{${infer Param}}${infer Rest}`
      ? TransformPath<`${Parent}:${Param}${Rest}`>
      : `${Parent}/${TransformPath<Child>}`
  : T;

type TransformPaths<T> = {
  [K in keyof T as TransformPath<K>]: T[K];
};

type RequiredResponse<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends Array<infer U>
    ? Prettify<Required<U>>[]
    : T[K];
};

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends { [P in K]: T[K] } ? never : K;
}[keyof T];

type IsAllKeysOptional<T> = Extract<keyof T, RequiredKeys<T>> extends never
  ? true
  : false;

// Construct http method functions
type HttpMethodObject = {
  req?: Record<string, unknown>;
  res: Record<number, unknown>;
};

type PickSuccessResponse<T extends Record<number, unknown>> = T[keyof {
  [K in keyof T as K extends number
    ? `${K}` extends `${2 | 3}${number}`
      ? K
      : never
    : never]: T[K];
}];

type ExcludeEmpty<T> = T extends T
  ? // biome-ignore lint/complexity/noBannedTypes: <explanation>
    {} extends T
    ? Record<string, unknown>
    : T
  : never;

type CreateHttpMethodFunction<
  Body,
  QueryParams extends Record<string, unknown> | undefined,
  Result extends Record<PropertyKey, unknown>,
> = IsAllKeysOptional<QueryParams> extends true
  ? (
      body?: Body,
      init?: {
        $query?: ExcludeEmpty<QueryParams>;
        $headers?: HeadersInit;
      },
    ) => Promise<Prettify<Result>>
  : (
      body: Body,
      init: {
        $query: ExcludeEmpty<QueryParams>;
        $headers?: HeadersInit;
      },
    ) => Promise<Prettify<Result>>;

type ConstructHttpMethods<T> = T extends {
  [K in HttpMethod]?: HttpMethodObject;
}
  ? {
      [K in keyof T]: T[K] extends HttpMethodObject
        ? CreateHttpMethodFunction<
            null,
            T[K]["req"],
            RequiredResponse<PickSuccessResponse<T[K]["res"]>>
          >
        : ConstructHttpMethods<T[K]>;
    }
  : { [K in keyof T]: ConstructHttpMethods<T[K]> };

type ExtractParameterKey<T, Key> = T extends (
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  body: any,
  init: {
    $query: infer Q;
  },
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
) => any
  ? Key extends keyof Q
    ? Q[Key]
    : never
  : {
      [K in keyof T]: ExtractParameterKey<T[K], Key>;
    }[keyof T];

type OmitParameterKey<T, Key> = T extends (
  body: infer B,
  init: infer I,
) => infer R
  ? I extends {
      $query: Record<string, unknown>;
    }
    ? Key extends keyof I["$query"]
      ? Awaited<R> extends Record<PropertyKey, unknown>
        ? CreateHttpMethodFunction<
            B,
            Prettify<Omit<I["$query"], Key>>,
            Awaited<R>
          >
        : never
      : never
    : never
  : {
      [K in keyof T]: OmitParameterKey<T[K], Key>;
    };

type ReplacePathParemeters<T> = Extract<
  keyof T,
  `${string}:${string}`
> extends never
  ? {
      [K in keyof T]: T[K] extends (...args: infer P) => infer R
        ? (...args: P) => Promise<ReplacePathParemeters<Awaited<R>>>
        : ReplacePathParemeters<T[K]>;
    }
  : {
      [K in keyof T as K extends `${infer Path}:${string}`
        ? Path
        : K]: K extends `${string}:${infer Param}`
        ? (
            params: Prettify<
              Record<
                Param,
                Exclude<ExtractParameterKey<T[K], Param>, null | undefined>
              >
            >,
          ) => OmitParameterKey<T[K], Param>
        : T[K] extends (...args: infer P) => infer R
          ? (...args: P) => Promise<ReplacePathParemeters<Awaited<R>>>
          : ReplacePathParemeters<T[K]>;
    };

type IsUnionBetween<T, First, Second, U extends T = T> = Exclude<
  T,
  First | Second
> extends never
  ? Extract<T, First> extends never
    ? false
    : Extract<T, Second> extends never
      ? false
      : (
            T extends unknown
              ? [U] extends [T]
                ? false
                : true
              : never
          ) extends false
        ? false
        : true
  : false;

type UnionToIntersectionDeep<T> = IsUnionBetween<
  T,
  Record<PropertyKey, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  (...args: any) => any
> extends true
  ? // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    Exclude<T, (...args: any) => any> & Extract<T, (...args: any) => any>
  : {
      [K in keyof T]: T[K] extends (...args: infer P) => infer R
        ? (
            ...args: P
          ) => R extends Promise<infer U>
            ? Promise<UnionToIntersectionDeep<U>>
            : UnionToIntersectionDeep<R>
        : UnionToIntersectionDeep<T[K]>;
    };

export type CreateApiSpec<T extends Record<string, object>> =
  UnionToIntersectionDeep<
    ReplacePathParemeters<
      ConstructHttpMethods<
        CamelKeysToSnakeDeep<Unflatten<TransformPaths<RemoveLeadingSlash<T>>>>
      >
    >
  >;
