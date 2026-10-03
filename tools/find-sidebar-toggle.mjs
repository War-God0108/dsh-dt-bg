/**
 * 在官方 ui 包里找"侧边栏折叠/展开按钮"的组件与样式，确认它正常应当在哪、
 * 什么条件下出现（hover？），以及是否有定位规则会被插件影响。
 *
 * 用法：node tools/find-sidebar-toggle.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const base = join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules", "@deepseek-ai");

/** 侧边栏组件的类名前缀（真机实测：`_2H3hWW_logoRow`）。 */
const PREFIX = "_2H3hWW_";

const hits = [];
for (const pkg of readdirSync(base)) {
	const dir = join(base, pkg, "lib");
	let files;
	try {
		files = readdirSync(dir);
	} catch {
		continue;
	}
	for (const file of files) {
		if (!file.endsWith(".js")) continue;
		const p = join(dir, file);
		let text;
		try {
			if (statSync(p).size > 12 * 1024 * 1024) continue;
			text = readFileSync(p, "utf8");
		} catch {
			continue;
		}
		if (text.includes(PREFIX)) hits.push([pkg, p, text]);
	}
}
console.log(`含侧边栏类名前缀「${PREFIX}」的包：${hits.length} 个`);
for (const [pkg, p] of hits) console.log(`  ${pkg}  ${p.replace(base, "…")}`);

if (hits.length === 0) process.exit(0);

const [pkg, file, text] = hits[0];
console.log(`\n===== 分析 ${pkg} =====`);

/** 抽出该组件的全部 CSS 规则（形如 ._2H3hWW_xxx{...}）。 */
const rules = text.match(/\.[_A-Za-z0-9]*_2H3hWW_[A-Za-z0-9_]*[^{]*\{[^}]*\}/g) ?? [];
console.log(`共 ${rules.length} 条 CSS 规则`);
for (const rule of rules) {
	/* 只打印与 logo / 折叠 / toggle / 顶部行相关的 */
	if (/logoRow|brand|collapse|toggle|expand|rail|topRow|header/i.test(rule)) {
		console.log(`\n  ${rule.replace(/\s+/g, " ").slice(0, 400)}`);
	}
}

/* 找 JSX/模板里折叠按钮的出现位置 */
console.log("\n===== 折叠按钮的用法（JS 里的上下文）=====");
for (const needle of ["logoRow", "collapse", "Collapse", "toggleSidebar", "sidebarCollapsed"]) {
	let i = text.indexOf(needle);
	let n = 0;
	while (i >= 0 && n < 2) {
		console.log(`\n--- ${needle} @${i} ---`);
		console.log(`  ${text.slice(Math.max(0, i - 160), i + 220).replace(/\n/g, " ").replace(/\s+/g, " ")}`);
		i = text.indexOf(needle, i + needle.length);
		n++;
	}
}
