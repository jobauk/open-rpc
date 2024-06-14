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

export type RequireExactlyOne<
  ObjectType,
  KeysType extends keyof ObjectType = keyof ObjectType,
> = {
  [Key in KeysType]: Required<Pick<ObjectType, Key>> &
    Partial<Record<Exclude<KeysType, Key>, never>>;
}[KeysType] &
  Omit<ObjectType, KeysType>;

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

export type GetDeep<TObject, TPath extends string> = TObject extends Record<
  string | number,
  unknown
>
  ? TPath extends `${infer TPrefix}.${infer TSuffix}`
    ? TPrefix extends keyof TObject
      ? GetDeep<TObject[TPrefix], TSuffix>
      : TPrefix extends `${number}`
        ? GetDeep<TObject[Extract<keyof TObject, number>], TSuffix>
        : never
    : TPath extends keyof TObject
      ? TObject[TPath]
      : TPath extends `${number}`
        ? TObject[Extract<keyof TObject, number>]
        : TPath extends `${string}`
          ? TObject[Extract<keyof TObject, string>]
          : never
  : never;

export type RemoveLeadingSlash<out T extends object> = {
  [K in keyof T as K extends `/${infer P}` ? P : K]: T[K];
};

export type PrepareParams<T extends LooseRecord> = {
  [K in keyof T as K extends `${infer Path}.{${infer Param}}`
    ? `${Path}/./{${Param}}`
    : K extends `${infer Path}.${infer Extension}`
      ? `${Path}/.${Extension}`
      : K]: T[K];
};

export type CreateHttpMethod<
  Method extends HttpMethod,
  Body,
  Parameters extends Record<string, unknown>,
  ReturnType extends Record<number, unknown>,
> = Method extends "get" | "head" | "options" | "trace"
  ? (options?: {
      $query?: Parameters;
      $headers?: HeadersInit;
    }) => Promise<ReturnType>
  : (
      body?: null | Body,
      options?: {
        $query?: Parameters;
        $headers?: HeadersInit;
      },
    ) => Promise<ReturnType>;

export type SchemaConfig = {
  bodyTypeKey: string;
  parameterTypeKey: string;
  responseTypeKey: string;
};

export type Sign<
  in out T extends LooseRecord,
  Config extends SchemaConfig = {
    bodyTypeKey: `requestBody.content.${string}`;
    parameterTypeKey: "parameters.query";
    responseTypeKey: `responses.${number}.content.${string}`;
  },
> = {
  [K in keyof T as K extends `{${string}}` ? never : K]: K extends HttpMethod
    ? CreateHttpMethod<
        K,
        GetDeep<T[K], Config["bodyTypeKey"]>,
        GetDeep<T[K], Config["parameterTypeKey"]> | Record<string, unknown>,
        Prettify<GetDeep<T[K], Config["responseTypeKey"]>>
      >
    : CreateParams<T[K]>;
};

export type CreateParams<Route extends LooseRecord> = Extract<
  keyof Route,
  `{${string}}`
> extends infer Path extends string
  ? IsNever<Path> extends true
    ? Prettify<Sign<Route>>
    : ((
        params: Prettify<
          RequireExactlyOne<{
            [param in Path extends `{${infer Param}}` ? Param : never]:
              | string
              | number;
          }>
        >,
      ) => Prettify<Sign<Route[Path]>> &
        CreateParams<UnionToIntersection<Route[Path]>>) &
        Prettify<Sign<Route>>
  : never;

export type CreateApiSpec<T extends object> = Prettify<
  Sign<Unflatten<PrepareParams<RemoveLeadingSlash<T>>>>
>;
