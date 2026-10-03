/**
 * 一次性迁移：包改名后，profile 配置里会同时存在新旧两个挂载块
 * （旧的 `name: 'dsh-web-bg-2'` 指向已不存在的目录）。这里只删旧的那块，
 * 保留新的（`name: 'dsh-dt-bg'`），并**保留用户的设置条目**。
 *
 * 用法：node tools/fix-mount-block.mjs [--dry]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const OLD = "dsh-web-bg-2";
const NEW = "dsh-dt-bg";
const dry = process.argv.includes("--dry");

const before = readFileSync(CONFIG_FILE, "utf8");
const lines = before.split("\n");
const out = [];
let removed = 0;
let keptNew = 0;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	/* 形态一：注释行 + `- insert:` + `- id:` + `name:`（install.mjs 写的那种） */
	if (line.trimStart().startsWith("#") && line.includes(OLD)) {
		const rest = lines.slice(i + 1, i + 4).join("\n");
		if (rest.includes("- insert:") && rest.includes(`name: '${OLD}'`)) {
			i += 3;
			removed++;
			continue;
		}
	}
	/* 形态二：没有注释行的三行形态 */
	if (line.trimStart().startsWith("- insert:")) {
		const rest = lines.slice(i + 1, i + 3).join("\n");
		if (rest.includes("- id: web-bg-2") && rest.includes(`name: '${OLD}'`)) {
			i += 2;
			removed++;
			continue;
		}
		if (rest.includes(`name: '${NEW}'`)) keptNew++;
	}
	out.push(line);
}

const after = out.join("\n");
console.log(`${dry ? "[预演] " : ""}移除旧挂载块 ${removed} 个；保留新挂载块 ${keptNew} 个`);
console.log(`剩余「${OLD}」出现次数: ${after.split(OLD).length - 1}`);
console.log(`剩余「${NEW}」出现次数: ${after.split(NEW).length - 1}`);

if (!dry && removed > 0) {
	writeFileSync(CONFIG_FILE, after, "utf8");
	console.log(`已写入 ${CONFIG_FILE}`);
}
