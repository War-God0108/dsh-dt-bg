/**
 * 调查官方 dsh-plugin-manager 的安装方式与包格式要求。
 * 用法：node tools/probe-plugin-install.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const base = join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules", "@deepseek-ai");

function readPkg(pkg, file) {
	const p = join(base, pkg, file);
	try {
		if (!statSync(p).isFile()) return null;
		return readFileSync(p, "utf8");
	} catch {
		return null;
	}
}

/* 1) plugin-manager 的清单文件里能看到它导出什么 */
for (const pkg of ["dsh-plugin-manager", "dsh-host-plugin-inventory"]) {
	const pj = readPkg(pkg, "package.json");
	console.log(`===== ${pkg} =====`);
	if (pj === null) {
		console.log("  （没有 package.json）");
		continue;
	}
	const meta = JSON.parse(pj);
	console.log("  version:", meta.version);
	console.log("  main:", meta.main ?? meta.exports);
	console.log("  deps:", Object.keys(meta.dependencies ?? {}).join(", ").slice(0, 200));
	const files = (() => {
		try {
			return readdirSync(join(base, pkg, "lib")).join(", ");
		} catch {
			return "(无 lib)";
		}
	})();
	console.log("  lib/:", files);
	console.log("");
}

/* 2) 在 plugin-manager 里找"从哪儿装"的证据 */
const text = readPkg("dsh-plugin-manager", "lib/index.js") ?? "";
console.log("dsh-plugin-manager/lib/index.js 长度:", text.length);
for (const needle of ["npm install", "npm i ", "pnpm add", "git+", "tarball", "localPath", "installDir", "pluginsDir", "manifest", "dsh.plugin"]) {
	const n = text.split(needle).length - 1;
	if (n > 0) console.log(`  「${needle}」× ${n}`);
}
console.log("\n关键片段：");
for (const needle of ["pluginsDir", "npm install", "dsh.plugin"]) {
	const i = text.indexOf(needle);
	if (i < 0) continue;
	console.log(`--- ${needle} ---`);
	console.log(text.slice(Math.max(0, i - 260), i + 320).replace(/\n/g, " ").slice(0, 560));
	console.log("");
}
void existsSync;
