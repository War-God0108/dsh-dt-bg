/**
 * 检查插件自身的样式是否会影响侧边栏 logo 行的布局
 * （position / justify-content / align-self / order / margin 等）。
 *
 * 用法：node tools/check-layout-impact.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
const lines = text.split("\n");

const NEEDLES = ["position:fixed", "position:fixed!important", "justify-content", "align-self", "order:", "flex-direction", "margin-left", "margin-right", "inset"];

console.log("=== 插件样式表里的布局属性出现次数 ===");
let total = 0;
for (const needle of NEEDLES) {
	const n = text.split(needle).length - 1;
	total += n;
	if (n > 0) console.log(`  ${needle} × ${n}`);
}
if (total === 0) console.log("  （无）");

console.log("\n=== 含 justify-content 的规则 ===");
let shown = 0;
lines.forEach((line, i) => {
	if (!/justify-content/.test(line) || shown >= 12) return;
	shown++;
	console.log(`  ${i + 1}: ${line.trim().slice(0, 160)}`);
});
if (shown === 0) console.log("  （无）");

console.log("\n=== 插件 JS 是否写过 position ===");
let wrote = 0;
lines.forEach((line, i) => {
	if (!/\.style\.position|setProperty\(\s*"position"/.test(line)) return;
	wrote++;
	console.log(`  ${i + 1}: ${line.trim().slice(0, 140)}`);
});
if (wrote === 0) console.log("  （无 —— 插件不设置任何元素的 position）");
