/**
 * 找到官方设置里"开关（Switch）"控件的类名与样式，用于让插件的开关与之对齐。
 * 用法：node tools/find-official-switch.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const base = join(
	homedir(),
	"AppData",
	"Local",
	"npm-cache",
	"_npx",
	"1e7f6d9597241db0",
	"node_modules",
	"@deepseek-ai"
);

/** 逐个包扫 client.js，找 switch 类名与它的 CSS 规则。 */
const classHits = new Map();
for (const pkg of readdirSync(base)) {
	if (!pkg.startsWith("dsh-client")) continue;
	const file = join(base, pkg, "lib", "client.js");
	try {
		if (!statSync(file).isFile()) continue;
	} catch {
		continue;
	}
	const text = readFileSync(file, "utf8");
	for (const m of text.matchAll(/[A-Za-z0-9_]{5,10}_switch[A-Za-z0-9_]*/g)) {
		if (!classHits.has(m[0])) classHits.set(m[0], { pkg, file });
	}
}

if (classHits.size === 0) {
	console.log("没有找到 *_switch* 类名。改找含 'switch' 的字符串：");
	for (const pkg of readdirSync(base)) {
		if (!pkg.startsWith("dsh-client")) continue;
		const file = join(base, pkg, "lib", "client.js");
		try {
			if (!statSync(file).isFile()) continue;
		} catch {
			continue;
		}
		const text = readFileSync(file, "utf8");
		const n = text.split("switch").length - 1;
		if (n > 0) console.log(`  ${pkg}: ${n} 处`);
	}
	process.exit(0);
}

for (const [cls, info] of classHits) {
	console.log(`类名 ${cls}  （来自 ${info.pkg}）`);
	const text = readFileSync(info.file, "utf8");
	/* 把这些类的 CSS 规则挑出来 */
	for (const m of text.matchAll(new RegExp(`[^{}"]*\\.${cls}[^{}]*\\{[^{}]*\\}`, "g"))) {
		console.log(`   ${m[0].slice(0, 300)}`);
	}
	console.log("");
}
