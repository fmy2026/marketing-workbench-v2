function clean(value) {
  return String(value ?? "").trim();
}

// Material identifiers are opaque, case-sensitive codes.  Do not normalize
// letter case here or in any caller; only outer whitespace is insignificant.
export function exactMaterialCodePattern(value = "") {
  const code = clean(value);
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped ? new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`) : null;
}

export function filenameMatchesMaterialCode(filename = "", materialCode = "") {
  return exactMaterialCodePattern(materialCode)?.test(clean(filename)) === true;
}
