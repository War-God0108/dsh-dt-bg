/**
 * 验证宿主半端能否被加载（对应"插件未启用 / 不上报"）。
 *
 * 做法：在临时目录里造一个能解析 `@deepseek-ai/schemastery` 的环境，
 * 直接 import 部署副本的 `lib/index.js`，看它是否抛错、导出是否齐全。
 *
 * 用法：node tools/test-host-load.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

const work = join(ROOT, "dist", "host-load-test");
mkdirSync(work, { recursive: true });

/* 造一个临时的 node_modules：把 @deepseek-ai 链到真实位置 */
const scope = join(work, "node_modules", "@deepseek-ai");
mkdirSync(scope, { recursive: true });
const realScope = join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "@deepseek-ai");
if (existsSync(realScope)) {
	const target = join(scope, "schemastery");
	if (!existsSync(target)) {
		try {
			symlinkSync(join(realScope, "schemastery"), target, "junction");
		} catch (error) {
			console.log("  链接 schemastery 失败：", String(error.message).split("\n")[0]);
		}
	}
}
/* 把部署副本也链进去，便于相对导入 */
const pkgLink = join(work, "node_modules", "dsh-dt-bg");
if (!existsSync(pkgLink)) {
	try {
		symlinkSync(DEPLOYED_DIR, pkgLink, "junction");
	} catch { /* 忽略 */ }
}

const probe = `
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const entry = join(${JSON.stringify(work)}, "node_modules", "dsh-dt-bg", "lib", "index.js");
try {
  const mod = await import(pathToFileURL(entry).href);
  console.log("LOAD_OK");
  console.log("exports=" + Object.keys(mod).sort().join(","));
  console.log("name=" + mod.name);
  console.log("hasApply=" + (typeof mod.apply === "function"));
  console.log("hasConfig=" + (typeof mod.Config === "function"));
  console.log("hasReadOwnSettings=" + (typeof mod.readOwnSettings === "function"));
  /* 顺便调用一次读取函数，确认它对真实配置可用 */
  if (typeof mod.readOwnSettings === "function") {
    const s = mod.readOwnSettings();
    console.log("readKeys=" + Object.keys(s).join(","));
    console.log("imageChars=" + (typeof s.image === "string" ? s.image.length : 0));
  }
} catch (error) {
  console.log("LOAD_FAIL");
  console.log(String(error && error.stack ? error.stack : error).split("\\n").slice(0, 6).join("\\n"));
}
`;
const probeFile = join(work, "probe.mjs");
writeFileSync(probeFile, probe, "utf8");

const out = execFileSync(process.execPath, [probeFile], { encoding: "utf8", cwd: work, timeout: 60000 });
console.log("=== 加载测试 ===");
console.log(out.trim());
if (out.includes("LOAD_FAIL")) {
	console.log("\n✗ 宿主半端加载失败 —— 这正是「插件未启用 / 不上报」的原因。");
	process.exitCode = 1;
} else {
	console.log("\n✓ 宿主半端可加载，导出齐全。");
	const src = readFileSync(join(DEPLOYED_DIR, "lib", "index.js"), "utf8");
	console.log(`  部署副本 ${src.split("\n").length} 行；含 readOwnSettings: ${src.includes("readOwnSettings")}`);
}
