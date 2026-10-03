/**
 * 清掉排查期间插入的 console.log("DEBUG …") 行。
 *
 * 为什么要专门写个脚本：这类调试行散落在源码与测试里，
 * 手工清理容易漏（漏了会污染用户控制台，也会让诊断日志变吵）。
 *
 * 用法：node tools/strip-debug-logs.mjs [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const FILES = ["lib/client.js", "lib/index.js", "test/client-visual.test.mjs"];

let total = 0;
for (const rel of FILES) {
	const p = join(ROOT, rel);
	let text;
	try {
		text = readFileSync(p, "utf8");
	} catch {
		continue;
	}
	const lines = text.split("\n");
	const kept = lines.filter((l) => !/console\.log\(\s*["']DEBUG/.test(l));
	const removed = lines.length - kept.length;
	if (removed > 0) {
		total += removed;
		console.log(`  ${rel.padEnd(30)} 删除 ${removed} 行`);
		if (apply) writeFileSync(p, kept.join("\n"), "utf8");
	}
}
console.log(`\n${apply ? "已清理" : "[预演] 将清理"} ${total} 行调试输出`);
if (!apply) console.log("加 --apply 生效。");
