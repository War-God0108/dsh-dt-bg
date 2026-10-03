/**
 * 从最新诊断里取出 wbg2-switch 的完整采样信息（含所在标记、内联样式、圆点样式）。
 * 用法：node tools/inspect-switch.mjs [回溯条数]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const lines = readFileSync(file, "utf8").trim().split("\n");
const lookback = Number(process.argv[2] ?? 10);

let hit = null;
for (let i = lines.length - 1; i >= 0 && i > lines.length - 1 - lookback; i--) {
	const r = JSON.parse(lines[i]).report;
	const found = (r.switchSamples ?? []).filter((x) => String(x.cls).includes("wbg2-switch"));
	if (found.length > 0) {
		hit = { at: JSON.parse(lines[i]).at, item: found[0], marked: (r.applied?.marked ?? []).map((m) => m.kind) };
		break;
	}
}
if (hit === null) {
	console.log(`最近 ${lookback} 条诊断里没有 wbg2-switch 采样（设置面板可能没开）。`);
	process.exit(0);
}
console.log(`采样时间 ${hit.at}`);
console.log(`所在标记（自身向上第一个 data-wbg2）: ${hit.item.insideMarked}`);
console.log(`标记清单: ${hit.marked.join(", ")}`);
console.log("");
console.log("完整采样：");
console.log(JSON.stringify(hit.item, null, 2));
