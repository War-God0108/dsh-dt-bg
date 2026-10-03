/**
 * 把「配置命名空间」恢复到已知可用的形态。
 *
 * 证据：改名之前，插件工作正常，当时的形态是
 *   挂载 `- id: web-bg-2 / name: 'web-bg-2'`、客户端 NAMESPACE = web-bg-2、
 *   宿主导出 name = web-bg-2、用户设置行 `- id: web-bg-2`。
 * 改成 dsh-dt-bg 之后配置就不再下发（实测：连 8 KiB 的图片都送不进去）。
 *
 * 本脚本把四处一起改回 web-bg-2，并清理重复/失效的挂载块与设置行。
 *
 * 用法：
 *   node tools/restore-namespace.mjs                # 预演
 *   node tools/restore-namespace.mjs --apply
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, ROOT } from "./paths.mjs";

const OLD = "dsh-dt-bg";
const NS = "web-bg-2";
const apply = process.argv.includes("--apply");

/* ---------- 仓库文件 ---------- */
const FILES = [
	["lib/index.js", [[/const name = "dsh-dt-bg";/, `const name = "${NS}";`]]],
	["lib/client.js", [[/const NAMESPACE = "dsh-dt-bg";/, `const NAMESPACE = "${NS}";`]]],
	[
		"cordis.patch.yml",
		[
			[/^(\s*- id:\s*)dsh-dt-bg\s*$/m, `$1${NS}`],
			[/^(\s*name:\s*)dsh-dt-bg\s*$/m, `$1${NS}`]
		]
	],
	[
		"install.mjs",
		[
			[/const PLUGIN_ID = "dsh-dt-bg";/, `const PLUGIN_ID = "${NS}";`],
			[/const ENTRY_ID = "dsh-dt-bg";/, `const ENTRY_ID = "${NS}";`],
			[/\^\\s\*name:\\s\*\['"\]\?dsh-dt-bg/, `^\\\\s*name:\\\\s*['"]?${NS}`]
		]
	]
];

console.log(`命名空间：${OLD} → ${NS}\n`);
for (const [rel, edits] of FILES) {
	const file = join(ROOT, rel);
	let text = readFileSync(file, "utf8");
	let n = 0;
	for (const [re, to] of edits) {
		const before = text;
		text = text.replace(re, to);
		if (text !== before) n++;
	}
	console.log(`  ${rel.padEnd(20)} 命中 ${n} 处`);
	if (apply && n > 0) writeFileSync(file, text, "utf8");
}

if (apply) {
	console.log("\n语法检查：");
	for (const rel of ["lib/index.js", "lib/client.js", "install.mjs"]) {
		try {
			execFileSync(process.execPath, ["--check", join(ROOT, rel)], { stdio: "pipe", timeout: 20000 });
			console.log(`  ✓ ${rel}`);
		} catch {
			console.log(`  ✗ ${rel}`);
			process.exitCode = 1;
		}
	}
}

/* ---------- profile 配置：清理 + 改回 ---------- */
console.log("\nprofile 配置：");
const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
let removedInserts = 0;
let keptInsert = 0;
let fixedRows = 0;

/** 判断某个 `- id:` 行是否属于背景插件（包括历史名）。 */
const isOurs = (id) => ["dsh-dt-bg", "web-bg-2", "dsh-web-bg-2"].includes(id);

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];

	/* insert 块：只保留一个，且 name 用命名空间 */
	if (line.trimStart().startsWith("- insert:")) {
		const indent = line.length - line.trimStart().length;
		const block = [line];
		let j = i + 1;
		while (j < lines.length && block.length <= 6) {
			const l = lines[j];
			const ind = l.length - l.trimStart().length;
			if (l.trim() === "" || ind > indent) {
				block.push(l);
				j++;
				continue;
			}
			break;
		}
		const body = block.join("\n");
		const idM = /- id:\s*(\S+)/.exec(body);
		const id = idM === null ? "" : idM[1];
		if (isOurs(id)) {
			if (keptInsert === 0) {
				/* 保留一个：id 与 name 都改成命名空间 */
				const rewritten = body
					.replace(/- id:\s*\S+/, `- id: ${NS}`)
					.replace(/name:\s*'?[^'\n]+'?/, `name: '${NS}'`);
				out.push(...rewritten.split("\n"));
				keptInsert++;
			} else {
				removedInserts++;
			}
			i = j - 1;
			continue;
		}
		out.push(...block);
		i = j - 1;
		continue;
	}

	/* 设置行：`- id: <我们的>` 且下一行是 config: → 改成命名空间 */
	const rowM = /^- id:\s*(\S+)\s*$/.exec(line);
	if (rowM !== null && isOurs(rowM[1]) && /^\s*config:\s*$/.test(lines[i + 1] ?? "")) {
		if (rowM[1] !== NS) {
			out.push(`- id: ${NS}`);
			fixedRows++;
		} else {
			out.push(line);
		}
		continue;
	}
	out.push(line);
}

console.log(`  保留挂载块 ${keptInsert} 个；删除重复挂载块 ${removedInserts} 个；修正设置行 id ${fixedRows} 处`);

if (apply) {
	const backup = `${CONFIG_FILE}.bak-restorens-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log(`  已写入（备份 → ${backup}）`);
} else {
	console.log("  [预演] 未写入");
}

console.log(apply ? "\n完成。**重启 DSH** 后生效。" : "\n加 --apply 生效。");
