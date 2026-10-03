/**
 * 读最新一条诊断，只看关键字段（避免命令行引号问题与输出刷屏）。
 * 用法：node tools/read-diagnostic.mjs [字段名]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = process.argv[3] ?? join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const lines = readFileSync(file, "utf8").trim().split("\n");
const rec = JSON.parse(lines[lines.length - 1]);
const r = rec.report;
const only = process.argv[2];

console.log(`诊断时间 ${rec.at}   记录数 ${lines.length}   视口 ${(r.viewport ?? []).join("x")}`);

if (only === "paint") {
	console.log("\n=== 窗口下半部在画东西的元素（底部渐变嫌疑）===");
	for (const p of r.paintProbe ?? []) {
		console.log(`  ${String(p.rect.join("x")).padEnd(18)} ${p.cls ?? String(p.path).slice(-30)}`);
		console.log(`      bg=${p.bg}  radius=${p.radius}  z=${p.zIndex}  overflow=${p.overflow}`);
		if (p.img !== "none") console.log(`      img    = ${p.img}`);
		if (p.shadow !== "none") console.log(`      shadow = ${p.shadow}`);
		if (p.mask !== "none") console.log(`      mask   = ${p.mask}`);
	}
} else if (only === "layers") {
	console.log("\n=== 自有层 ===");
	for (const l of r.ownLayers ?? []) console.log(`  ${JSON.stringify(l)}`);
	console.log("imageUrl:", r.imageUrl);
	console.log("\n=== 面板 alpha ===");
	console.log(JSON.stringify(r.applied?.sidebarVar), JSON.stringify(r.applied?.contentVar), JSON.stringify(r.applied?.chromeVar));
} else {
	console.log("可用字段: paint | layers");
}
