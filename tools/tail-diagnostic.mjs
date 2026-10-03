/**
 * 读取超大 JSONL 诊断文件的**最后一条**记录（只读末尾若干 MB，不整体加载）。
 *
 * 背景：报告的 `imageUrl` 字段里带了整个 base64 壁纸，导致这个文件涨到 500MB+
 * （这是插件的缺陷，已修）。因此这里必须支持"只读尾部"。
 *
 * 用法：node tools/tail-diagnostic.mjs [路径] [回溯 MB]
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = process.argv[2] ?? join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const mb = Number(process.argv[3] ?? 8);
const size = statSync(file).size;
const chunk = Math.min(size, mb * 1024 * 1024);
const fd = openSync(file, "r");
const buf = Buffer.alloc(chunk);
readSync(fd, buf, 0, chunk, size - chunk);
closeSync(fd);

const text = buf.toString("utf8");
const lines = text.split("\n").filter((l) => l.trim() !== "");
console.log(`文件 ${(size / 1048576).toFixed(1)} MB，读取末尾 ${(chunk / 1048576).toFixed(1)} MB，得到 ${lines.length} 条`);

let rec = null;
for (let i = lines.length - 1; i >= 0; i--) {
	try {
		rec = JSON.parse(lines[i]);
		break;
	} catch {
		/* 末尾可能被截断，往前找完整的行 */
	}
}
if (rec === null) {
	console.log("末尾没有可解析的完整记录");
	process.exit(1);
}
console.log(`最新记录时间：${rec.at}`);
const r = rec.report ?? {};
console.log("\n=== cornerSelfTest ===");
console.log(JSON.stringify(r.cornerSelfTest, null, 2));
console.log("\n=== switchSamples（只看关键字段）===");
for (const x of r.switchSamples ?? []) {
	const mine = String(x.cls).includes("wbg2");
	console.log(`${mine ? "【我的】" : "【官方】"} ${String(x.cls).slice(0, 30)} ${x.rect?.join("x")} radius=${x.radius} bg=${x.bg} padding=${x.padding}`);
}
