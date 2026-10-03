/**
 * 读 sidebarInk 探针的最新记录，对比两种 scope 下"侧边栏可见绘制"的差异。
 * 用法：node tools/read-ink.mjs
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

/** 收集最近的记录，按 scope 归类。 */
const byScope = new Map();
for (let i = lines.length - 1; i >= 0; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const ink = rec.report?.sidebarInk;
	if (ink === undefined || ink.found !== true) continue;
	if (byScope.has(ink.scope)) continue;
	byScope.set(ink.scope, { at: rec.at, ink });
}

if (byScope.size === 0) {
	console.log("没有 sidebarInk 记录");
	process.exit(0);
}

for (const [scope, { at, ink }] of byScope) {
	console.log(`\n===== scope=${scope}（${at}）共 ${ink.total} 个可见绘制 =====`);
	for (const row of ink.rows) {
		const [cls, size, ...rest] = row.split("|");
		console.log(`  ${size.padEnd(10)} ${cls.slice(0, 34).padEnd(36)} ${rest.join(" ").slice(0, 90)}`);
	}
}

if (byScope.size === 2) {
	const on = byScope.get("on");
	const off = byScope.get("off");
	if (on !== void 0 && off !== void 0) {
		const key = (r) => r.split("|").slice(0, 2).join("|");
		const setOff = new Set(off.ink.rows.map(key));
		const setOn = new Set(on.ink.rows.map(key));
		console.log("\n===== 只在 scope=off 存在的绘制 =====");
		let n = 0;
		for (const row of off.ink.rows) {
			if (setOn.has(key(row))) continue;
			console.log("  " + row.slice(0, 130));
			n++;
		}
		if (n === 0) console.log("  （无）");
	}
}
