/**
 * 提取官方 dsh-plugin-manager 支持的"插件来源类型"与它的安装命令。
 * 用法：node tools/probe-plugin-source.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules", "@deepseek-ai", "dsh-plugin-manager", "lib", "index.js");
const text = readFileSync(file, "utf8");

/** 打印包含某个关键词的片段（去重、限长）。 */
function show(label, needle, before = 200, after = 340, max = 4) {
	const out = [];
	let from = 0;
	while (out.length < max) {
		const i = text.indexOf(needle, from);
		if (i < 0) break;
		out.push(text.slice(Math.max(0, i - before), i + after).replace(/\n/g, " ").replace(/\s+/g, " "));
		from = i + needle.length;
	}
	if (out.length === 0) return;
	console.log(`\n===== ${label}（${out.length} 段）=====`);
	for (const s of out) console.log(`  ${s.slice(0, 540)}\n`);
}

show("execa 调用", "execa");
show("npm 命令", "\"npm\"");
show("tarball", "tarball", 160, 260, 5);
show("来源类型枚举", "spec", 120, 200, 5);

/* 找 zod 的联合类型：通常能看出支持哪些来源 */
const re = /z\.[A-Za-z]+\(\[[\s\S]{0,200}?\]\)/g;
let m;
let n = 0;
console.log("\n===== zod 联合类型（前 8 个）=====");
while ((m = re.exec(text)) !== null && n < 8) {
	console.log(`  ${m[0].replace(/\s+/g, " ").slice(0, 200)}`);
	n++;
}
void statSync;
