/**
 * 重启后的一键自检：确认"插件加载 → 配置送达 → 壁纸生效"三件事。
 *
 * 用法：node tools/verify-live.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CONFIG_FILE, DIAG_FILE, ROOT } from "./paths.mjs";

/** 从配置里读"期望值"。 */
const cfgText = readFileSync(CONFIG_FILE, "utf8");
const require = createRequire(import.meta.url);
let expected = null;
try {
	const YAML = require(join((await import("./paths.mjs")).resolveDshModules(), "..", "yaml"));
	const doc = YAML.parse(cfgText);
	const pkgName = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;
	const row = doc.find((e) => e !== null && typeof e === "object" && e.id === pkgName && e.config !== void 0);
	if (row !== void 0) expected = row.config;
} catch {
	expected = null;
}

console.log("=== 期望值（来自 profile 配置）===");
if (expected === null) {
	console.log("  读取失败");
} else {
	console.log(`  图片字符数 = ${typeof expected.image === "string" ? expected.image.length : 0}`);
	console.log(`  通透强度   = ${expected.translucency}`);
	console.log(`  透出范围   = ${expected.scope}`);
	console.log(`  压暗       = ${expected.dim}`);
}

/* 读最新上报 */
console.log("\n=== 插件实际上报 ===");
let got = null;
if (!existsSync(DIAG_FILE) || statSync(DIAG_FILE).size === 0) {
	console.log("  诊断文件为空 —— 重启后插件还没上报（或插件没加载）");
} else {
	const lines = readFileSync(DIAG_FILE, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
	for (let i = lines.length - 1; i >= 0; i--) {
		let rec;
		try {
			rec = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const ls = rec.report?.layerState;
		if (ls === undefined) continue;
		got = { at: rec.at, settings: ls.settings, bgLen: ls.bgLen, isDataUrl: ls.isDataUrl, sidebarVar: rec.report?.applied?.sidebarVar };
		break;
	}
	if (got === null) {
		console.log("  上报里没有 layerState 字段");
	} else {
		console.log(`  上报时间   = ${got.at}`);
		console.log(`  图片字符数 = ${got.settings?.imageChars}`);
		console.log(`  通透强度   = ${got.settings?.translucency}`);
		console.log(`  透出范围   = ${got.settings?.scope}`);
		console.log(`  压暗       = ${got.settings?.dim}`);
		console.log(`  壁纸层背景 = ${got.bgLen} 字符（${got.isDataUrl ? "data URL" : "其它"}）`);
		console.log(`  面板变量   = ${got.sidebarVar}`);
	}
}

/* 判定 */
console.log("\n=== 判定 ===");
if (got === null) {
	console.log("  ✗ 拿不到插件上报 —— 插件可能没加载（查「设置 → 内置插件」里是否列出 dsh-dt-bg）");
	process.exitCode = 1;
} else {
	const checks = [
		["配置送达（图片非空）", (got.settings?.imageChars ?? 0) > 0],
		["配置送达（通透一致）", expected === null || got.settings?.translucency === expected.translucency],
		["壁纸用的是自定义图", got.isDataUrl === true && got.bgLen > 10000],
		["面板真的透出（变量 < 1）", /rgba\([^)]*0\.\d+\)/.test(String(got.sidebarVar))]
	];
	let bad = 0;
	for (const [label, ok] of checks) {
		if (!ok) bad++;
		console.log(`  ${ok ? "✓" : "✗"} ${label}`);
	}
	console.log(bad === 0 ? "\n全部正常 —— 插件已可用。" : `\n${bad} 项异常。`);
	if (bad > 0) {
		console.log("\n提示：若「配置送达」为 ✗ 但配置本身正确，多半是**这次重启之前**改的配置 ——");
		console.log("      再重启一次 DSH 即可（配置只在启动时读入）。");
	}
	process.exitCode = bad === 0 ? 0 : 1;
}
