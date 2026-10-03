/**
 * 从诊断文件末尾取回"手动验证"记录，并把开关的真实 DOM / 行内样式 / 计算样式打印出来。
 * 只读文件尾部，避免把 100MB+ 的文件整体读进内存。
 *
 * 用法：node tools/read-switch-dom.mjs [回溯 MB]
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const mb = Number(process.argv[2] ?? 4);
const size = statSync(file).size;
const chunk = Math.min(size, mb * 1024 * 1024);
const fd = openSync(file, "r");
const buf = Buffer.alloc(chunk);
readSync(fd, buf, 0, chunk, size - chunk);
closeSync(fd);
const lines = buf.toString("utf8").split("\n").filter((l) => l.trim().startsWith("{"));
console.log(`文件 ${(size / 1048576).toFixed(1)} MB，尾部解析出 ${lines.length} 条记录`);

for (let i = lines.length - 1; i >= 0; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const r = rec.report ?? {};
	const h = r.switchHtml;
	if (h === undefined) continue;
	console.log(`\n记录时间：${rec.at}\n`);
	console.log("=== 开关 DOM ===");
	console.log(JSON.stringify(h, null, 1));
	console.log("\n=== 样式表自检 ===");
	console.log(JSON.stringify(r.styleTag ?? null));
	console.log("\n=== 面板变量 ===");
	console.log("sidebar:", r.applied?.sidebarVar, "| content:", r.applied?.contentVar, "| chrome:", r.applied?.chromeVar);
	process.exit(0);
}
console.log("末尾没有找到含 switchHtml 的记录（钩子可能未生效）");
