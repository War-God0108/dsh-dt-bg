/**
 * 收尾自检：确认这轮"开关改造"已彻底清理，且关键链路完好。
 * 用法：node tools/final-check.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const GONE = ["wbg2-switch", "wbg2-thumb", "snapshotSwitchShape", "switchShapeSnapshot", "cornerSelfTest", "cornerMethodControl", "switchOverlay", "switchPixels"];
const KEEP = [
	["设置行：开启按钮", 'pick("开启", "On")'],
	["设置行：关闭按钮", 'pick("关闭", "Off")'],
	["开关行右对齐", "data-align"],
	["面板按钮样式", "button.wbg2-pill"],
	["诊断：样式表自检", "styleTag"],
	["诊断：覆盖者探针", "occluders"]
];

let bad = 0;
console.log("应已彻底移除：");
for (const needle of GONE) {
	const n = text.split(needle).length - 1;
	if (n > 0) bad++;
	console.log(`  ${n === 0 ? "OK  " : "残留"} ${needle.padEnd(22)} ${n}`);
}
console.log("\n必须存在：");
for (const [label, needle] of KEEP) {
	const n = text.split(needle).length - 1;
	if (n === 0) bad++;
	console.log(`  ${n > 0 ? "OK  " : "缺失"} ${label.padEnd(22)} ${n}`);
}
console.log(`\n${bad === 0 ? "全部通过" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;


