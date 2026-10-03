/**
 * 排查"开关被渲染成方角"的可能原因：检查插件样式表里所有可能影响 .wbg2-switch 圆角的规则，
 * 并列出顺序（后写的同优先级规则会覆盖前者）。
 * 用法：node tools/audit-switch-css.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

console.log("=== 所有提到 wbg2-switch 的规则（按出现顺序）===");
const lines = text.split("\n");
for (let i = 0; i < lines.length; i++) {
	if (!lines[i].includes("wbg2-switch")) continue;
	console.log(`  ${i + 1}: ${lines[i].trim().slice(0, 200)}`);
}

console.log("\n=== 所有设置 border-radius 的规则（看是否有全局规则波及）===");
for (let i = 0; i < lines.length; i++) {
	if (!/border-radius/.test(lines[i])) continue;
	const m = /border-radius:([^;"`]+)/.exec(lines[i]);
	if (m === null) continue;
	const value = m[1].trim();
	/* 只关心可能作用到按钮的 */
	if (!/0!important|999px|12px|50%|inherit/.test(value)) continue;
	const selector = lines[i].slice(0, Math.max(0, lines[i].indexOf("{")));
	console.log(`  ${i + 1}: ${value.padEnd(12)} ← ${selector.trim().slice(0, 90)}`);
}
