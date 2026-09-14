import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releasesRoot = join(projectRoot, ".local", "releases");

function clean(value) { return String(value || "").trim(); }
function revision() { return clean(execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" })); }

async function main() {
  const sha = revision();
  const target = join(releasesRoot, sha);
  await mkdir(releasesRoot, { recursive: true, mode: 0o700 });
  try {
    const existing = await stat(target);
    if (!existing.isDirectory()) throw new Error("release_target_not_directory");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(target, { recursive: true, mode: 0o700 });
    try {
      const archive = execFileSync("git", ["archive", "--format=tar", sha], { cwd: projectRoot, maxBuffer: 128 * 1024 * 1024 });
      execFileSync("tar", ["-x", "-C", target], { input: archive, maxBuffer: 128 * 1024 * 1024 });
      await writeFile(join(target, ".workbench-release.json"), `${JSON.stringify({ revision: sha, content_sha256: createHash("sha256").update(archive).digest("hex") })}\n`, { mode: 0o600 });
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      throw error;
    }
  }
  console.log(JSON.stringify({ status: "ready", revision: sha, release_root: target }));
}

main().catch((error) => { console.error(clean(error.message) || error); process.exitCode = 1; });
