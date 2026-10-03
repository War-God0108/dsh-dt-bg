/**
 * 发布到 npm（包名 dsh-dt-bg）。
 *
 * 做四件事，每步都可单独诊断：
 *   1. 前置检查：包名/版本/仓库地址、是否包含不该发布的文件
 *   2. 检查 npm 登录状态（未登录会明确告诉你该执行什么）
 *   3. 用 pnpm pack 产出 tarball，再从 `dist/stage` 执行 publish
 *   4. 发布后回查 registry，确认线上可查到
 *
 * 用法：
 *   node tools/publish-npm.mjs --dry         # 只做检查，不发布
 *   node tools/publish-npm.mjs               # 正式发布
 *   node tools/publish-npm.mjs --tag beta    # 用 dist-tag 发布（不占 latest）
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const dry = process.argv.includes("--dry");
const tagIndex = process.argv.indexOf("--tag");
const tag = tagIndex >= 0 ? process.argv[tagIndex + 1] : null;

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const pnpm = join(process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh"), "dsh-runtimes", "dsh-primary-runtime", "dependencies", "pnpm", "bin", "pnpm.mjs");
const pnpmCmd = existsSync(pnpm) ? [process.execPath, [pnpm]] : ["pnpm", []];

const run = (args, options = {}) => execFileSync(pnpmCmd[0], [...pnpmCmd[1], ...args], { cwd: ROOT, encoding: "utf8", timeout: 300000, ...options });

let problems = 0;
const check = (ok, label, hint = "") => {
	if (!ok) problems++;
	console.log(`${ok ? "OK  " : "✗   "} ${label}${ok || hint === "" ? "" : `\n      → ${hint}`}`);
};

console.log(`包：${pkg.name}@${pkg.version}\n`);

/* ---------- 1. 前置检查 ---------- */
console.log("① 前置检查");
check(pkg.name === "dsh-dt-bg", `包名 = ${pkg.name}`);
check(/^\d+\.\d+\.\d+/.test(pkg.version), `版本 = ${pkg.version}`);
check(pkg.private !== true, "不是 private 包（private 无法发布）");
check(typeof pkg.repository?.url === "string" && pkg.repository.url.includes("dsh-dt-bg"), `仓库地址 = ${pkg.repository?.url ?? "(缺)"}`);
check(existsSync(join(ROOT, "cordis.patch.yml")), "自带挂载补丁 cordis.patch.yml（装完自动挂载）");
check(existsSync(join(ROOT, "lib", "client.js")) && existsSync(join(ROOT, "lib", "index.js")), "两个半端都在 lib/ 下");

/* 不该发布的文件 */
const INCLUDE = pkg.files ?? [];
check(INCLUDE.length > 0, `files 白名单 = [${INCLUDE.join(", ")}]`);
check(!INCLUDE.some((f) => /test|tools|snapshot|screenshot/.test(f)), "白名单里没有 test/tools/快照");

/* ---------- 2. 登录状态 ---------- */
console.log("\n② npm 登录状态");
let whoami = null;
try {
	whoami = execFileSync("npm", ["whoami"], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
} catch {
	whoami = null;
}
if (whoami === null) {
	check(false, "未登录 npm", "先执行：npm login --auth-type=web\n      （或按 PUBLISH-NPM.md 的方式 B 配置 Access Token）");
} else {
	check(true, `已登录为 ${whoami}`);
}

/* ---------- 3. 发布 ---------- */
console.log("\n③ 发布");
if (problems > 0) {
	console.log("   前置检查未通过，已中止。");
	process.exitCode = 1;
} else if (dry) {
	console.log("   [--dry] 跳过实际发布。检查全部通过，可以正式发布。");
} else {
	/* 干净暂存目录：只放 files 白名单里的内容 */
	const stage = join(ROOT, "dist", "stage");
	rmSync(stage, { recursive: true, force: true });
	execFileSync(process.execPath, [join(ROOT, "tools", "build-dist.mjs")], { stdio: "inherit", timeout: 300000 });
	const args = ["publish", "--access", "public", "--no-git-checks"];
	if (tag !== null) args.push("--tag", tag);
	console.log(`   执行：pnpm ${args.join(" ")}（在 dist/stage）`);
	execFileSync(pnpmCmd[0], [...pnpmCmd[1], ...args], { cwd: stage, stdio: "inherit", timeout: 600000 });
	console.log("   发布完成。");

	/* ---------- 4. 回查 ---------- */
	console.log("\n④ 回查 registry");
	try {
		const info = run(["view", pkg.name, "name", "version", "dist-tags", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
		console.log(info.trim());
		console.log(`\n   别人现在可以在 DSH 的「设置 → 内置插件」里直接填：${pkg.name}`);
	} catch (error) {
		console.log("   回查失败（registry 同步可能延迟几分钟）：", String(error.message).split("\n")[0]);
	}
}
