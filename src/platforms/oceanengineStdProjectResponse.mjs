const STD_PROJECT_ID_KEYS = new Set(["project_id", "std_project_id", "id"]);

function stringTokenEnd(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') return index + 1;
    index += 1;
  }
  return -1;
}

function skipWhitespace(source, start) {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function decimalTokenEnd(source, start) {
  let index = start;
  while (index < source.length && /\d/.test(source[index])) index += 1;
  return index;
}

function isJsonValueBoundary(source, index) {
  const next = skipWhitespace(source, index);
  return next >= source.length || [",", "}", "]"].includes(source[next]);
}

// OceanEngine can return project IDs as JSON number tokens beyond JavaScript's
// safe-integer range. Convert only the known std-project ID fields before
// JSON.parse so the exact decimal token reaches the runtime as a string.
function quoteStdProjectIdTokens(text = "") {
  const source = String(text ?? "");
  let output = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] !== '"') {
      output += source[index];
      index += 1;
      continue;
    }

    const keyEnd = stringTokenEnd(source, index);
    if (keyEnd < 0) return source;
    const keyToken = source.slice(index, keyEnd);
    output += keyToken;
    index = keyEnd;

    let key = "";
    try {
      key = JSON.parse(keyToken);
    } catch {
      continue;
    }
    if (!STD_PROJECT_ID_KEYS.has(key)) continue;

    const colonIndex = skipWhitespace(source, index);
    if (source[colonIndex] !== ":") continue;
    const valueStart = skipWhitespace(source, colonIndex + 1);
    if (!/\d/.test(source[valueStart] || "")) continue;
    const valueEnd = decimalTokenEnd(source, valueStart);
    if (valueEnd === valueStart || !isJsonValueBoundary(source, valueEnd)) continue;

    output += source.slice(index, valueStart);
    output += JSON.stringify(source.slice(valueStart, valueEnd));
    index = valueEnd;
  }
  return output;
}

export function parseOceanEngineStdProjectResponse(text = "") {
  return JSON.parse(quoteStdProjectIdTokens(text));
}
