/**
 * 从配置里删除已废弃的开关。
 *
 * 用途：功能撤销后，配置里的残留字段不会再被 schema 识别，
 * 留着只会让人误以为"这个开关还在起作用"（排查时极具误导性）。
 *
 * 用法：
 *   node tools/drop-switch.mjs noRowHover noTint        # 预演
 *   node tools/drop-switch.mjs --apply noRowHover noTint
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const NS = "web-bg-2";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const keys = args.filter((a) => a !== "--apply");
if (keys.length === 0) {
	console.log("用法：node tools/drop-switch.mjs [--apply] <字段名...>");
	process.exit(1);
}

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
let inside = false;
const out = [];
let dropped = 0;
for (const line of lines) {
	const t = line.trim();
	if (t === `- id: ${NS}`) inside = true;
	else if (inside && /^- /.test(line)) inside = false;
	if (inside) {
		const m = /^\s*([A-Za-z][\w-]*):/.exec(line);
		if (m !== null && keys.includes(m[1])) {
			console.log(`  删除第 ${out.length + 1} 行附近的 ${line.trim()}`);
			dropped++;
			continue;
		}
	}
	out.push(line);
}
console.log(`\n共删除 ${dropped} 个字段`);
if (apply && dropped > 0) {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-dropswitch-${Date.now()}`);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log("已写入。");
} else if (!apply) {
	console.log("[预演] 未写入。加 --apply 生效。");
}
