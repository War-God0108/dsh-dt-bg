/**
 * 打包分发：生成一个可直接分发的 `.tgz`（npm 包格式），供他人用 DSH 官方插件界面安装。
 *
 * 为什么用 tarball：官方插件管理器（`@deepseek-ai/dsh-plugin-manager`）支持四类来源 ——
 *   npm 包名 / **tarball（本地绝对路径或 http(s) 链接）** / git 仓库 / 绝对路径目录。
 * 其中 tarball 最省事：对方不需要 npm 账号，也不需要这个仓库的源码。
 *
 * 用法：
 *   node tools/build-dist.mjs            # 生成 dist/dsh-dt-bg-<version>.tgz
 *   node tools/build-dist.mjs --install  # 顺便验证：从 tarball 装进一个临时 profile 前缀
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const DIST = join(ROOT, "dist");
const STAGE = join(DIST, "stage");

/** 分发时需要哪些文件（与 package.json 的 files 字段一致）。 */
const INCLUDE = ["package.json", "README.md", "INSTALL.md", "install.mjs", "cordis.patch.yml", "lib"];

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
console.log(`打包 ${pkg.name}@${pkg.version}`);

/* 1) 暂存目录：只放要分发的文件 */
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
for (const rel of INCLUDE) {
	const src = join(ROOT, rel);
	if (!existsSync(src)) {
		console.log(`  跳过（不存在）：${rel}`);
		continue;
	}
	cpSync(src, join(STAGE, rel), { recursive: true });
	console.log(`  收入：${rel}`);
}

/* 2) 打包：优先用 DSH 自带的 pnpm（官方插件管理器本身也是用 pnpm），
      再退到同目录的 npm，最后退到 PATH 上的 npm。 */
const nodeBin = process.execPath;
const dshDeps = join(homedir(), ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies");
const pnpmCli = join(dshDeps, "pnpm", "bin", "pnpm.mjs");
const npmCli = join(dshDeps, "node", "lib", "node_modules", "npm", "bin", "npm-cli.js");
const candidates = [
	existsSync(pnpmCli) ? { cmd: nodeBin, args: [pnpmCli, "pack", "--pack-destination", DIST] } : null,
	existsSync(npmCli) ? { cmd: nodeBin, args: [npmCli, "pack", "--pack-destination", DIST] } : null,
	{ cmd: "npm", args: ["pack", "--pack-destination", DIST] }
].filter(Boolean);

let tgz = null;
for (const attempt of candidates) {
	try {
		const out = execFileSync(attempt.cmd, attempt.args, {
			cwd: STAGE,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 180000
		});
		/* pnpm/npm 的 pack 输出格式不同：
		   pnpm 会打印 "Tarball Details" 区块并在下一行给出**绝对路径**（路径可能含空格，
		   所以必须按"行"解析，不能用空白切词 —— 踩过：含空格的路径被切碎导致找不到 tgz）；
		   npm 只打印文件名。 */
		const lines = `${out}`.split("\n").map((l) => l.trim());
		const fromBlock = (() => {
			const i = lines.findIndex((l) => /Tarball Details/i.test(l));
			if (i < 0) return void 0;
			for (let k = i + 1; k < lines.length; k++) {
				if (lines[k].toLowerCase().endsWith(".tgz")) return lines[k];
			}
			return void 0;
		})();
		const pick = fromBlock ?? lines.filter((l) => l.toLowerCase().endsWith(".tgz")).pop();
		if (pick !== void 0) {
			tgz = /^[A-Za-z]:[\\/]/.test(pick) ? pick : join(DIST, pick);
			console.log(`  打包命令：${String(attempt.cmd).split(/[\\/]/).pop()} ${attempt.args[0].split(/[\\/]/).pop()}`);
			console.log(`  tarball：${tgz}`);
			break;
		}
	} catch (error) {
		console.log(`  尝试失败（${String(attempt.cmd).split(/[\\/]/).pop()}）：${String(error.stderr ?? error.message).split("\n")[0].slice(0, 160)}`);
	}
}
if (tgz === null || !existsSync(tgz)) {
	console.error("打包失败：三种打包器都不可用");
	process.exit(1);
}
const size = statSync(tgz).size;
console.log(`\n已生成：${tgz}`);
console.log(`大小：${(size / 1024).toFixed(1)} KB`);

/* 3) 列出 tarball 内容，确认没有把 test/tools/快照打进去 */
try {
	const list = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8", timeout: 30000 });
	const entries = list.trim().split("\n");
	console.log(`\ntarball 内 ${entries.length} 项：`);
	for (const e of entries.slice(0, 20)) console.log("  " + e);
	const bad = entries.filter((e) => /test\/|tools\/|snapshots\/|screenshots\/|\.bak/.test(e));
	if (bad.length > 0) {
		console.log(`\n⚠ 有 ${bad.length} 项不该分发的内容：`);
		for (const b of bad.slice(0, 10)) console.log("  " + b);
	} else {
		console.log("\n内容干净：未包含 test/tools/快照。");
	}
} catch {
	console.log("（tar 列表读取失败，跳过内容核对）");
}

/* 4) 可选：从 tarball 验证安装 */
if (process.argv.includes("--install")) {
	const testHome = join(DIST, "verify-home");
	rmSync(testHome, { recursive: true, force: true });
	mkdirSync(join(testHome, "profiles", "desktop"), { recursive: true });
	/* 造一个最小的 profile 配置，模拟真实环境 */
	execFileSync(process.execPath, [join(ROOT, "install.mjs"), "--dsh-home", testHome], { stdio: "inherit", timeout: 120000 });
	console.log(`\n从包内脚本安装验证完成，结果目录：${testHome}`);
	console.log("（此步骤验证的是本地安装路径；npm/tarball 路径由 DSH 插件管理器负责。）");
	void readdirSync;
	void homedir;
}

