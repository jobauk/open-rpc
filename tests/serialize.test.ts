import { expect, test } from "bun:test";
import {
  getNameAndValue,
  isPrimitive,
  isPrimitivesArray,
  isPrimitivesObject,
  isPrimitivesWithArrayObject,
  serializeLabel,
  serializeMatrix,
  serializePath,
  serializeSearchParams,
  serializeSimple,
} from "../src/fetch/serialize";

const primitive = { id: 5 };
const array = { id: [3, 4, 5] };
const object = {
  id: { role: "admin", firstName: "Alex" },
};

test("is primitive", () => {
  expect(isPrimitive(null)).toBe(true);
  expect(isPrimitive("hello")).toBe(true);
  expect(isPrimitive(5)).toBe(true);
  expect(isPrimitive(true)).toBe(true);
  expect(isPrimitive(false)).toBe(true);
  expect(isPrimitive(Symbol("hello"))).toBe(true);
  expect(isPrimitive(BigInt(10))).toBe(true);
  expect(isPrimitive(undefined)).toBe(false);
  expect(isPrimitive({})).toBe(false);
  expect(isPrimitive([])).toBe(false);
});

test("is primitives array", () => {
  const truthy = [null, "hello", 5, true, false, Symbol("hello"), BigInt(10)];
  const falsy = [{}, [], new Date(), new Error()];

  expect(isPrimitivesArray(truthy)).toBe(true);
  expect(isPrimitivesArray(falsy)).toBe(false);
});

test("is primitives object", () => {
  const truthy = {
    id: 5,
    0: BigInt(10),
    items: null,
  };
  const falsy = {
    [Symbol("hello")]: "world",
    user: {
      id: null,
      age: 10,
    },
  };

  expect(isPrimitivesObject(truthy)).toBe(true);
  expect(isPrimitivesObject(falsy)).toBe(false);
});

test("is primitives object with array", () => {
  const truthy = {
    id: 5,
    0: BigInt(10),
    items: [null, 5, "hello"],
  };
  const falsy = {
    [Symbol("hello")]: "world",
    user: {
      id: null,
      age: 10,
    },
    items: [null, 5, "hello"],
  };

  expect(isPrimitivesWithArrayObject(truthy)).toBe(true);
  expect(isPrimitivesWithArrayObject(falsy)).toBe(false);
});

test("get name and value", () => {
  // @ts-ignore
  expect(getNameAndValue(5)).toEqual([null, 5]);
  // @ts-ignore
  expect(getNameAndValue([5])).toEqual([null, [5]]);
  // @ts-ignore
  expect(getNameAndValue({ id: 5 })).toEqual(["id", 5]);
  // @ts-ignore
  expect(getNameAndValue(undefined)).toEqual([null, null]);
});

test("simple serialization", () => {
  expect(serializeSimple(primitive, false)).toBe("5");
  expect(serializeSimple(array, false)).toBe("3,4,5");
  expect(serializeSimple(object, false)).toBe("role,admin,firstName,Alex");
});

test("simple serialization with explode", () => {
  expect(serializeSimple(primitive, true)).toBe("5");
  expect(serializeSimple(array, true)).toBe("3,4,5");
  expect(serializeSimple(object, true)).toBe("role=admin,firstName=Alex");
});

test("label serialization", () => {
  expect(serializeLabel(primitive, false)).toBe(".5");
  expect(serializeLabel(array, false)).toBe(".3,4,5");
  expect(serializeLabel(object, false)).toBe(".role,admin,firstName,Alex");
});

test("label serialization with explode", () => {
  expect(serializeLabel(primitive, true)).toBe(".5");
  expect(serializeLabel(array, true)).toBe(".3.4.5");
  expect(serializeLabel(object, true)).toBe(".role=admin.firstName=Alex");
});

test("matrix serialization", () => {
  expect(serializeMatrix(primitive, false)).toBe(";id=5");
  expect(serializeMatrix(array, false)).toBe(";id=3,4,5");
  expect(serializeMatrix(object, false)).toBe(";id=role,admin,firstName,Alex");
});

test("matrix serialization with explode", () => {
  expect(serializeMatrix(primitive, true)).toBe(";id=5");
  expect(serializeMatrix(array, true)).toBe(";id=3;id=4;id=5");
  expect(serializeMatrix(object, true)).toBe(";role=admin;firstName=Alex");
});

test("path serialization", () => {
  expect(
    serializePath([
      "users",
      {
        userId: 12345,
      },
      {
        fields: ["name", "age"],
      },
    ]),
  ).toBe("/users/12345/name,age");

  expect(
    serializePath([
      "users",
      "*",
      {
        user: {
          role: "admin",
          firstName: "Alex",
        },
      },
    ]),
  ).toBe("/users/role=admin,firstName=Alex");

  expect(
    serializePath([
      "video",
      {
        segmentId: 12345,
      },
      "~.",
      {
        container: "mkv",
      },
    ]),
  ).toBe("/video/12345.mkv");

  expect(
    serializePath([
      "users",
      {
        userId: 12345,
      },
      ";",
      {
        fields: ["name", "age"],
      },
    ]),
  ).toBe("/users/12345/;fields=name,age");
});

test("serialize search params", () => {
  expect(
    serializeSearchParams({
      userId: 123,
      items: [1, 2, 3],
      data: {
        name: "John",
        age: 30,
      },
    }),
  ).toBe("?userId=123&items=1%2C2%2C3&name=John&age=30");
});
