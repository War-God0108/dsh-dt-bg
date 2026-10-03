/**
 * 读 rowVars 探针：对比两种 scope 下 sessionRow / sidebar / root 上的自定义属性差异，
 * 找出被"关掉"的那个令牌（官方悬停底很可能取它）。
 *
 * 用法：node tools/read-row-vars.mjs
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const size = statSync(file).size;
const chunk = Math.min(size, 8 * 1024 * 1024);
const fd = openSync(file, "r");
const buf = Buffer.alloc(chunk);
readSync(fd, buf, 0, chunk, size - chunk);
closeSync(fd);
const lines = buf.toString("utf8").split("\n").filter((l) => l.trim().startsWith("{"));

const seen = new Map();
for (let i = lines.length - 1; i >= 0; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const r = rec.report?.rowVars;
	if (r === undefined || r.found !== true) continue;
	if (seen.has(r.scope)) continue;
	seen.set(r.scope, r);
}

if (seen.size === 0) {
	console.log("未找到 rowVars 记录");
	process.exit(0);
}

const off = seen.get("off");
const on = seen.get("on");
if (off === void 0 || on === void 0) {
	console.log(`记录不全：off ${off === undefined ? "缺" : "有"}，on ${on === undefined ? "缺" : "有"}`);
	process.exit(0);
}

for (const where of ["rowVars", "sidebarVars", "rootVars"]) {
	const a = off[where] ?? {};
	const b = on[where] ?? {};
	const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
	const diffs = names.filter((n) => (a[n] ?? "(无)") !== (b[n] ?? "(无)"));
	console.log(`\n===== ${where}：共 ${names.length} 个变量，差异 ${diffs.length} 个 =====`);
	for (const n of diffs.slice(0, 30)) {
		console.log(`  ${n}`);
		console.log(`     off: ${a[n] ?? "(无)"}`);
		console.log(`     on : ${b[n] ?? "(无)"}`);
	}
}
