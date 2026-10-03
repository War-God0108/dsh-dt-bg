/**
 * 挖出官方"开关（Switch）"控件的完整 CSS 与结构，用于让插件开关 1:1 对齐。
 * 用法：node tools/dump-official-switch.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveDshModules } from "./paths.mjs";

const base = resolveDshModules();

/** 目标包（包含 switchThumb 的那个）。 */
const PKGS = ["dsh-client-ui-settings-models", "dsh-client-ui-settings", "dsh-client-ui-settings-general"];

for (const pkg of PKGS) {
	const file = join(base, pkg, "lib", "client.js");
	try {
		if (!statSync(file).isFile()) continue;
	} catch {
		console.log(`（跳过 ${pkg}：没有 client.js）`);
		continue;
	}
	const text = readFileSync(file, "utf8");
	if (!text.includes("switchThumb")) {
		console.log(`（${pkg} 无 switchThumb）`);
		continue;
	}
	console.log(`===== ${pkg} =====`);
	/* 把含 switch 的 CSS 规则全部打印 */
	const rules = [...text.matchAll(/[.#][A-Za-z0-9_]*[Ss]witch[A-Za-z0-9_]*(?:[^{}]*)\{[^{}]*\}/g)].map((m) => m[0]);
	for (const r of [...new Set(rules)]) {
		console.log(`  ${r.slice(0, 420)}`);
	}
	/* 找组件的 h(...) 结构片段 */
	const i = text.indexOf("switchThumb");
	console.log("\n  组件片段：");
	console.log("  " + text.slice(Math.max(0, i - 700), i + 260).replace(/\n/g, " ").slice(0, 900));
}
