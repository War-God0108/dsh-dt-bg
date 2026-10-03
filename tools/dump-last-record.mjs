/**
 * 打印诊断文件里最后一条记录的"原文"与键，用于定位
 * "代码里有 record.seed，但写出的记录里没有" 这类问题。
 *
 * 用法：node tools/dump-last-record.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FILES = [join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl"), join(homedir(), ".dsh", "profiles", "desktop", ".dsh-web-bg2-diagnostics.jsonl")];

for (const f of FILES) {
	if (!existsSync(f)) continue;
	const raw = readFileSync(f, "utf8");
	const lines = raw.split("\n").filter((l) => l.trim() !== "");
	console.log(`\n=== ${f.replace(homedir(), "~")} ===`);
	console.log(`  行数 ${lines.length}  体积 ${(raw.length / 1024).toFixed(1)} KB`);
	if (lines.length === 0) continue;

	const last = lines[lines.length - 1];
	console.log(`  最后一行长度 ${last.length}`);
	console.log(`  含 "seed" 字样: ${last.includes('"seed"')}`);
	console.log(`  含 "build" 字样: ${last.includes('"build"')}`);
	console.log(`  含 "patch" 字样: ${last.includes('"patch"')}`);
	try {
		const obj = JSON.parse(last);
		console.log(`  解析成功，顶层键: ${Object.keys(obj).join(", ")}`);
		console.log(`  build = ${obj.build ?? "(无)"}`);
		console.log(`  seed  = ${JSON.stringify(obj.seed)}`);
		console.log(`  report 的键数 = ${obj.report === void 0 ? "(无 report)" : Object.keys(obj.report).length}`);
	} catch (error) {
		console.log(`  解析失败: ${String(error.message).slice(0, 100)}`);
		console.log(`  原文前 300 字符: ${last.slice(0, 300)}`);
	}
}
