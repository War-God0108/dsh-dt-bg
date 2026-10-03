/**
 * 核对"圆角恢复 + 角上不漏光"这组改动的状态。
 * 用法：node tools/check-corners.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const GONE = [
	["面板与后代清零圆角", "border-radius:0!important;box-shadow"],
	["面板内的清零圆角", "border-radius:0!important;box-shadow:none"],
	["内容区圆角变量归零", "--dsh-windows-content-radius:0px"],
	["布局根的实心底色（会盖死壁纸）", "background-color:var(--dsh-bg-base"]
];
const KEEP = [
	["0 模糊同色投影（补角上缝隙）", "filter:drop-shadow(0 0 0 var(--dsh-bg-base"],
	["--dsh-bg-base 变量写入", 'setProperty("--dsh-bg-base"'],
	["布局根仍是透明（壁纸能透出）", "data-${MARK}=canvas]{background-color:transparent!important}"],
	["顶栏菜单的唯一直角规则", "[data-windows-menu]{background-color:var(--dsh-bg-titlebar"]
];

let bad = 0;
console.log("应已移除：");
for (const [label, needle] of GONE) {
	const n = text.split(needle).length - 1;
	if (n > 0) bad++;
	console.log(`  ${n === 0 ? "OK  " : "残留"} ${label}${n > 0 ? ` × ${n}` : ""}`);
}
console.log("\n必须存在：");
for (const [label, needle] of KEEP) {
	const n = text.split(needle).length - 1;
	if (n === 0) bad++;
	console.log(`  ${n > 0 ? "OK  " : "缺失"} ${label}`);
}
/* 清零圆角总数应为 1（仅顶栏菜单） */
const zero = text.split("border-radius:0!important").length - 1;
if (zero !== 1) bad++;
console.log(`\n  border-radius:0!important 总数 = ${zero}（应为 1：顶栏菜单）`);
console.log(`\n${bad === 0 ? "全部通过" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;
