import {
  isPrimitive,
  isPrimitivesArray,
  isPrimitivesObject,
} from "./serialize";

export type Jsonable =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly Jsonable[]
  | { readonly [key: string]: Jsonable }
  | { toJSON(): Jsonable };

export function isJsonable(value: unknown): value is Jsonable {
  if (isPrimitive(value)) {
    return true;
  }

  if (isPrimitivesArray(value)) {
    return true;
  }

  if (isPrimitivesObject(value)) {
    return true;
  }

  if (
    value &&
    typeof value === "object" &&
    Object.hasOwn(value, "toJSON") &&
    typeof (value as { toJSON(): Jsonable }).toJSON === "function"
  ) {
    return true;
  }

  return false;
}

export type ErrorOptions = { cause?: Error; context?: Jsonable };

export class BaseError extends Error {
  public readonly context?: Jsonable;

  constructor(message: string, options: ErrorOptions = {}) {
    const { cause, context } = options;

    super(message, { cause });
    this.name = this.constructor.name;
    this.context = context;
  }
}

export class ResponseError extends BaseError {
  public readonly response?: Response;

  constructor(
    message: string,
    options: ErrorOptions & { response?: Response },
  ) {
    const { cause, context, response } = options;

    super(message, { cause, context });
    this.name = this.constructor.name;
    this.response = response;
  }
}

export function ensureError(value: unknown): BaseError | ResponseError {
  if (value instanceof Error) {
    return value;
  }

  let stringified = "[Unable to stringify the thrown value]";
  try {
    stringified = JSON.stringify(value);
  } catch {}

  const error = new BaseError(
    `This value was thrown as is, not through an Error: ${stringified}`,
  );
  return error;
}

export function isBaseError(error?: Error | null): error is BaseError {
  return error instanceof BaseError;
}

export function isResponseError(error?: Error | null): error is ResponseError {
  return error instanceof ResponseError;
}
