/**
 * 报告 lib/client.js 里仍存在的诊断/工具函数，供人决定是否保留。
 * 用法：node tools/list-dead-code.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

/** 关注这些名字：定义 1 次、调用 0 次即为死代码。 */
const NAMES = [
	"colorAlpha",
	"subtreeOfPainted",
	"paintsSurface",
	"looksLikePanel",
	"onlyPanelLikeDescendants",
	"markNestedSurfaces",
	"panelChildCount",
	"mixOver",
	"reportFormShape"
];

console.log("名字".padEnd(26), "定义", "调用");
for (const name of NAMES) {
	const defs = (text.match(new RegExp(`function ${name}\\b`, "g")) ?? []).length;
	const calls = (text.match(new RegExp(`\\b${name}\\(`, "g")) ?? []).length;
	const flag = defs > 0 && calls <= defs ? "   ← 疑似死代码" : "";
	console.log(name.padEnd(26), String(defs).padStart(4), String(calls).padStart(4), flag);
}
