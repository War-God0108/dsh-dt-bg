/**
 * 清点 lib/client.js 里仍存在的诊断探针与死代码，供逐步精简时核对。
 * 用法：node tools/inventory.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const NEEDLES = [
	"async function sendDiagnostics",
	"let diagSent",
	"function topBands",
	"function analyzePoint",
	"function outerChain",
	"function colorAlpha",
	"function mixOver",
	"paintProbe",
	"titlebar:",
	"topBands:",
	"points:",
	"outerChain:"
];

console.log(`行数 ${text.split("\n").length}`);
const width = Math.max(...NEEDLES.map((n) => n.length)) + 2;
for (const needle of NEEDLES) {
	const count = text.split(needle).length - 1;
	console.log(`${needle.padEnd(width)}${count}`);
}
