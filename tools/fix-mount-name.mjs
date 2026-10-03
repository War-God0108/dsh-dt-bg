/**
 * 迁移：把本机 profile 配置里挂载条目的 `name:` 从 npm 包名改回插件名 `web-bg-2`。
 *
 * 背景：包改名为 dsh-dt-bg 时，挂载补丁里的 `name:` 被一并改成了包名，
 * 而 `name:` 实际上是插件的**配置命名空间**（lib/index.js 的 name 导出）。
 * 两者错位后 DSH 不再把配置行下发给插件，插件退回出厂默认值。
 *
 * 用法：node tools/fix-mount-name.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const WRONG = "dsh-dt-bg";
const RIGHT = "web-bg-2";
const dry = process.argv.includes("--dry");

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
let fixed = 0;
/** 只在 `- insert:` 块内部替换，避免碰到别处。 */
let insideInsert = false;
let insertIndent = 0;

for (const line of lines) {
	const indent = line.length - line.trimStart().length;
	if (line.trimStart().startsWith("- insert:")) {
		insideInsert = true;
		insertIndent = indent;
		out.push(line);
		continue;
	}
	/* insert 块结束：出现同级或更浅的 `- ` 行 */
	if (insideInsert && line.trimStart().startsWith("- ") && indent <= insertIndent) {
		insideInsert = false;
	}
	if (insideInsert && /^\s*name:\s*['"]?dsh-dt-bg['"]?\s*$/.test(line)) {
		out.push(line.replace(WRONG, RIGHT));
		fixed++;
		continue;
	}
	out.push(line);
}

console.log(`${dry ? "[预演] " : ""}在 insert 块内修正 name: ${fixed} 处（${WRONG} → ${RIGHT}）`);
if (!dry && fixed > 0) {
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log(`已写入 ${CONFIG_FILE}`);
}
/* 打印结果供核对 */
const after = (dry ? lines : out).join("\n").split("\n");
console.log("\n挂载相关行：");
after.forEach((l, i) => {
	if (i >= 28 && i <= 50 && !l.includes("base64")) console.log(`  ${String(i + 1).padStart(3)}| ${l}`);
});
