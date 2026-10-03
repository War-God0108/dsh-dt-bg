/**
 * 在 DSH 应用 bundle 里找侧边栏 logo 行与折叠按钮（`_2H3hWW_toggle` / `_2H3hWW_logoRow`）的官方样式，
 * 用于判断"折叠按钮压在 logo 上"是官方原样，还是被插件规则影响。
 *
 * 用法：node tools/find-toggle-css.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** 搜索根：DSH 应用目录 + profiles 的 node_modules。 */
const roots = [
	join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules"),
	"D:\\应用\\deepseekHARNESS\\resources\\app.asar",
	join(homedir(), ".dsh", "profiles", "node_modules")
];

const NEEDLES = ["_2H3hWW_toggle", "_2H3hWW_logoRow"];
const hits = [];

function scan(dir, depth) {
	if (depth > 5 || hits.length > 60) return;
	let items;
	try {
		items = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const item of items) {
		const p = join(dir, item.name);
		if (item.isDirectory()) {
			if (item.name === ".git" || item.name === "screenshots") continue;
			scan(p, depth + 1);
			continue;
		}
		if (!/\.(js|mjs|cjs|css|html)$/.test(item.name)) continue;
		let stat;
		try {
			stat = statSync(p);
		} catch {
			continue;
		}
		if (stat.size > 20 * 1024 * 1024) continue;
		let text;
		try {
			text = readFileSync(p, "utf8");
		} catch {
			continue;
		}
		for (const needle of NEEDLES) {
			if (text.includes(needle)) {
				hits.push([p, needle, text]);
				break;
			}
		}
	}
}

for (const root of roots) scan(root, 0);
console.log(`命中文件：${hits.length}`);
for (const [p, needle] of hits) console.log(`  [${needle}] ${p}`);

if (hits.length === 0) {
	console.log("\n未找到（类名可能经过压缩/哈希化，或位于 asar 内无法直接读取）");
	process.exit(0);
}

/* 打印每个命中文件里与 toggle / logoRow 相关的 CSS 规则 */
for (const [p, , text] of hits.slice(0, 4)) {
	console.log(`\n===== ${p} =====`);
	const rules = text.match(/\.[^{}]*_2H3hWW_(?:toggle|logoRow|iconButton|brand)[^{]*\{[^}]*\}/g) ?? [];
	console.log(`相关规则 ${rules.length} 条：`);
	for (const rule of rules.slice(0, 14)) console.log(`  ${rule.replace(/\s+/g, " ").slice(0, 300)}`);
	/* 再看 JS 里 toggle 的渲染上下文 */
	const i = text.indexOf("_2H3hWW_toggle");
	if (i > 0) {
		console.log("\n  toggle 的渲染上下文：");
		console.log(`  ${text.slice(Math.max(0, i - 300), i + 300).replace(/\n/g, " ").replace(/\s+/g, " ").slice(0, 560)}`);
	}
}
