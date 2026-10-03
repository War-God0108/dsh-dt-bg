/**
 * 检查 lib/client.js 里"标记（marking）"相关的关键代码是否完整。
 * 背景：一次清理误删了给面板打标记的那段，导致所有 `html[data-wbg2-panels] …`
 * 规则匹配不到 → 插件的前缀全部失效、壁纸被官方实底盖住。此脚本用于快速核对。
 *
 * 用法：node tools/check-marking.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

/** 必须存在的片段（每条都对应一个真实功能，缺了就会静默失效）。 */
const REQUIRED = [
	["打 canvas 标记", "setAttribute(`data-${MARK}-canvas`, \"1\")"],
	["打 panels 标记", "setAttribute(`data-${MARK}-panels`, \"1\")"],
	["撤销 panels 标记", "removeAttribute(`data-${MARK}-panels`)"],
	["面板分类函数", "function classifyFrameChildren("],
	["分类被调用", "classifyFrameChildren("],
	["嵌套表面标记", "function markNestedSurfaces("],
	["扫描入口 rescan", "function rescan("],
	["应用视觉 applyVisual", "function applyVisual("],
	["诊断上报", "async function sendDiagnostics("]
];

/** 不应该再出现的旧标记（出现过说明跑的是旧代码，或清理没删干净）。
 *  `dsh-bg-titlebar` **不在此列**：它是当前用来给顶栏 40px 上色的变量，属于在用代码；
 *  早先删掉的是 `data-wbg2-titlebar` 标记与 chrome 带那套 DOM。 */
const OBSOLETE = ["data-${MARK}-chrome", "data-${MARK}-titlebar", "CHROME_ID"];

let bad = 0;
console.log("必须存在的片段：");
for (const [name, needle] of REQUIRED) {
	const count = text.split(needle).length - 1;
	const ok = count > 0;
	if (!ok) bad++;
	console.log(`  ${ok ? "OK  " : "缺失"} ${name.padEnd(18)} ${count}`);
}
console.log("\n不应存在的旧标记：");
for (const needle of OBSOLETE) {
	const count = text.split(needle).length - 1;
	const ok = count === 0;
	if (!ok) bad++;
	console.log(`  ${ok ? "OK  " : "残留"} ${needle.padEnd(24)} ${count}`);
}
console.log(`\n${bad === 0 ? "全部通过" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;
