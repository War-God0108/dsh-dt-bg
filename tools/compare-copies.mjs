/**
 * 核对"源码"与"部署副本"是否为同一份最新代码，并打印关键特征。
 * 用法：node tools/compare-copies.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const FILES = [
	["源码", join(ROOT, "lib", "client.js")],
	["部署副本", join(homedir(), ".dsh", "profiles", "node_modules", "dsh-web-bg-2", "lib", "client.js")]
];

const FEATURES = [
	["switch 类名", "wbg2-switch"],
	["圆点类名", "wbg2-thumb"],
	["用 left 定位圆点（新版）", 'left: s.enabled ? "18px" : "2px"'],
	["用 transform 平移（旧版）", "translateX(16px)"],
	["轨道内边距为 0（新版）", 'padding: "0"'],
	["轨道内边距 2px（旧版）", 'padding: "2px"'],
	["行内 borderRadius 10px", 'borderRadius: "10px"'],
	["旧的外部样式表规则", "button.wbg2-switch{"]
];

const texts = {};
for (const [label, file] of FILES) {
	if (!existsSync(file)) {
		console.log(`${label}: 不存在 → ${file}`);
		continue;
	}
	const text = readFileSync(file, "utf8");
	texts[label] = text;
	const st = statSync(file);
	console.log(`${label}: ${st.mtime.toISOString()}  ${text.split("\n").length} 行  ${file}`);
}

console.log("\n特征对比：");
const width = Math.max(...FEATURES.map(([n]) => n.length)) + 2;
for (const [name, needle] of FEATURES) {
	const counts = Object.entries(texts).map(([label, text]) => `${label}=${text.split(needle).length - 1}`);
	console.log(`  ${name.padEnd(width)}${counts.join("  ")}`);
}

const labels = Object.keys(texts);
if (labels.length === 2) {
	console.log(`\n两份完全相同: ${texts[labels[0]] === texts[labels[1]]}`);
}
