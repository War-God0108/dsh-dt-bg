/**
 * 统计页面上 wbg2-switch 的数量与各自状态 —— 判断是否存在"重复挂载"。
 * 只读诊断文件尾部。
 * 用法：node tools/count-switches.mjs
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const size = statSync(file).size;
const chunk = Math.min(size, 6 * 1024 * 1024);
const fd = openSync(file, "r");
const buf = Buffer.alloc(chunk);
readSync(fd, buf, 0, chunk, size - chunk);
closeSync(fd);
const lines = buf.toString("utf8").split("\n").filter((l) => l.trim().startsWith("{"));

for (let i = lines.length - 1; i >= 0; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const r = rec.report ?? {};
	if (r.switchHtml === undefined) continue;
	console.log(`记录时间：${rec.at}`);
	console.log("\n=== switchHtml（含计数）===");
	console.log(JSON.stringify(r.switchHtml, null, 1));
	if (r.duplicates !== undefined) {
		console.log("\n=== duplicates ===");
		console.log(JSON.stringify(r.duplicates, null, 1));
	} else {
		console.log("\n（本次报告没有 duplicates 字段）");
	}
	/* 顺带看看报告里是否出现多个 group / 设置行 */
	const keys = Object.keys(r);
	console.log("\n报告字段：", keys.join(", "));
	process.exit(0);
}
console.log("未找到含 switchHtml 的记录");
