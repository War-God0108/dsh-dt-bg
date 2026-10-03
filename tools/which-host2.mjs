/**
 * 判定"正在运行的宿主是源码这一版吗"，并顺带核对调试开关在页面上的实际效果。
 *
 * 与 tools/which-host.mjs 的区别：这份不依赖 build 标记（回退到旧版后没有该字段），
 * 而是看两个更硬的证据：
 *   ① 上报里有没有 `seed` 字段（新版宿主才会写）
 *   ② `seed.keys` 里有没有调试开关（schema + 白名单都补齐后才会出现）
 * 再看 html 属性判断开关是否真的作用到了页面上。
 *
 * 用法：node tools/which-host2.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEPLOYED_DIR } from "./paths.mjs";

const FILE = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
if (!existsSync(FILE)) {
	console.log("没有诊断文件");
	process.exit(1);
}
const lines = readFileSync(FILE, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
console.log(`诊断文件：${lines.length} 条，改于 ${statSync(FILE).mtime.toLocaleString()}`);
console.log(`部署副本：${statSync(join(DEPLOYED_DIR, "lib", "index.js")).toLocaleString()}\n`);

/** 从后往前找最近几条，标出哪些带 seed。 */
let lastWithSeed = null;
let lastAny = null;
for (let i = lines.length - 1; i >= 0 && i > lines.length - 30; i--) {
	let r;
	try {
		r = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	if (lastAny === null) lastAny = r;
	if (r.seed !== void 0 && lastWithSeed === null) lastWithSeed = r;
}

console.log("=== 运行中的宿主版本判定 ===");
if (lastAny === null) {
	console.log("  没有可解析的记录");
	process.exit(1);
}
console.log(`  最新一条：${lastAny.at}  顶层键 = ${Object.keys(lastAny).join(", ")}`);
console.log(`  含 seed 字段 = ${lastAny.seed !== void 0 ? "是" : "否"}`);
if (lastWithSeed === null) {
	console.log("\n  ✗ 最近 30 条里没有一条带 seed —— 运行的是**旧版宿主**（重启前的那份代码）。");
	console.log("    → 需要完全退出应用再启动（注意孤儿进程会占住端口/缓存）。");
	process.exitCode = 1;
} else {
	console.log(`  最近带 seed 的一条：${lastWithSeed.at}`);
	console.log(`    seed.keys = ${JSON.stringify(lastWithSeed.seed.keys)}`);
	const hasSwitches = (lastWithSeed.seed.keys ?? []).some((k) => k.startsWith("no"));
	console.log(`    含调试开关 = ${hasSwitches ? "是 ✓" : "否 ✗（schema 或白名单还没生效）"}`);
}

console.log("\n=== 开关在页面上的实际效果（最新一条）===");
const attrs = lastAny.report?.htmlAttrs ?? [];
const has = (n) => attrs.some((a) => a.startsWith(`data-wbg2-${n}`));
console.log(`  blanket 属性 = ${has("blanket") ? "存在（noBlanket 未生效）" : "已移除（noBlanket 生效）"}`);
console.log(`  tint 属性    = ${has("tint") ? "存在（noTint 未生效）" : "已移除（noTint 生效）"}`);
console.log(`  panels 属性  = ${has("panels") ? "存在 ✓" : "缺失 ✗（透出被关了？）"}`);
console.log(`  panelbg 属性 = ${has("panelbg") ? "存在 ✓" : "缺失"}`);
