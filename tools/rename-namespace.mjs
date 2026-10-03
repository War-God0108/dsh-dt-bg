/**
 * 把插件的「配置命名空间」从 `web-bg-2` 统一改为 `dsh-dt-bg`。
 *
 * 涉及四处（必须同时改，否则 DSH 找不到对应实例、不下发配置）：
 *   1. lib/index.js    : `const name = "…"`            —— 插件对外声明的名字
 *   2. lib/client.js   : `const NAMESPACE = "…"`       —— 客户端读设置的键
 *   3. cordis.patch.yml: 包内自带挂载补丁的 `name:`    —— 他人安装时的挂载名
 *   4. install.mjs     : `PLUGIN_ID` / `ENTRY_ID`       —— 本地安装脚本写的挂载名
 *
 * 外加本机 profile 配置里的两处，由 --migrate-profile 负责：
 *   - 挂载块的 `name:`
 *   - 用户设置行的 `- id:`
 *
 * 安全措施：改完对每个 .js/.mjs 做 `node --check`；配置迁移前先备份。
 *
 * 用法：
 *   node tools/rename-namespace.mjs --dry                 # 预演
 *   node tools/rename-namespace.mjs --apply                # 改仓库文件
 *   node tools/rename-namespace.mjs --apply --migrate-profile   # 同时改本机配置
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, ROOT } from "./paths.mjs";

const OLD = "web-bg-2";
const NEW = "dsh-dt-bg";
const apply = process.argv.includes("--apply");
const migrateProfile = process.argv.includes("--migrate-profile");

/* ---------- 一、仓库内的四个文件 ---------- */
const FILES = [
	{
		rel: "lib/index.js",
		edits: [[/const name = "web-bg-2";/, `const name = "${NEW}";`]]
	},
	{
		rel: "lib/client.js",
		edits: [[/const NAMESPACE = "web-bg-2";/, `const NAMESPACE = "${NEW}";`]]
	},
	{
		rel: "cordis.patch.yml",
		edits: [
			[/^\s*name:\s*web-bg-2\s*$/m, `      name: ${NEW}`],
			[/^\s*- id:\s*web-bg-2\s*$/m, `    - id: ${NEW}`]
		]
	},
	{
		rel: "install.mjs",
		edits: [
			[/const PLUGIN_ID = "web-bg-2";/, `const PLUGIN_ID = "${NEW}";`],
			[/const ENTRY_ID = "web-bg-2";/, `const ENTRY_ID = "${NEW}";`],
			[/\^\\s\*name:\\s\*\['"\]\?web-bg-2\['"\]\?\\s\*\$/m, `^\\\\s*name:\\\\s*['"]?${NEW}['"]?\\\\s*$`],
			[/name: \$\{PLUGIN_ID\}/, `name: \${PLUGIN_ID}`]
		]
	}
];

console.log(`命名空间：${OLD} → ${NEW}\n`);
let total = 0;
for (const { rel, edits } of FILES) {
	const file = join(ROOT, rel);
	let text = readFileSync(file, "utf8");
	let changed = 0;
	for (const [re, to] of edits) {
		const before = text;
		text = text.replace(re, to);
		if (text !== before) changed++;
	}
	/* install.mjs 的 hasMountBlock / unmount 里还有裸的 'web-bg-2' 字面量 */
	if (rel === "install.mjs") {
		const before = text;
		text = text.split(`'web-bg-2'`).join(`'${NEW}'`);
		if (text !== before) changed++;
	}
	console.log(`  ${rel.padEnd(22)} 命中 ${changed} 处`);
	total += changed;
	if (apply && changed > 0) writeFileSync(file, text, "utf8");
}

if (!apply) {
	console.log(`\n共 ${total} 处。加 --apply 才会写入。`);
	process.exit(0);
}

/* ---------- 语法检查 ---------- */
console.log("\n语法检查：");
for (const rel of ["lib/index.js", "lib/client.js", "install.mjs"]) {
	try {
		execFileSync(process.execPath, ["--check", join(ROOT, rel)], { stdio: "pipe", timeout: 20000 });
		console.log(`  ✓ ${rel}`);
	} catch {
		console.log(`  ✗ ${rel}（请回滚）`);
		process.exitCode = 1;
	}
}

/* ---------- 二、本机 profile 配置迁移 ---------- */
if (migrateProfile) {
	console.log("\n迁移本机配置：");
	const backup = `${CONFIG_FILE}.bak-namespace-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	console.log(`  已备份 → ${backup}`);

	const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
	const out = [];
	let insertName = 0;
	let rowId = 0;
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
		if (insideInsert && line.trimStart().startsWith("- ") && indent <= insertIndent) insideInsert = false;

		/* ① 挂载块里的 name（只在 insert 块内） */
		if (insideInsert && new RegExp(`^\\s*name:\\s*['"]?${OLD}['"]?\\s*$`).test(line)) {
			out.push(line.replace(OLD, NEW));
			insertName++;
			continue;
		}
		/* ② 用户设置行的 id（顶层 `- id: web-bg-2` 且下一行是 config:） */
		if (new RegExp(`^- id:\\s*${OLD}\\s*$`).test(line)) {
			const next = lines[lines.indexOf(line) + 1] ?? "";
			if (/^\s*config:\s*$/.test(next)) {
				out.push(line.replace(OLD, NEW));
				rowId++;
				continue;
			}
		}
		out.push(line);
	}
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log(`  挂载 name 修正 ${insertName} 处；设置行 id 修正 ${rowId} 处`);
}

console.log("\n完成。**重启 DSH** 后生效。");
