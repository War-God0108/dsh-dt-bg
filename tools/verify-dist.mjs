/**
 * 端到端验证"分发包能否被装进一个全新的 DSH_HOME"。
 *
 * 模拟他人机器上的情形：只给一个 `.tgz`，没有任何源码。
 * 检查：包被解开到 profiles/node_modules/<name>、bundle 补丁在位、profile 配置被写入。
 *
 * 用法：node tools/verify-dist.mjs [tarball路径]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const tgz = process.argv[2] ?? join(ROOT, "dist", "dsh-web-bg-2-2.0.0.tgz");
if (!existsSync(tgz)) {
	console.error(`找不到 tarball：${tgz}（先跑 node tools/build-dist.mjs）`);
	process.exit(1);
}

const sandbox = join(ROOT, "dist", "sandbox-home");
rmSync(sandbox, { recursive: true, force: true });
const profileDir = join(sandbox, "profiles", "desktop");
mkdirSync(profileDir, { recursive: true });
/* 造一个最小但真实的 profile 配置 */
writeFileSync(join(profileDir, "cordis.patch.yml"), "- id: ui-theme\n  config:\n    fontSize: 15\n", "utf8");

console.log(`沙箱 DSH_HOME：${sandbox}`);
console.log(`tarball：${tgz}\n`);

/* 1) 解包（模拟 pnpm 解 tarball 的结果） */
const extractDir = join(sandbox, "profiles", "node_modules", "dsh-web-bg-2");
const stageDir = join(sandbox, "_stage-unpack");
mkdirSync(extractDir, { recursive: true });
try {
	mkdirSync(stageDir, { recursive: true });
	execFileSync("tar", ["-xzf", tgz, "-C", stageDir, "--strip-components=1"], { stdio: "pipe", timeout: 60000 });
	console.log("① 解包成功");
} catch (error) {
	console.error("解包失败：", String(error.message).slice(0, 200));
	process.exit(1);
}
const rels = ["package.json", "lib/index.js", "lib/client.js", "cordis.patch.yml"];
for (const rel of rels) {
	console.log(`   ${existsSync(join(stageDir, rel)) ? "OK  " : "缺失"} ${rel}`);
}

/* 2) 确认 bundle 补丁声明与实际文件一致（官方就是靠它自动挂载的） */
const meta = JSON.parse(readFileSync(join(stageDir, "package.json"), "utf8"));
const patchRel = meta?.dsh?.bundle?.patch;
console.log(`\n② dsh.bundle.patch = ${patchRel}`);
if (typeof patchRel !== "string" || !existsSync(join(stageDir, patchRel))) {
	console.error("   补丁文件缺失 —— 官方插件管理器将无法自动挂载");
	process.exit(1);
}
const patchText = readFileSync(join(stageDir, patchRel), "utf8");
const ok = /-\s*insert:/.test(patchText) && /id:\s*web-bg-2/.test(patchText) && /name:\s*dsh-web-bg-2/.test(patchText);
console.log(`   补丁内容自检：${ok ? "含 insert + id + name ✓" : "不完整 ✗"}`);

/* 3) 用包内的 install.mjs 走"本地安装"路径，验证挂载写入 */
console.log("\n③ 用包内 install.mjs 安装到沙箱 profile");
execFileSync(process.execPath, [join(stageDir, "install.mjs"), "--dsh-home", sandbox], { stdio: "inherit", timeout: 120000 });
const after = readFileSync(join(profileDir, "cordis.patch.yml"), "utf8");
console.log("   安装后的 profile 配置：");
for (const line of after.split("\n")) console.log("     " + line);

/* 4) 幂等性：再跑一次不应重复追加 */
console.log("\n④ 幂等性（第二次安装）");
execFileSync(process.execPath, [join(stageDir, "install.mjs"), "--dsh-home", sandbox], { stdio: "inherit", timeout: 120000 });
const text2 = readFileSync(join(profileDir, "cordis.patch.yml"), "utf8");
const mounts = (text2.match(/- id: web-bg-2/g) ?? []).length;
console.log(`   配置里 web-bg-2 出现次数：${mounts}（应为 1）`);

/* 5) 卸载 */
console.log("\n⑤ 卸载");
execFileSync(process.execPath, [join(stageDir, "install.mjs"), "--dsh-home", sandbox, "--uninstall"], { stdio: "inherit", timeout: 120000 });
const text3 = readFileSync(join(profileDir, "cordis.patch.yml"), "utf8");
console.log(`   卸载后仍含挂载：${/- id: web-bg-2/.test(text3) ? "是（异常）" : "否 ✓"}`);
console.log(`   插件目录已删除：${existsSync(extractDir) ? "否（异常）" : "是 ✓"}`);

void readdirSync;
void homedir;



