import type { DefinedPrimitive, Segment } from "./types";

export function isPrimitive(v: unknown): v is DefinedPrimitive {
  return ["null", "string", "number", "boolean", "symbol", "bigint"].includes(
    typeof v,
  );
}

export function isPrimitivesArray(v: unknown): v is DefinedPrimitive[] {
  return Array.isArray(v) && v.every((v) => isPrimitive(v));
}

export function isPrimitivesObject(
  v: unknown,
): v is Record<string | number, DefinedPrimitive> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).every(
      (v) => typeof v === "string" || typeof v === "number",
    ) &&
    Object.values(v).every((v) => isPrimitive(v))
  );
}

export function isPrimitivesWithArrayObject(
  v: unknown,
): v is Record<string | number, DefinedPrimitive | DefinedPrimitive[]> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).every((v) => isPrimitive(v) || isPrimitivesArray(v))
  );
}

function getNameAndValue(
  value: Record<string, unknown>,
): [string | null, unknown] {
  if (isPrimitive(value)) {
    return [null, value];
  }
  if (Array.isArray(value)) {
    return [null, value];
  }
  if (value && typeof value === "object") {
    return Object.entries(value)[0];
  }
  return [null, null];
}

export function serializeSimple(
  value: Record<string, unknown>,
  explode: boolean,
) {
  const [_, _value] = getNameAndValue(value);

  if (isPrimitive(_value)) {
    return String(_value);
  }

  if (isPrimitivesArray(_value)) {
    return _value.join(",");
  }

  if (isPrimitivesObject(_value)) {
    const seperator = explode ? "=" : ",";
    return Object.entries(_value)
      .map(([key, _value]) => `${key}${seperator}${String(_value)}`)
      .join(",");
  }
}

export function serializeLabel(
  value: Record<string, unknown>,
  explode: boolean,
) {
  const [_, _value] = getNameAndValue(value);

  if (isPrimitive(_value)) {
    return `.${String(_value)}`;
  }

  const joinSeperator = explode ? "." : ",";

  if (isPrimitivesArray(_value)) {
    return `.${_value.join(joinSeperator)}`;
  }

  if (isPrimitivesObject(_value)) {
    const seperator = explode ? "=" : ",";
    return `.${Object.entries(_value)
      .map(([key, _value]) => `${key}${seperator}${String(_value)}`)
      .join(joinSeperator)}`;
  }
}

export function serializeMatrix(
  value: Record<string, unknown>,
  explode: boolean,
) {
  const [name, _value] = getNameAndValue(value);

  if (isPrimitive(_value)) {
    return `;${name}=${String(_value)}`;
  }

  if (isPrimitivesArray(_value)) {
    const joinSeperator = explode ? `;${name}=` : ",";
    return `;${name}=${_value.join(joinSeperator)}`;
  }

  if (isPrimitivesObject(_value)) {
    const entries = Object.entries(_value);
    const joinSeperator = explode ? ";" : ",";
    const seperator = explode ? "=" : ",";
    const prefix = explode ? ";" : `;${name}=`;
    return `${prefix}${entries
      .map(([key, _value]) => `${key}${seperator}${String(_value)}`)
      .join(joinSeperator)}`;
  }
}

export function serializePath(segments: Segment[]) {
  let path = "";

  for (let i = 0; i <= segments.length - 1; i++) {
    const segment = segments[i];

    if (typeof segment === "string" && /[~.;*]{1,3}/.test(segment)) {
      const isPrefixed = segment.startsWith("~");
      const isExplode = segment.endsWith("*");

      let _segment = segment;
      if (isPrefixed) {
        _segment = _segment.slice(1);
      } else {
        path += "/";
      }
      if (isExplode) {
        _segment = _segment.slice(0, -1);
      }

      const operator = _segment[0];
      const next = segments[i + 1] as Record<string, unknown>;

      switch (operator) {
        case ".":
          path += serializeLabel(next, isExplode);
          break;
        case ";":
          path += serializeMatrix(next, isExplode);
          break;
        default:
          path += serializeSimple(next, isExplode);
          break;
      }

      if (i + 1 <= segments.length) {
        i++;
      }
    } else {
      if (isPrimitive(segment)) {
        path += `/${String(segment)}`;
      } else if (isPrimitivesObject(segment)) {
        path += `/${serializeSimple(segment, false)}`;
      }
    }
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export function serializeSearchParams(args?: Record<string, unknown>) {
  if (!args) {
    return "";
  }

  const searchParams = new URLSearchParams();
  for (const key in args) {
    const value = args[key];

    if (isPrimitive(value)) {
      searchParams.append(key, String(value));
    } else if (isPrimitivesArray(value)) {
      searchParams.append(key, value.join(","));
    } else if (isPrimitivesWithArrayObject(value)) {
      for (const [k, v] of Object.entries(value)) {
        if (Array.isArray(v)) {
          searchParams.append(k, v.join(","));
        } else {
          searchParams.append(k, String(v));
        }
      }
    }
  }

  return `?${searchParams}`;
}
