import { expect, test } from "bun:test";
import {
  handleApplication,
  handleMultiPart,
  isNumericString,
  isStringifiedObject,
  parseStringifiedDate,
  parseStringifiedObject,
  parseStringifiedValue,
  unwrapResponse,
} from "../src/fetch/unwrap";

test("is numeric string", () => {
  expect(isNumericString("123")).toBe(true);
  expect(isNumericString("123.45")).toBe(true);
  expect(isNumericString("123abc")).toBe(false);
  expect(isNumericString("")).toBe(false);
});

test("parse non date", () => {
  expect(parseStringifiedDate("not a date")).toBeNull();
});

test("parse ISO8601 date", () => {
  const ISO8601_DATE = "2024-11-10T06:13:40.799Z";

  expect(parseStringifiedDate(ISO8601_DATE)).toEqual(new Date(ISO8601_DATE));
});

test("parse formal date", () => {
  const RFC_DATE_BST =
    "Mon Sep 25 2023 14:30:45 GMT+0100 (British Summer Time)";
  const RFC_DATE_EST =
    "Fri Jan 12 2024 09:15:30 GMT-0500 (Eastern Standard Time)";
  const RFC_DATE_IST =
    "Wed Dec 01 2021 23:59:59 GMT+0530 (India Standard Time)";
  const RFC_DATE_UTC = "Tue Jul 04 2023 00:00:00 GMT+0000 (UTC)";
  const RFC_DATE_CET =
    "Sun Nov 20 2022 18:45:00 GMT+0200 (Central European Time)";

  expect(parseStringifiedDate(RFC_DATE_BST)).toEqual(new Date(RFC_DATE_BST));
  expect(parseStringifiedDate(RFC_DATE_EST)).toEqual(new Date(RFC_DATE_EST));
  expect(parseStringifiedDate(RFC_DATE_IST)).toEqual(new Date(RFC_DATE_IST));
  expect(parseStringifiedDate(RFC_DATE_UTC)).toEqual(new Date(RFC_DATE_UTC));
  expect(parseStringifiedDate(RFC_DATE_CET)).toEqual(new Date(RFC_DATE_CET));
});

test("parse shorten date", () => {
  const DATE_YYYYMMDD_NO_TIME = "2023-12-25";
  // const DATE_MMDDYYYY_NO_TIME = "12-31-2022";
  const DATE_YYYYMMDD_SPACE_SEPARATED = "2022 12 31";
  const DATE_YYYYMMDD_WITH_TIME_SECONDS = "2022-12-31 10:45:30 PM";
  const DATE_DDMMYYYY_WITH_TIME_NO_SECONDS = "01-01-2020 12:00 PM";

  expect(parseStringifiedDate(DATE_YYYYMMDD_NO_TIME)).toEqual(
    new Date(DATE_YYYYMMDD_NO_TIME),
  );
  // expect(parseStringifiedDate(DATE_MMDDYYYY_NO_TIME)).toEqual(
  //   new Date(DATE_MMDDYYYY_NO_TIME),
  // );
  expect(parseStringifiedDate(DATE_YYYYMMDD_SPACE_SEPARATED)).toEqual(
    new Date(DATE_YYYYMMDD_SPACE_SEPARATED),
  );
  expect(parseStringifiedDate(DATE_YYYYMMDD_WITH_TIME_SECONDS)).toEqual(
    new Date(DATE_YYYYMMDD_WITH_TIME_SECONDS),
  );
  expect(parseStringifiedDate(DATE_DDMMYYYY_WITH_TIME_NO_SECONDS)).toEqual(
    new Date(DATE_DDMMYYYY_WITH_TIME_NO_SECONDS),
  );
});

test("is stringified object", () => {
  expect(isStringifiedObject("{}")).toBe(true);
  expect(isStringifiedObject("[]")).toBe(true);
  expect(isStringifiedObject("()")).toBe(false);
  expect(isStringifiedObject("true")).toBe(false);
  expect(isStringifiedObject("null")).toBe(false);
  expect(isStringifiedObject("123")).toBe(false);
  expect(isStringifiedObject("abc")).toBe(false);
});

const object = {
  count: 580,
  updatedAt: new Date("2024-11-10T06:13:40.799Z"),
  inStock: true,
  variants: [
    {
      id: "707586590298831235",
      color: "red",
      price: 100,
      updatedAt: new Date("2024-11-10T06:13:40.799Z"),
    },
    {
      id: "126979497651658654",
      color: "blue",
      price: 70,
      updatedAt: new Date("2024-08-16T09:15:59.379Z"),
    },
  ],
};

const stringifiedObject = `{
  "count": "580",
  "updatedAt": "2024-11-10T06:13:40.799Z",
  "inStock": true,
  "variants": [
    {
      "id": "707586590298831235",
      "color": "red",
      "price": "100",
      "updatedAt": "2024-11-10T06:13:40.799Z"
    },
    {
      "id": "126979497651658654",
      "color": "blue",
      "price": "70",
      "updatedAt": "2024-08-16T09:15:59.379Z"
    }
  ]
}`;

test("parse stringified object", () => {
  expect(
    parseStringifiedObject(stringifiedObject) as unknown as typeof object,
  ).toEqual(object);

  expect(parseStringifiedObject({})).toBeUndefined();
});

test("parse stringified value", () => {
  expect(parseStringifiedValue(undefined)).toBe("");
  expect(parseStringifiedValue("")).toBe("");
  expect(parseStringifiedValue("123")).toBe(123);
  expect(parseStringifiedValue("12345678910111213")).toBe("12345678910111213");
  expect(parseStringifiedValue("true")).toBe(true);
  expect(parseStringifiedValue("false")).toBe(false);
  expect(parseStringifiedValue("2024-08-16T09:15:59.379Z")).toEqual(
    new Date("2024-08-16T09:15:59.379Z"),
  );
  expect(parseStringifiedValue(stringifiedObject)).toEqual(object);
  expect(parseStringifiedValue("{ item: }")).toEqual("{ item: }");
});

test("parse application/* data", async () => {
  const responseJson = new Response(`{ "userId": "123" }`);
  expect((await handleApplication(responseJson, "json")) as unknown).toEqual({
    userId: 123,
  });

  const responseArrayBuffer = new Response(new Uint8Array(10));
  expect(
    (await handleApplication(responseArrayBuffer, "octet-stream")) as unknown,
  ).toEqual(new ArrayBuffer(10));

  const responseTEXT = new Response("Hello, world!");
  expect(await handleApplication(responseTEXT, "text")).toEqual(
    "Hello, world!",
  );
});

function createBoundary() {
  return `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`;
}

test("parse multipart/* data", async () => {
  const boundary = createBoundary();
  const formData = `--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\n123\r\n--${boundary}--\r\n`;

  const responseFormData = new Response(formData, {
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  });
  expect(
    (await handleMultiPart(responseFormData, "form-data")) as unknown,
  ).toEqual({
    userId: 123,
  });
});

test("unwrap application response", async () => {
  const response = new Response(`{ "userId": "123" }`, {
    headers: { "content-type": "application/json" },
  });

  expect((await unwrapResponse(response)) as unknown).toEqual({
    userId: 123,
  });
});

test("unwrap audio response", async () => {
  const file = Bun.file("tests/big-buck-bunny.mp3");
  const response = new Response(file, {
    headers: { "content-type": "audio/mp3" },
  });

  expect(await unwrapResponse(response)).toEqual(
    new Blob([await file.arrayBuffer()]),
  );
});

test("unwrap image response", async () => {
  const file = Bun.file("tests/blue.png");
  const response = new Response(file, {
    headers: { "content-type": "image/png" },
  });

  expect(await unwrapResponse(response)).toEqual(
    new Blob([await file.arrayBuffer()]),
  );
});

test("unwrap multipart response", async () => {
  const boundary = createBoundary();
  const formData = `--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\n123\r\n--${boundary}--\r\n`;

  const response = new Response(formData, {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  });

  expect(await unwrapResponse(response)).toEqual({
    userId: 123,
  });
});

test("unwrap text response", async () => {
  const response = new Response("Hello world!", {
    headers: { "content-type": "text/plain" },
  });

  expect(await unwrapResponse(response)).toEqual("Hello world!");
});

test("unwrap video response", async () => {
  const file = Bun.file("tests/big-buck-bunny.mp4");
  const response = new Response(file, {
    headers: { "content-type": "video/mp4" },
  });

  expect(await unwrapResponse(response)).toEqual(
    new Blob([await file.arrayBuffer()]),
  );
});

test("unwrap unknown response", async () => {
  const response = new Response("userId=123", {
    headers: { "content-type": "x-www-form-urlencoded" },
  });

  expect(await unwrapResponse(response)).toEqual("userId=123");
});
