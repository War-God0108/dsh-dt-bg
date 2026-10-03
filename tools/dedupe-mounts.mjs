/**
 * 清掉 profile 配置里**过期的背景插件挂载块**，只保留命名空间正确的那一个。
 *
 * 背景：改名过程中 install.mjs 按新 id 追加了挂载块，而旧 id 的块还留着 ——
 * 两个块指向同一个插件，会导致重复注册（设置页出现两组「背景」）。
 *
 * 判定：insert 块内 `name:` 属于背景插件，但 `id:` 与目标 id 不同 → 删除。
 *
 * 用法：node tools/dedupe-mounts.mjs [--dry]
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

/** 目标：id 与 name 都应是这个。 */
const TARGET = "dsh-dt-bg";
/** 归属本插件的其它历史名字（用于识别过期块）。 */
const LEGACY = new Set(["web-bg-2", "dsh-web-bg-2", "dsh-dt-bg"]);
const dry = process.argv.includes("--dry");

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
const removed = [];
let kept = 0;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	/* 处理整个 insert 块：`- insert:` + 缩进的 `- id:` / `name:` */
	if (!line.trimStart().startsWith("- insert:")) {
		out.push(line);
		continue;
	}
	const indent = line.length - line.trimStart().length;
	const block = [line];
	let j = i + 1;
	while (j < lines.length) {
		const l = lines[j];
		const ind = l.length - l.trimStart().length;
		if (l.trim() === "" || ind > indent) {
			/* 只看前几行就够（id / name 紧跟在后面） */
			block.push(l);
			j++;
			if (block.length > 6) break;
			continue;
		}
		break;
	}
	const body = block.join("\n");
	const idMatch = /- id:\s*(\S+)/.exec(body);
	const nameMatch = /name:\s*'?([^'\n]+)'?/.exec(body);
	const id = idMatch === null ? "" : idMatch[1];
	const name = nameMatch === null ? "" : nameMatch[1].trim();

	/* 与背景插件无关的块原样保留 */
	const isOurs = LEGACY.has(id) || LEGACY.has(name);
	if (!isOurs) {
		out.push(...block);
		i = j - 1;
		continue;
	}
	if (id === TARGET && name === TARGET) {
		out.push(...block);
		kept++;
	} else {
		removed.push(`- insert: { id: ${id}, name: ${name} }`);
	}
	i = j - 1;
}

console.log(`保留挂载块 ${kept} 个；移除过期挂载块 ${removed.length} 个`);
for (const r of removed) console.log(`  ✗ ${r}`);

if (dry) {
	console.log("\n[预演] 未写入。");
} else if (removed.length > 0) {
	const backup = `${CONFIG_FILE}.bak-dedupe-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log(`\n已写入（备份 → ${backup}）`);
} else {
	console.log("\n无需改动。");
}
