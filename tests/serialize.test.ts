import { expect, test } from "vitest";
import {
  serializeLabel,
  serializeMatrix,
  serializePath,
  serializeSimple,
} from "../src/fetch/serialize";

const primitive = { id: 5 };
const array = { id: [3, 4, 5] };
const object = {
  id: { role: "admin", firstName: "Alex" },
};

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
});
