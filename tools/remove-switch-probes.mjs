/**
 * 删除已失效的"自定义开关"探针（switchPixels / duplicates）。
 *
 * 教训：按"第一个 `})(),`"当块尾会截到**嵌套**函数的结尾。这里改用**括号配对**
 * 找到 IIFE 真正的结束位置，每步仍用 `node --check` 校验。
 *
 * 用法：node tools/remove-switch-probes.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, "..", "lib", "client.js");
const CHECK = join(here, "..", "lib", ".check-tmp.js");
const dryRun = process.argv.includes("--dry-run");

function syntaxOk(text) {
	writeFileSync(CHECK, text, "utf8");
	try {
		execFileSync(process.execPath, ["--check", CHECK], { stdio: "pipe" });
		return true;
	} catch (error) {
		console.log(`    语法错误：${String(error.stderr ?? error.message).split("\n").slice(0, 2).join(" | ")}`);
		return false;
	} finally {
		rmSync(CHECK, { force: true });
	}
}

/**
 * 删除以 `marker` 开头的那条字段（形如 `name: (() => { ... })(),`）：
 * 从 marker 所在行起，用括号配对找平衡点，再吃掉紧随的 `})(),` 与上一行的注释块。
 */
function cutField(text, marker) {
	const lines = text.split("\n");
	const start = lines.findIndex((l) => l.includes(marker));
	if (start < 0) return null;
	let depth = 0;
	let end = -1;
	let seenBrace = false;
	for (let i = start; i < lines.length; i++) {
		for (const ch of lines[i]) {
			if (ch === "{") {
				depth++;
				seenBrace = true;
			} else if (ch === "}") {
				depth--;
			}
		}
		/* 花括号回到 0 且这一行以 `})(),` 收尾 → 就是字段结束 */
		if (seenBrace && depth === 0 && /\}\)\(\)?,\s*$/.test(lines[i])) {
			end = i;
			break;
		}
	}
	if (end < 0) return null;
	/* 往上吃掉紧邻的注释块与空行 */
	let head = start;
	while (head > 0 && /^\s*(\/\*|\*|\/\/)/.test(lines[head - 1])) head--;
	while (head > 0 && lines[head - 1].trim() === "") head--;
	return [...lines.slice(0, head), ...lines.slice(end + 1)].join("\n");
}

let text = readFileSync(FILE, "utf8");
console.log(`起始 ${text.split("\n").length} 行，语法 ${syntaxOk(text) ? "通过" : "不通过"}`);

for (const marker of ["switchPixels: (() => {", "duplicates: (() => {"]) {
	const candidate = cutField(text, marker);
	if (candidate === null) {
		console.log(`  跳过（未定位）：${marker}`);
		continue;
	}
	if (!syntaxOk(candidate)) {
		console.log(`  已回滚（会破坏语法）：${marker}`);
		continue;
	}
	text = candidate;
	console.log(`  已删除：${marker}`);
}

/* 清掉对已不存在元素的引用（switchSamples 里的 thumbEl 行） */
text = text.replace(/^\s*const thumbEl = el\.querySelector\("\.wbg2-thumb"\);[^\n]*\n/gm, "");
if (!syntaxOk(text)) {
	console.log("清理 thumbEl 行会破坏语法，跳过该步");
	text = readFileSync(FILE, "utf8");
} else {
	console.log("已清理 thumbEl 引用行");
}

console.log(`结果 ${text.split("\n").length} 行，语法 ${syntaxOk(text) ? "通过" : "不通过"}`);
for (const needle of ["switchPixels", "duplicates:", "wbg2-switch", "wbg2-thumb"]) {
	console.log(`  残留 ${needle}: ${text.split(needle).length - 1}`);
}
if (dryRun) {
	console.log("（--dry-run：未写入）");
} else {
	copyFileSync(FILE, `${FILE}.bak-probes`);
	writeFileSync(FILE, text, "utf8");
	console.log("已写入（备份 .bak-probes）");
}
