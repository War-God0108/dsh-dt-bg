/**
 * 调查 DSH 自带的插件管理机制：官方「内置插件」页支持哪些安装方式（npm / 本地目录 / 打包文件），
 * 以便决定这个插件最省事的分发路径。
 *
 * 用法：node tools/probe-plugin-manager.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const base = join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules", "@deepseek-ai");

/** 找出插件管理相关的包。 */
const pkgs = readdirSync(base).filter((p) => p.startsWith("dsh") && /plugin|manager|market|registry/i.test(p));
console.log("相关包:", pkgs.join(", ") || "(无)");

for (const pkg of pkgs) {
	const file = join(base, pkg, "lib", "client.js");
	try {
		if (!statSync(file).isFile()) continue;
	} catch {
		continue;
	}
	const text = readFileSync(file, "utf8");
	console.log(`\n===== ${pkg} =====`);
	for (const needle of ["install", "npm ", "registry", "bundle", "dsh-plugin", "marketplace", "addPlugin", "installPlugin"]) {
		const n = text.split(needle).length - 1;
		if (n > 0) console.log(`  「${needle}」× ${n}`);
	}
	/* 抓几段含 install 的调用上下文 */
	const re = /.{80}install[A-Za-z]*\(.{120}/g;
	let m;
	let shown = 0;
	while ((m = re.exec(text)) !== null && shown < 6) {
		console.log(`  …${m[0].replace(/\n/g, " ")}…`);
		shown++;
	}
}
