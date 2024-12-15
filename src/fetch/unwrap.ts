import type { Jsonable } from "./utils";

const isISO8601 =
  /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
const isFormalDate =
  /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s\d{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT(?:\+|-)\d{4}\s\([^)]+\)/;
const isShortenDate =
  /^(?:(?:(?:(?:0?[1-9]|[12][0-9]|3[01])[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:19|20)\d{2})|(?:(?:19|20)\d{2}[/\s-](?:0?[1-9]|1[0-2])[/\s-](?:0?[1-9]|[12][0-9]|3[01]))))(?:\s(?:1[012]|0?[1-9]):[0-5][0-9](?::[0-5][0-9])?(?:\s[AP]M)?)?$/;

export function parseStringifiedDate(value: string) {
  const temp = value.replace(/"/g, "");

  if (
    isISO8601.test(temp) ||
    isFormalDate.test(temp) ||
    isShortenDate.test(temp)
  ) {
    const date = new Date(temp);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

export function parseStringifiedValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const _value = value.trim();

  if (!_value) {
    return "";
  }

  if (_value === "true") {
    return true;
  }

  if (_value === "false") {
    return false;
  }

  if (_value === "null") {
    return null;
  }

  const number = Number(_value);
  if (!Number.isNaN(number)) {
    if (number > Number.MAX_SAFE_INTEGER || number < Number.MIN_SAFE_INTEGER) {
      return _value;
    }

    return number;
  }

  const date = parseStringifiedDate(_value);

  if (date) {
    return date;
  }

  return value;
}

export function parseStringifiedObject(data: unknown) {
  if (typeof data !== "string") {
    return;
  }

  return JSON.parse(data, (_, value) => {
    switch (typeof value) {
      case "boolean":
        return value;
      case "number":
        return value;
      case "object":
        return value;
      case "string":
        return parseStringifiedValue(value);
      default:
        return value;
    }
  });
}

export function isStringifiedObject(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const start = value.charCodeAt(0);
  const end = value.charCodeAt(value.length - 1);

  return (start === 123 && end === 125) || (start === 91 && end === 93);
}

export async function handleApplication(res: Response, type: string) {
  switch (true) {
    case type.endsWith("json"):
      return await res.text().then(parseStringifiedObject);
    case type.endsWith("octet-stream"):
      return await res.arrayBuffer();
    default:
      return await res.text();
  }
}

export async function handleMultiPart(res: Response, type: string) {
  switch (true) {
    case type.endsWith("form-data"): {
      const formData = await res.formData();
      const data: Record<string, ReturnType<typeof parseStringifiedValue>> = {};
      for (const [key, value] of formData.entries()) {
        data[key] = parseStringifiedValue(value);
      }
      return data;
    }
  }
}

export async function unwrapResponse(
  res: Response,
): Promise<
  | Jsonable
  | ArrayBuffer
  | Blob
  | Record<string, ReturnType<typeof parseStringifiedValue>>
  | object
> {
  const [group, type] = res.headers
    .get("content-type")
    ?.split(";")[0]
    ?.split("/") || ["application", "json"];

  switch (group) {
    case "application":
      return handleApplication(res, type);
    case "audio":
      return await res.blob();
    case "image":
      return await res.blob();
    case "multipart":
      return handleMultiPart(res, type);
    case "text":
      return await res.text().then(parseStringifiedValue);
    case "video":
      return await res.blob();
    default:
      return await res.text().then(parseStringifiedValue);
  }
}
