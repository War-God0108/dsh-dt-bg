/**
 * 确认"顶栏色"这条链路是完整的：applyVisual 写入变量 → 样式表消费变量 → 规则挂在 canvas 门控下。
 * 用法：node tools/check-titlebar-wiring.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const CHECKS = [
	["applyVisual 写入 --dsh-bg-titlebar", 'setProperty("--dsh-bg-titlebar"'],
	["样式表消费该变量", "var(--dsh-bg-titlebar)"],
	["规则用顶部渐变实现", "linear-gradient(to bottom,var(--dsh-bg-titlebar)"],
	["规则挂在 canvas 门控下", `html[data-\${MARK}-canvas] [data-\${MARK}=canvas]{background-image:linear-gradient`],
	["深色取外壳按钮底色", '"rgb(27, 27, 28)"'],
	["浅色取白", '"#ffffff"'],
	["菜单元素也消费该变量", "var(--dsh-bg-titlebar, var(--dsh-bg-chrome))"]
];

let bad = 0;
const width = Math.max(...CHECKS.map(([n]) => n.length)) + 2;
for (const [name, needle] of CHECKS) {
	const ok = text.includes(needle);
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "缺失"} ${name.padEnd(width)}`);
}
console.log(`\n${bad === 0 ? "顶栏色链路完整" : bad + " 项缺失"}`);
process.exitCode = bad === 0 ? 0 : 1;

