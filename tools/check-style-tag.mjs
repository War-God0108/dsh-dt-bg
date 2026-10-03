/**
 * 检查 lib/client.js 里"样式表注入"的代码路径。
 * 背景：真机出现"诊断说面板是半透明、画面却是实底"的矛盾，怀疑样式表没进 DOM。
 *
 * 用法：node tools/check-style-tag.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const NEEDLES = [
	"ensureStyleTag",
	'createElement("style")',
	"data-plugin-css",
	"appendChild(",
	"document.head",
	"CSS_ATTR"
];

const width = Math.max(...NEEDLES.map((n) => n.length)) + 2;
for (const needle of NEEDLES) {
	console.log(`${needle.padEnd(width)}${text.split(needle).length - 1}`);
}

/* 把 ensureStyleTag 整个函数打出来，人工核对它是否真的把样式挂进 DOM */
const at = text.indexOf("function ensureStyleTag");
console.log("\n--- ensureStyleTag ---");
console.log(at < 0 ? "（找不到该函数！）" : text.slice(at, at + 900));
