/**
 * 清点各备份的完整性：语法、是否含诊断定义、是否含"底部渐变中和"与"阴影清除"这两处修复。
 * 用途：在多次试错后挑出"既有修复、又没被删坏"的那一份。用法：node tools/pick-backup.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "lib");
const CHECK = join(dir, ".check-tmp.js");

const FILES = [
	"client.js",
	"client.js.bak-before-strip",
	"client.js.bak-stripped",
	"client.js.bak-trimmed",
	"client.js.bak-deadcode"
];

const CHECKS = [
	["诊断定义", "async function sendDiagnostics("],
	["诊断发送", "function collectDiagnostics("],
	["渐变中和", "composerSeat"],
	["阴影清除", "box-shadow:none"],
	["直角", "border-radius:0!important"],
	["chrome带", "CHROME_ID"],
	["titlebar档位", "dsh-bg-titlebar"]
];

const width = Math.max(...CHECKS.map(([n]) => n.length)) + 2;
console.log("文件".padEnd(34), "行数".padStart(5), "  语法  " + CHECKS.map(([n]) => n.padEnd(width)).join(""));
for (const name of FILES) {
	const file = join(dir, name);
	if (!existsSync(file)) continue;
	const text = readFileSync(file, "utf8");
	writeFileSync(CHECK, text, "utf8");
	let syntax = "通过";
	try {
		execFileSync(process.execPath, ["--check", CHECK], { stdio: "pipe" });
	} catch {
		syntax = "错误";
	}
	rmSync(CHECK, { force: true });
	const marks = CHECKS.map(([, needle]) => String(text.split(needle).length - 1).padEnd(width)).join("");
	console.log(name.padEnd(34), String(text.split("\n").length).padStart(5), "  " + syntax + "  " + marks);
}
