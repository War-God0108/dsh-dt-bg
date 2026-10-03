/**
 * 从 profile 配置里改我们的内部调试开关（默认不暴露在设置界面）。
 *
 * 用途：做 A/B —— 例如把 `noBlanket` 打开，看"悬停动画消失"是否由那条规则造成。
 * 只改我们自己条目 config 块内的字段，不动别的。
 *
 * 用法：
 *   node tools/set-switch.mjs noBlanket true
 *   node tools/set-switch.mjs noBlanket false
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const NS = "web-bg-2";
const key = process.argv[2];
const raw = process.argv[3];
if (key === void 0 || raw === void 0) {
	console.log("用法：node tools/set-switch.mjs <字段名> <true|false>");
	process.exit(1);
}
const value = raw === "true";

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
let inside = false;
let configAt = -1;
let changed = 0;
const re = new RegExp(`^(\\s*)${key}:`);
for (let i = 0; i < lines.length; i++) {
	const t = lines[i].trim();
	if (t === `- id: ${NS}`) {
		inside = true;
		continue;
	}
	if (!inside) continue;
	if (/^- /.test(lines[i])) break;
	if (t === "config:") {
		configAt = i;
		continue;
	}
	if (configAt < 0) continue;
	const m = re.exec(lines[i]);
	if (m === null) continue;
	console.log(`  第 ${i + 1} 行：${key} ${lines[i].trim().slice(key.length + 1)} → ${value}`);
	lines[i] = `${m[1]}${key}: ${value}`;
	changed++;
}
if (changed === 0) {
	/* 字段不存在 → 追加到 config 块末尾 */
	if (configAt < 0) {
		console.log("找不到我们的 config 块");
		process.exit(1);
	}
	const indent = `${lines[configAt].slice(0, lines[configAt].length - lines[configAt].trimStart().length)}  `;
	let last = configAt;
	for (let i = configAt + 1; i < lines.length; i++) {
		if (lines[i].trim() === "") continue;
		const ind = lines[i].length - lines[i].trimStart().length;
		if (ind <= indent.length - 2) break;
		if (/^\s*[A-Za-z][\w-]*:/.test(lines[i])) last = i;
	}
	lines.splice(last + 1, 0, `${indent}${key}: ${value}`);
	console.log(`  新增字段：${key}: ${value}`);
	changed++;
}
copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-switch-${Date.now()}`);
writeFileSync(CONFIG_FILE, lines.join("\n"), "utf8");
console.log(`已写入 ${changed} 处。**重启 DSH 生效**（配置只在启动时读入）。`);
