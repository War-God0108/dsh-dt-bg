/**
 * 看官方 bundle 类插件如何通过 `dsh.bundle.patch` 自带挂载补丁（用于让我的插件也能"装上即挂载"）。
 * 用法：node tools/probe-bundle-format.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveDshModules } from "./paths.mjs";

const base = resolveDshModules();

/** 在 @deepseek-ai 下找带 dsh.bundle 的包。 */
const found = [];
for (const pkg of readdirSync(base)) {
	const pj = join(base, pkg, "package.json");
	try {
		if (!statSync(pj).isFile()) continue;
	} catch {
		continue;
	}
	let meta;
	try {
		meta = JSON.parse(readFileSync(pj, "utf8"));
	} catch {
		continue;
	}
	if (meta.dsh?.bundle !== void 0) found.push([pkg, meta]);
}
console.log(`带 dsh.bundle 的包：${found.length} 个`);
for (const [pkg, meta] of found.slice(0, 6)) {
	console.log(`\n===== ${pkg} @ ${meta.version} =====`);
	console.log("  dsh =", JSON.stringify(meta.dsh, null, 0).slice(0, 400));
	const patch = meta.dsh?.bundle?.patch;
	if (typeof patch === "string") {
		const p = join(base, pkg, patch);
		console.log(`  patch 文件 ${patch}: ${existsSync(p) ? "存在" : "不存在"}`);
		if (existsSync(p)) {
			const content = readFileSync(p, "utf8");
			console.log("  ── 内容（前 600 字）──");
			console.log(content.split("\n").slice(0, 22).map((l) => "    " + l).join("\n"));
		}
	}
}

/* 同时看一个"客户端插件"的 dsh 清单长什么样（对照我的包） */
console.log("\n===== 对照：dsh-client-ui-settings 的 dsh 清单 =====");
try {
	const meta = JSON.parse(readFileSync(join(base, "dsh-client-ui-settings", "package.json"), "utf8"));
	console.log("  dsh =", JSON.stringify(meta.dsh, null, 2).slice(0, 500));
} catch {
	console.log("  （读取失败）");
}
