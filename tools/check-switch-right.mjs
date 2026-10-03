/**
 * 静态核对"开关贴右"的改动是否就位。
 * 用法：node tools/check-switch-right.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const CHECKS = [
	["弹性占位元素已加入", 'key: "spacer", style: { flex: "1 1 auto"'],

	["SVG 轨道圆角 rx=10", 'rx: "10"'],
	["SVG 圆点半径 r=8", 'r: "8"'],
	["圆点开启在右（cx=26）", 'cx: s.enabled ? "26" : "10"'],
	["SVG viewBox 36x20", 'viewBox: "0 0 36 20"'],
	["按钮宽度 36", 'width: "36px"'],
	["开关高度 20", 'height: "20px"']
];
const GONE = [
	["旧的 transform 平移", "translateX(16px)"],
	["旧的外部样式表 switch 规则", "button.wbg2-switch{"]
];

let bad = 0;
for (const [label, needle] of CHECKS) {
	const ok = typeof needle === "string" ? text.includes(needle) : needle.test(text);
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "缺失"} ${label}`);
}
console.log("");
for (const [label, needle] of GONE) {
	const n = text.split(needle).length - 1;
	if (n > 0) bad++;
	console.log(`${n === 0 ? "OK  " : "残留"} ${label} → ${n}`);
}
console.log(`\n${bad === 0 ? "全部通过" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;


