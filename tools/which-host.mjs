/**
 * 判定"实际运行的是哪一份宿主代码"。
 *
 * 排查时最大的时间浪费之一：改了代码 → 部署 → 让用户重启 → 行为仍像旧代码，
 * 而我只能猜（部署时间 vs 进程启动时间 vs 上报时间，都能解释得通）。
 *
 * 现在宿主的每条记录里都带 `build` 标记，这里据此直接判定。
 *
 * 用法：node tools/which-host.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, DIAG_FILE } from "./paths.mjs";

const deployed = join(DEPLOYED_DIR, "lib", "index.js");
console.log("=== 磁盘上的宿主代码 ===");
if (!existsSync(deployed)) {
	console.log("  部署副本不存在！");
	process.exit(1);
}
const src = readFileSync(deployed, "utf8");
console.log(`  路径: ${deployed}`);
console.log(`  修改: ${statSync(deployed).mtime.toLocaleString()}`);
const buildOnDisk = /build:\s*"([^"]+)"/.exec(src);
console.log(`  标记: ${buildOnDisk === null ? "(无 —— 这版还没有 build 标记)" : buildOnDisk[1]}`);
console.log(`  含 writeOwnSettings: ${src.includes("writeOwnSettings")}`);

console.log("\n=== 诊断记录里实际报告的代码 ===");
if (!existsSync(DIAG_FILE)) {
	console.log("  诊断文件不存在");
	process.exit(1);
}
const lines = readFileSync(DIAG_FILE, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
if (lines.length === 0) {
	console.log("  诊断文件为空");
	process.exit(1);
}
/** 统计最近若干条记录里的 build 标记。 */
const seen = new Map();
let last = null;
for (let i = lines.length - 1; i >= 0 && i > lines.length - 40; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const b = rec.build ?? "(无 build 字段 → 旧代码)";
	seen.set(b, (seen.get(b) ?? 0) + 1);
	if (last === null) last = { at: rec.at, build: b, hasSeed: rec.seed !== void 0, hasHost: rec.host !== void 0 };
}
for (const [b, n] of seen) console.log(`  ${b}  × ${n} 条`);
console.log(`\n  最新一条: ${last.at}`);
console.log(`    build = ${last.build}`);
console.log(`    含 seed 字段 = ${last.hasSeed}`);

console.log("\n=== 判定 ===");
if (buildOnDisk === null) {
	console.log("  磁盘代码没有 build 标记 —— 先跑一次 install.mjs 部署。");
} else if (last.build !== buildOnDisk[1]) {
	console.log(`  ✗ 运行的**不是**磁盘上这份代码。`);
	console.log(`    磁盘: ${buildOnDisk[1]}`);
	console.log(`    运行: ${last.build}`);
	console.log("    → 宿主插件没有重新加载。需要**完全退出应用**（确认进程全部结束）再启动。");
	process.exitCode = 1;
} else {
	console.log(`  ✓ 运行的就是磁盘上这份代码（${last.build}）。`);
}
