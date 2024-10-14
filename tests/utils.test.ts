import { expect, test } from "bun:test";
import {
  BaseError,
  ResponseError,
  ensureError,
  isBaseError,
  isJsonable,
  isResponseError,
} from "../src/fetch/utils";

const jsonablePrimitive = 1;
const nonJsonablePrimitive = undefined;
const jsonableArray = [1, 2, 3];
const nonJsonableArray = [{}, []];
const jsonableObject = { a: 1, b: 2, c: 3 };
const nonJsonableObject = { a: {}, b: [] };

test("is jsonable", () => {
  expect(isJsonable(jsonablePrimitive)).toBe(true);
  expect(isJsonable(nonJsonablePrimitive)).toBe(false);
  expect(isJsonable(jsonableArray)).toBe(true);
  expect(isJsonable(nonJsonableArray)).toBe(false);
  expect(isJsonable(jsonableObject)).toBe(true);
  expect(isJsonable(nonJsonableObject)).toBe(false);
});

test("ensure error", () => {
  expect(ensureError(new Error())).toBeInstanceOf(Error);

  const baseError = ensureError(new BaseError("This is a BaseError"));
  expect(isBaseError(baseError)).toBe(true);
  expect(baseError).toBeInstanceOf(BaseError);

  const responseError: ResponseError = ensureError(
    new ResponseError("Something went wrong. Try again later.", {
      context: null,
      response: Response.error(),
    }),
  );
  expect(isResponseError(responseError)).toBe(true);
  expect(responseError).toBeInstanceOf(ResponseError);
  expect(responseError.response).toBeInstanceOf(Response);

  expect(ensureError(1).message).toBe(
    "This value was thrown as is, not through an Error: 1",
  );
  expect(ensureError(BigInt(123)).message).toBe(
    "This value was thrown as is, not through an Error: [Unable to stringify the thrown value]",
  );
});
