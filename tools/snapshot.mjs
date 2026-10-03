/**
 * 快照 / 回滚工具。
 *
 * 用途：在动"已知会让界面出问题"的改动之前，把当前**已验证可用**的状态钉住，
 * 出问题一条命令回到这个状态。这个项目上已经踩过太多次"改坏了要重新摸"的坑。
 *
 * 快照内容：
 *   - lib/client.js、lib/index.js、install.mjs、verify.ps1
 *   - 运行中的 profile 配置 cordis.patch.yml（含壁纸与各档位数值）
 *   - 一份 meta.json：时间、行数、源文件与部署副本是否一致、快照原因
 *
 * 用法：
 *   node tools/snapshot.mjs save "<说明>"     # 保存快照（覆盖同名）
 *   node tools/snapshot.mjs save "<说明>" --name good-2026-10-03
 *   node tools/snapshot.mjs list             # 列出已有快照
 *   node tools/snapshot.mjs restore <名称>    # 回滚到该快照（会先自动备份当前状态）
 *   node tools/snapshot.mjs verify <名称>     # 只检查快照是否完整
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const SNAP_DIR = join(ROOT, "snapshots");
const PROFILE = join(homedir(), ".dsh", "profiles", "desktop", "cordis.patch.yml");
const DEPLOYED = join(homedir(), ".dsh", "profiles", "node_modules", "dsh-dt-bg", "lib", "client.js");

/** 需要纳入快照的文件（相对插件根目录）。 */
const FILES = ["lib/client.js", "lib/index.js", "install.mjs", "verify.ps1", "package.json"];

function stamp() {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function currentMeta() {
	const client = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
	const deployedSame = existsSync(DEPLOYED) ? readFileSync(DEPLOYED, "utf8") === client : null;
	return {
		savedAt: new Date().toISOString(),
		clientLines: client.split("\n").length,
		clientBytes: client.length,
		deployedMatchesSource: deployedSame,
		profileConfig: existsSync(PROFILE) ? readFileSync(PROFILE, "utf8") : null
	};
}

function save(reason, name) {
	const target = join(SNAP_DIR, name);
	if (existsSync(target)) rmSync(target, { recursive: true, force: true });
	mkdirSync(join(target, "files"), { recursive: true });
	for (const rel of FILES) {
		const src = join(ROOT, rel);
		if (!existsSync(src)) continue;
		mkdirSync(dirname(join(target, "files", rel)), { recursive: true });
		cpSync(src, join(target, "files", rel));
	}
	const meta = { ...currentMeta(), reason, name };
	writeFileSync(join(target, "meta.json"), JSON.stringify(meta, null, "\t"), "utf8");
	console.log(`已保存快照：${name}`);
	console.log(`  说明      : ${reason}`);
	console.log(`  client.js : ${meta.clientLines} 行 / ${meta.clientBytes} 字节`);
	console.log(`  与部署一致: ${meta.deployedMatchesSource}`);
	console.log(`  含配置    : ${meta.profileConfig === null ? "否" : "是"}`);
	console.log(`  位置      : ${target}`);
}

function list() {
	if (!existsSync(SNAP_DIR)) {
		console.log("（还没有任何快照）");
		return;
	}
	for (const name of readdirSync(SNAP_DIR)) {
		const metaFile = join(SNAP_DIR, name, "meta.json");
		if (!existsSync(metaFile)) continue;
		const meta = JSON.parse(readFileSync(metaFile, "utf8"));
		const size = statSync(join(SNAP_DIR, name)).isDirectory() ? "dir" : "?";
		console.log(`${name.padEnd(28)} ${meta.clientLines} 行  ${meta.savedAt}  ${meta.reason}`);
		void size;
	}
}

function restore(name) {
	const target = join(SNAP_DIR, name);
	if (!existsSync(target)) {
		console.error(`找不到快照：${name}`);
		process.exitCode = 1;
		return;
	}
	/* 回滚前先把"当前状态"也存一份，避免回滚本身造成不可逆损失 */
	save(`自动备份（在回滚到 ${name} 之前）`, `pre-restore-${stamp()}`);
	const meta = JSON.parse(readFileSync(join(target, "meta.json"), "utf8"));
	for (const rel of FILES) {
		const src = join(target, "files", rel);
		if (!existsSync(src)) continue;
		cpSync(src, join(ROOT, rel));
		console.log(`  已还原 ${rel}`);
	}
	if (typeof meta.profileConfig === "string") {
		writeFileSync(PROFILE, meta.profileConfig, "utf8");
		console.log(`  已还原 profile 配置`);
	}
	console.log(`\n已回滚到快照：${name}（${meta.reason}）`);
	console.log("注意：回滚的是文件；要让运行中的客户端生效，需要重新 install 并按需重启。");
}

function verify(name) {
	const target = join(SNAP_DIR, name);
	if (!existsSync(target)) {
		console.error(`找不到快照：${name}`);
		process.exitCode = 1;
		return;
	}
	const meta = JSON.parse(readFileSync(join(target, "meta.json"), "utf8"));
	let bad = 0;
	for (const rel of FILES) {
		const ok = existsSync(join(target, "files", rel));
		if (!ok) bad++;
		console.log(`  ${ok ? "OK  " : "缺失"} ${rel}`);
	}
	console.log(`  ${meta.profileConfig === null ? "无配置" : "OK   配置"} `);
	console.log(`\n${bad === 0 ? "快照完整" : bad + " 项缺失"}`);
	process.exitCode = bad === 0 ? 0 : 1;
}

const [action, arg, ...rest] = process.argv.slice(2);
const nameFlag = rest.indexOf("--name");
const customName = nameFlag >= 0 ? rest[nameFlag + 1] : null;

if (action === "save") {
	save(arg ?? "（未填写说明）", customName ?? `good-${stamp()}`);
} else if (action === "list") {
	list();
} else if (action === "restore" && arg !== undefined) {
	restore(arg);
} else if (action === "verify" && arg !== undefined) {
	verify(arg);
} else {
	console.log("用法：");
	console.log('  node tools/snapshot.mjs save "<说明>" [--name 名称]');
	console.log("  node tools/snapshot.mjs list");
	console.log("  node tools/snapshot.mjs restore <名称>");
	console.log("  node tools/snapshot.mjs verify <名称>");
}
