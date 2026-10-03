/**
 * 列出插件样式表里**不含 `wbg2` 前缀**的规则。
 *
 * 这类规则会作用到官方元素上，改错就会像这次一样"把官方开关/按钮的背景清掉"。
 * 用来审查改动面。
 *
 * 用法：node tools/list-broad-rules.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const src = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
/* 样式表一般是 `const STYLE = [ ... ].join("")` 或 `const CSS = [...]`；都试一遍 */
const m = /const (STYLE|CSS|STYLE_TEXT)\s*=\s*\[([\s\S]*?)\]\s*\.join/.exec(src) ?? /const (STYLE|CSS|STYLE_TEXT)\s*=\s*\[([\s\S]*?)\];/.exec(src);
if (m === null) {
	console.log("没找到样式表定义。找找看：");
	for (const line of src.split("\n")) {
		if (/STYLE|CSS/.test(line) && /=/.test(line)) console.log(`  ${line.trim().slice(0, 120)}`);
	}
	process.exit(0);
}
console.log(`样式表变量：${m[1]}\n`);

/** 取出数组里的字符串字面量（含模板串的单行形式）。 */
const rules = [];
const re = /"((?:[^"\\]|\\.)*)"/g;
let hit;
while ((hit = re.exec(m[2])) !== null) rules.push(hit[1]);

console.log(`共 ${rules.length} 条规则。其中**不含 wbg2** 的（会作用到官方元素）：\n`);
let n = 0;
for (const [i, r] of rules.entries()) {
	if (/wbg2/.test(r)) continue;
	n++;
	console.log(`${String(i + 1).padStart(3)}| ${r.slice(0, 180)}`);
}
console.log(`\n--- 不含 wbg2 的规则共 ${n} 条 ---`);
if (n === 0) console.log("（全部规则都带 wbg2 前缀 —— 改动面是收敛的）");
