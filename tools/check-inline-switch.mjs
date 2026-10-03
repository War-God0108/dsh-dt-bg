/**
 * 检查开关是否已改为"行内样式"实现（不依赖外部样式表）。
 * 用法：node tools/check-inline-switch.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const CHECKS = [
	["行内样式 boxSizing", "boxSizing: \"border-box\""],
	["行内样式 borderRadius", "borderRadius: \"10px\""],
	["行内样式 overflow", "overflow: \"hidden\""],
	["轨道底色（开/关）", "background: s.enabled ? \"rgb(249, 250, 251)\" : \"rgb(53, 54, 56)\""],
	["圆点尺寸", "width: \"16px\""],
	["圆点圆角", "borderRadius: \"8px\""],
	["圆点右移", "translateX(16px)"],
	["关闭时圆点在左", "translateX(0)"]
];
const GONE = ["button.wbg2-switch{", "button.wbg2-switch>"];

let bad = 0;
for (const [label, needle] of CHECKS) {
	const ok = text.includes(needle);
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "缺失"} ${label}`);
}
console.log("\n样式表里应已无 switch 规则：");
for (const needle of GONE) {
	const n = text.split(needle).length - 1;
	if (n > 0) bad++;
	console.log(`  ${n === 0 ? "OK  " : "残留"} ${needle} → ${n}`);
}
console.log(`\n${bad === 0 ? "全部通过（开关已完全行内化）" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;
