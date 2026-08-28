import { createHash } from "node:crypto";

export const INSTANCE_ID_WIRE_STRATEGY = "decimal_bigint_json_number";
export const INT64_MAX_DECIMAL = "9223372036854775807";

const INT64_MAX = BigInt(INT64_MAX_DECIMAL);
const DECIMAL_INTEGER = /^[1-9]\d*$/;

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function typeName(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function validateInstanceIdToken(value) {
  if (Number.isSafeInteger(value) && value > 0) {
    return { status: "passed", blockers: [], token: String(value), transportType: "safe_integer_number" };
  }
  if (typeof value !== "string") {
    return {
      status: "blocked",
      blockers: ["invalid_lossless_platform_id:instance_id"],
      token: "",
      transportType: typeName(value)
    };
  }
  if (!DECIMAL_INTEGER.test(value)) {
    return {
      status: "blocked",
      blockers: ["invalid_decimal_bigint_json_number:instance_id"],
      token: "",
      transportType: "string"
    };
  }
  const parsed = BigInt(value);
  if (parsed > INT64_MAX) {
    return {
      status: "blocked",
      blockers: ["instance_id_exceeds_signed_int64"],
      token: "",
      transportType: "string"
    };
  }
  return {
    status: "passed",
    blockers: [],
    token: value,
    transportType: INSTANCE_ID_WIRE_STRATEGY
  };
}

function encodeJsonValue(value, path = []) {
  if (path.length === 1 && path[0] === "instance_id") {
    const validation = validateInstanceIdToken(value);
    if (validation.status !== "passed") {
      const error = new Error(validation.blockers[0]);
      error.blockers = validation.blockers;
      throw error;
    }
    return validation.token;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => encodeJsonValue(item, [...path, String(index)])).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${encodeJsonValue(item, [...path, key])}`).join(",")}}`;
  }
  if (typeof value === "bigint") {
    throw Object.assign(new Error("raw_bigint_not_allowed_in_create_payload"), {
      blockers: ["raw_bigint_not_allowed_in_create_payload"]
    });
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw Object.assign(new Error("unsupported_json_value_in_create_payload"), {
      blockers: ["unsupported_json_value_in_create_payload"]
    });
  }
  return encoded;
}

export function buildStdProjectCreateWireBody(payload = {}) {
  const blockers = [];
  let body = "";
  try {
    body = encodeJsonValue(payload);
  } catch (error) {
    blockers.push(...(Array.isArray(error.blockers) ? error.blockers : [error.message || "create_wire_body_encode_failed"]));
  }
  const requiresInstanceId = payload?.landing_type === "MICRO_GAME" && payload?.delivery_medium === "BYTE_GAME";
  const instanceIdValidation = Object.hasOwn(payload || {}, "instance_id")
    ? validateInstanceIdToken(payload.instance_id)
    : {
        status: requiresInstanceId ? "blocked" : "not_required",
        blockers: requiresInstanceId ? ["instance_id_missing_for_create_payload"] : [],
        token: "",
        transportType: "missing"
      };
  const allBlockers = [...new Set([...blockers, ...instanceIdValidation.blockers])];
  return {
    status: allBlockers.length ? "blocked" : "passed",
    blockers: allBlockers,
    body,
    bodyHash: body ? `sha256:${sha256(body)}` : "",
    requestHash: body ? `sha256:${sha256(body)}` : "",
    rawBodyStored: false,
    instanceIdPresent: Object.hasOwn(payload || {}, "instance_id"),
    instanceIdWireNumberTokenPresent: instanceIdValidation.status === "passed",
    instanceIdTransportType: instanceIdValidation.transportType,
    instanceIdTransportStrategy: instanceIdValidation.transportType === INSTANCE_ID_WIRE_STRATEGY
      ? INSTANCE_ID_WIRE_STRATEGY
      : instanceIdValidation.transportType
  };
}

export function stableStdProjectCreateWireHash(payload = {}) {
  const wire = buildStdProjectCreateWireBody(payload);
  return wire.bodyHash || `sha256:${sha256(encodeJsonValue(payload))}`;
}
