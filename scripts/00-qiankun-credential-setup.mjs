import { stdin, stdout } from "node:process";
import { PostgresRepository } from "../src/repositories/postgresRepository.mjs";
import { upsertQiankunCredential } from "../src/platforms/qiankunCredentialStore.mjs";

function arg(name) {
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3).trim();
  const index = process.argv.findIndex((item) => item === `--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function readHiddenLine(prompt) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("interactive_tty_required");
  }
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    const priorRaw = stdin.isRaw;
    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(Boolean(priorRaw));
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") return finish(new Error("credential_setup_cancelled"));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const loginName = arg("user").toLowerCase();
if (!/^[a-z][a-z0-9_-]{2,63}$/u.test(loginName)) {
  throw new Error("usage: npm run setup:qiankun-user -- --user <login_name>");
}

const repo = new PostgresRepository();
const user = await repo.getWorkbenchUserByLogin(loginName);
if (!user || user.user_status !== "active") throw new Error("active_workbench_user_not_found");
if (!user.qiankun_owner_key || user.qiankun_owner_key.toLowerCase() !== loginName) {
  throw new Error("workbench_user_owner_key_mismatch");
}

const passportToken = await readHiddenLine(`请输入 ${user.display_name} (${loginName}) 的乾坤 Passport Token（输入不显示）: `);
const status = upsertQiankunCredential({
  ownerKey: user.qiankun_owner_key,
  ownerName: user.display_name,
  passportToken
});
const credential = status.credentials.find((item) => item.ownerKey === loginName);
console.log(JSON.stringify({
  status: status.status,
  user: loginName,
  ownerName: status.matchedOwnerName,
  tokenPresent: credential?.passportTokenPresent === true,
  expiresAt: credential?.expiresAt || "",
  refreshAfter: credential?.refreshAfter || "",
  blockers: status.blockers,
  credentialStoreMode: "0600",
  sensitiveOutput: false
}, null, 2));
