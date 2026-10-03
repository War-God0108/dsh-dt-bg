/**
 * 读 rowInk 探针：工作区行 / 会话行 / 用户行在两种 scope 下的绘制细节，
 * 用于照抄官方底色写悬停兜底（并确认官方到底是谁在画那层底色）。
 *
 * 用法：node tools/read-row-ink.mjs
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
	const r = rec.report?.rowInk;
	if (r === undefined || r.found !== true) continue;
	if (seen.has(r.scope)) continue;
	seen.set(r.scope, { at: rec.at, r });
}

if (seen.size === 0) {
	console.log("未找到 rowInk 记录（需要插件启用并上报过）");
	process.exit(0);
}

for (const [scope, { at, r }] of seen) {
	console.log(`\n########## scope=${scope}（${at}） ##########`);
	for (const key of ["project", "session", "trigger"]) {
		const row = r[key];
		if (row === null) {
			console.log(`\n-- ${key}: 未找到 --`);
			continue;
		}
		console.log(`\n-- ${key}  ${row.cls}  aria=${row.aria} --`);
		for (const d of row.list) {
			const paint = [d.bg !== "rgba(0, 0, 0, 0)" ? `bg=${d.bg}` : "", d.img === "" ? "" : `img=${d.img}`, d.shadow === "" ? "" : `shadow=${d.shadow}`, d.before === "" ? "" : `::before=${d.before}`, d.after === "" ? "" : `::after=${d.after}`]
				.filter((s) => s !== "")
				.join("  ");
			console.log(`   ${d.who.padEnd(12)} ${d.cls.slice(0, 34).padEnd(36)} ${paint === "" ? "（无绘制）" : paint}`);
		}
	}
}
