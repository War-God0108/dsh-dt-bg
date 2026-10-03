/**
 * 直接验证部署副本的 `readOwnSettings()` 能否读出配置里的壁纸。
 *
 * 为什么单独测这一步：真机上客户端的 `configForms.get()` 返回空，
 * **壁纸只能靠宿主从配置文件读出来再送回客户端**。这条读取一旦失效，
 * 表现就是"设置里明明有图，画面却是内置兜底图"——而且从界面上看不出原因。
 *
 * 用法：node tools/test-read-own.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DSH_HOME, ROOT } from "./paths.mjs";

/* 用 package.json 的真实包名定位部署副本（曾经写死旧包名导致假失败） */
const pkgName = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;
const deployedDir = join(DSH_HOME, "profiles", "node_modules", pkgName);
if (!existsSync(deployedDir)) {
	console.log(`部署目录不存在：${deployedDir}\n先跑 install.mjs`);
	process.exit(1);
}

/* 造一个能解析 @deepseek-ai/schemastery 的临时环境再 import 宿主半端 */
const work = join(ROOT, "dist", "read-own-test");
mkdirSync(join(work, "node_modules", "@deepseek-ai"), { recursive: true });
const realScope = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai");
const link = join(work, "node_modules", "@deepseek-ai", "schemastery");
if (existsSync(realScope) && !existsSync(link)) {
	try {
		symlinkSync(join(realScope, "schemastery"), link, "junction");
	} catch { /* 忽略 */ }
}

const probe = `
import { pathToFileURL } from "node:url";
const mod = await import(pathToFileURL(${JSON.stringify(join(deployedDir, "lib", "index.js"))}).href);
if (typeof mod.readOwnSettings !== "function") {
  console.log("NO_FUNCTION");
  process.exit(0);
}
const s = mod.readOwnSettings();
console.log("KEYS=" + Object.keys(s).filter((k) => k !== "__source").join(","));
console.log("IMAGE_CHARS=" + (typeof s.image === "string" ? s.image.length : 0));
console.log("IMAGE_HEAD=" + (typeof s.image === "string" ? s.image.slice(0, 30) : ""));
console.log("TRANSLUCENCY=" + s.translucency);
console.log("SOURCE=" + (s.__source ?? ""));
`;
const probeFile = join(work, "probe.mjs");
writeFileSync(probeFile, probe, "utf8");

const out = execFileSync(process.execPath, [probeFile], {
	cwd: dirname(CONFIG_FILE),
	encoding: "utf8",
	timeout: 60000
});
console.log("=== 部署副本 readOwnSettings() 的读取结果 ===");
for (const line of out.trim().split("\n")) console.log(`  ${line}`);

const chars = Number((/IMAGE_CHARS=(\d+)/.exec(out) ?? [])[1] ?? 0);
const keys = ((/KEYS=(.*)/.exec(out) ?? [])[1] ?? "").split(",").filter(Boolean);
console.log("\n=== 判定 ===");
if (out.includes("NO_FUNCTION")) {
	console.log("  - 本版宿主没有 readOwnSettings（不是「宿主读配置」的设计）。");
} else if (chars > 0 && keys.includes("image")) {
	console.log(`  ✓ 读到了壁纸（${(chars / 1024).toFixed(0)} KB）与 ${keys.length} 个字段 —— 客户端会拿到它。`);
} else {
	console.log("  ✗ 没读到壁纸 —— 客户端会回落成内置兜底图。");
	console.log(`    配置里的 image 字段存在吗：${readFileSync(CONFIG_FILE, "utf8").includes("image:") ? "存在" : "不存在"}`);
	process.exitCode = 1;
}

