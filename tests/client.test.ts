import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { createClient } from "../src/fetch/client";
import { serializePath, serializeSearchParams } from "../src/fetch/serialize";

let originalFetch: typeof fetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = mock((req) => req);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

mock.module("../src/fetch/client", () => ({
  handleFetch: (req: Request) => req,
}));

test("simple client", async () => {
  const client = createClient("http://localhost:3000")();

  const request: Request = await client.users({ userId: 1 }).items.get();

  expect(request.url).toBe("http://localhost:3000/users/1/items");
  expect(request.headers.get("content-type")).toBe("application/json");
});

test("client with default headers", async () => {
  const client = createClient("http://localhost:3000")({
    headers: {
      Authorization: "Bearer 123",
    },
  });

  const request: Request = await client.users({ userId: 1 }).items.get();

  expect(request.url).toBe("http://localhost:3000/users/1/items");
  expect(request.headers.get("content-type")).toBe("application/json");
  expect(request.headers.get("authorization")).toBe("Bearer 123");
});

test("client with headers array", async () => {
  const client = createClient("http://localhost:3000")({
    headers: [
      {
        Authorization: "Bearer 123",
      },
    ],
  });

  const request = await client.users({ userId: 1 }).get();

  expect(request.url).toBe("http://localhost:3000/users/1");
  expect(request.headers.get("content-type")).toBe("application/json");
  expect(request.headers.get("authorization")).toBe("Bearer 123");
});

test("client with dynamic headers", async () => {
  const client = createClient("http://localhost:3000")({
    headers: (path) => {
      if (path.startsWith("/users")) {
        return {
          Authorization: "Bearer 123",
        };
      }
    },
  });

  const request1: Request = await client.users({ userId: 1 }).items.get();

  expect(request1.url).toBe("http://localhost:3000/users/1/items");
  expect(request1.headers.get("content-type")).toBe("application/json");
  expect(request1.headers.get("authorization")).toBe("Bearer 123");

  const request2: Request = await client.items.new.get();

  expect(request2.url).toBe("http://localhost:3000/items/new");
  expect(request2.headers.get("content-type")).toBe("application/json");
  expect(request2.headers.get("authorization")).toBe(null);
});

test("client with headers set on request", async () => {
  const client = createClient("http://localhost:3000")();

  const request: Request = await client.users({ userId: 1 }).items.get({
    headers: {
      "X-Custom": "123",
    },
  });

  expect(request.url).toBe("http://localhost:3000/users/1/items");
  expect(request.headers.get("content-type")).toBe("application/json");
  expect(request.headers.get("X-Custom")).toBe("123");
});

test("client with middleware", async () => {
  const client = createClient("http://localhost:3000")({
    middleware: {
      onRequest(req) {
        req.headers.set("X-Custom", "123");
        return req;
      },
    },
  });

  const request: Request = await client.users({ userId: 1 }).items.get();

  expect(request.url).toBe("http://localhost:3000/users/1/items");
  expect(request.headers.get("content-type")).toBe("application/json");
  expect(request.headers.get("X-Custom")).toBe("123");
});

test("client with generator function", async () => {
  const client = createClient("http://localhost:3000")({
    generators: {
      batch(endpoints) {
        const requests: unknown[] = [];
        let i = 0;
        for (const {
          path,
          args: [_, options],
        } of endpoints) {
          // biome-ignore lint/style/noNonNullAssertion: <explanation>
          const method = path.pop()!.toString().toUpperCase();

          requests.push({
            method,
            name: i,
            relative_url:
              `${serializePath(path)}${serializeSearchParams(options?.query)}`.replace(
                /\$\..*\.\w*/,
                `{result=${i - 1}:$&}`,
              ),
          });
          i++;
        }

        return new Request(
          `http://localhost:3000?batch=${JSON.stringify(requests)}`,
          { method: "POST" },
        );
      },
    },
  });

  const request: Request = await client.batch(
    client.me.get(),
    client.account({ accountId: "$.data.id" }).get(),
  );

  expect(request.url).toBe(
    "http://localhost:3000/?batch=[{%22method%22:%22GET%22,%22name%22:0,%22relative_url%22:%22/me%22},{%22method%22:%22GET%22,%22name%22:1,%22relative_url%22:%22/account/{result=0:$.data.id}%22}]",
  );
  expect(request.headers.get("content-type")).toBe("application/json");
  expect(request.method).toBe("POST");
});

test("Promise.resolve", async () => {
  const client = createClient("http://localhost:3000")();

  const request: Request = await Promise.resolve(
    client.users({ userId: 1 }),
  ).then((user) => user.items.get());

  expect(request.url).toBe("http://localhost:3000/users/1/items");
});
