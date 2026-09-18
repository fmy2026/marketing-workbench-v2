import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export function miError(code, statusCode = 400) {
  return Object.assign(new Error(code), { statusCode });
}

export function normalizeMiOrigin(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw miError("mi_invalid_address"); }
  const octets = url.hostname.split(".").map(Number);
  const privateIp = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && octets.every((n) => n >= 0 && n <= 255) &&
    (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
  if (!privateIp || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw miError("mi_invalid_address");
  }
  return url.origin;
}

export function normalizeMiToken(value) {
  const token = String(value || "").trim();
  if (!/^[A-Za-z0-9._~-]{16,512}$/.test(token)) throw miError("mi_invalid_token");
  return token;
}

export function createMiConnectionStore({ path = join(homedir(), ".config", "marketing-workbench", "market-intelligence.json") } = {}) {
  function key(userId) {
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(userId || "")) throw miError("mi_invalid_user");
    return `user:${userId}`;
  }
  function read() {
    if (!existsSync(path)) return { version: 1, connections: {} };
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw miError("mi_connection_store_unavailable", 503);
    try {
      const value = JSON.parse(readFileSync(path, "utf8"));
      if (value.version !== 1 || !value.connections || typeof value.connections !== "object" || Array.isArray(value.connections)) throw new Error();
      return value;
    } catch { throw miError("mi_connection_store_unavailable", 503); }
  }
  function write(value) {
    const directory = dirname(path);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const directoryStat = lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw miError("mi_connection_store_unavailable", 503);
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
      renameSync(temporary, path);
      chmodSync(path, 0o600);
    } catch { throw miError("mi_connection_store_unavailable", 503); }
    finally { rmSync(temporary, { force: true }); }
  }
  return {
    get(userId) {
      const value = read().connections[key(userId)];
      return value ? { baseUrl: normalizeMiOrigin(value.baseUrl), token: normalizeMiToken(value.token) } : null;
    },
    status(userId) {
      const value = this.get(userId);
      return { configured: Boolean(value), baseUrl: value?.baseUrl || "" };
    },
    set(userId, connection) {
      const value = read();
      value.connections[key(userId)] = { baseUrl: normalizeMiOrigin(connection.baseUrl), token: normalizeMiToken(connection.token) };
      write(value);
      return this.status(userId);
    },
    remove(userId) {
      const value = read();
      delete value.connections[key(userId)];
      write(value);
      return { configured: false, baseUrl: "" };
    }
  };
}
