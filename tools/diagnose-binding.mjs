/**
 * 一次性把"为什么插件拿不到配置"所需的证据全部收集出来：
 *   1. 插件自己报告的实时状态（layerState：它读到的设置 + 壁纸层实况）
 *   2. profile 配置里与该条目相关的行
 *   3. 四处命名（模块 id / 导出 name / NAMESPACE / 挂载 name）是否一致
 *
 * 用法：node tools/diagnose-binding.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, DEPLOYED_DIR, DIAG_FILE, ROOT } from "./paths.mjs";

/* ---------- 1. 插件实时状态 ---------- */
console.log("① 插件实时状态（来自它自己的上报）\n");
if (!existsSync(DIAG_FILE) || statSync(DIAG_FILE).size === 0) {
	console.log("   诊断文件为空 —— 重启后还没产生上报。");
} else {
	const text = readFileSync(DIAG_FILE, "utf8");
	const lines = text.split("\n").filter((l) => l.trim().startsWith("{"));
	let shown = 0;
	for (let i = lines.length - 1; i >= 0 && shown < 1; i--) {
		let rec;
		try {
			rec = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const s = rec.report?.layerState;
		if (s === undefined) continue;
		shown++;
		console.log(`   时间: ${rec.at}`);
		console.log(`   壁纸层存在: ${s.layerFound}   背景图长度: ${s.bgLen}   是 data URL: ${s.isDataUrl}`);
		console.log(`   图片开头: ${s.bgHead}`);
		console.log(`   ① 插件读到的设置:`);
		for (const [k, v] of Object.entries(s.settings ?? {})) console.log(`      ${k.padEnd(14)} = ${v}`);
	}
	if (shown === 0) console.log("   报告里没有 layerState（探针是后加的，需重启一次才会带）。");
}

/* ---------- 2. 配置 ---------- */
console.log("\n② profile 配置（背景插件相关行）\n");
const cfgLines = readFileSync(CONFIG_FILE, "utf8").split("\n");
cfgLines.forEach((line, i) => {
	if (/dsh-dt-bg|web-bg-2|- insert:|^\s+- id:|^\s+name:|^\s+config:|image:|translucency|enabled:|scope:/.test(line) && !line.includes("base64")) {
		console.log(`   ${String(i + 1).padStart(4)}| ${line}`);
	}
});

/* ---------- 3. 命名一致性 ---------- */
console.log("\n③ 四处命名是否一致\n");
const host = readFileSync(join(ROOT, "lib", "index.js"), "utf8");
const client = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
const patch = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8");
const pick = (t, re) => {
	const m = re.exec(t);
	return m === null ? "(未找到)" : m[1];
};
const deployedHost = join(DEPLOYED_DIR, "lib", "index.js");
console.log(`   lib/index.js 导出 name   = ${pick(host, /const name = "([^"]+)"/)}`);
console.log(`   lib/client.js NAMESPACE  = ${pick(client, /const NAMESPACE = "([^"]+)"/)}`);
console.log(`   包内补丁 挂载 name        = ${pick(patch, /name:\s*(.+)/).trim()}`);
console.log(`   已部署副本 导出 name      = ${existsSync(deployedHost) ? pick(readFileSync(deployedHost, "utf8"), /const name = "([^"]+)"/) : "(未部署)"}`);
const mount = /- insert:\s*\n\s*- id:\s*(\S+)\s*\n\s*name:\s*'?([^'\n]+)'?/g;
let last = null;
let m;
while ((m = mount.exec(readFileSync(CONFIG_FILE, "utf8"))) !== null) last = m;
console.log(`   本机配置 挂载 id / name   = ${last === null ? "(无)" : `${last[1]} / ${last[2].trim()}`}`);
