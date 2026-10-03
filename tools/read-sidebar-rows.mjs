/**
 * 读 sidebarRows 探针：侧边栏内所有可点击行的真实类名与分组，
 * 用于把"悬停兜底"规则写准（工作区、会话、插件等）。
 *
 * 用法：node tools/read-sidebar-rows.mjs
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

for (let i = lines.length - 1; i >= 0; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const r = rec.report?.sidebarRows;
	if (r === undefined || r.found !== true) continue;
	console.log(`记录时间：${rec.at}`);
	console.log(`可点击行 ${r.count} 个\n`);
	console.log("类名前缀统计:", r.prefixes.join("  "));
	console.log("\n行清单（按 y 排序）:");
	const rows = [...r.rows].sort((a, b) => a.rect[1] - b.rect[1]);
	for (const row of rows) {
		console.log(
			`  y=${String(row.rect[1]).padStart(4)} ${String(row.rect[2]) + "x" + row.rect[3]}`.padEnd(20) +
			` ${row.tag}${row.role === "" ? "" : "[" + row.role + "]"}`.padEnd(14) +
			` bg=${row.bg.padEnd(24)} ${row.cls.slice(0, 44).padEnd(46)} 「${row.text}」`
		);
	}
	process.exit(0);
}
console.log("未找到 sidebarRows 记录（插件需已启用并上报过一次）");
