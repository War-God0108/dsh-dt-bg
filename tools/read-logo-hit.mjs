/**
 * 读取 logoHitTest 探针结果：小胖鲸 logo 位置上，实际被命中的是谁。
 * 用法：node tools/read-logo-hit.mjs
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

let shown = 0;
const seenWidths = new Set();
for (let i = lines.length - 1; i >= 0 && shown < 3; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const r = rec.report ?? {};
	const h = r.logoHitTest;
	const top = r.sidebarTop;
	if (h === undefined || h.found !== true) continue;
	const width = top?.sidebarWidth ?? "?";
	if (seenWidths.has(width)) continue;
	seenWidths.add(width);
	shown++;
	console.log(`\n===== 记录 ${rec.at}｜侧边栏宽 ${width}px =====`);
	console.log("logo 矩形:", JSON.stringify(h.markRect));
	console.log("命中结果:", JSON.stringify(h.hitResults));
	console.log("整个 logo 上命中一致:", h.allSame);
	console.log("该点从上层到下层:");
	for (const s of h.stack) console.log("   " + s);
}
if (shown === 0) console.log("未取到 logoHitTest（面板未打开或探针未生效）");
