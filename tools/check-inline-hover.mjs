/**
 * 核对"悬停反馈"（行内样式 + 事件委托）的实现要点。
 * 用法：node tools/check-inline-hover.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const CHECKS = [
	["侧边栏行选择器（会话）", ".hIlkoa_sessionRow"],
	["侧边栏行选择器（工作区）", ".hIlkoa_projectRow"],
	["侧边栏行选择器（用户行）", ".wCInkW_triggerRow"],
	["输入框区域锚点", 'closest("[class*=composerSeat]")'],
	["输入框内按钮泛化匹配", 'closest("button,[role=button]")'],
	["区域区分 row / composer", 'region: "composer"'],
	["行内写样式（带 important）", 'setProperty("background-color", color, "important")'],
	["记住原值并还原", "MARK}PrevBg"],
	["pointerover 委托", '"pointerover"'],
	["pointerout 委托", '"pointerout"'],
	["只在 panels 标记下接管", "getAttribute(`data-${MARK}-panels`) !== null"],
	["rescan 后补画选中态", "if (selectedPainter !== null) selectedPainter();"],
	["选中态声明在 rescan 之前", "let selectedPainter = null"]
];
const GONE = [
	["旧 CSS 悬停规则（无效）", "html[data-${MARK}-panels] .hIlkoa_sessionRow:hover"]
];

let bad = 0;
for (const [label, needle] of CHECKS) {
	const ok = text.includes(needle);
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "缺失"} ${label}`);
}
console.log("");
for (const [label, needle] of GONE) {
	const n = text.split(needle).length - 1;
	if (n > 0) bad++;
	console.log(`${n === 0 ? "OK  " : "残留"} ${label} → ${n}`);
}
/* 顺序检查：声明必须在 rescan 使用点之前 */
const declLine = text.split("\n").findIndex((l) => l.includes("let selectedPainter = null"));
const useLine = text.split("\n").findIndex((l) => l.includes("if (selectedPainter !== null) selectedPainter();"));
if (!(declLine < useLine && declLine >= 0)) {
	bad++;
	console.log(`顺序异常：声明行 ${declLine + 1}，使用行 ${useLine + 1}（声明必须在前，否则 TDZ 报错）`);
} else {
	console.log(`OK   声明顺序（第 ${declLine + 1} 行声明，第 ${useLine + 1} 行使用）`);
}
console.log(`\n${bad === 0 ? "全部通过" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;
