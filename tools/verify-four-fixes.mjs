/**
 * 部署后的四项修复是否都在位（一次看清，不靠猜）。
 *
 * 这四项对应"插件列表没有开关 / 设置改不动 / 壁纸是兜底图"三个症状：
 *   ① configForms 拿不到值时 apply() 不能崩（否则后面全不执行）
 *   ② 设置行必须**无条件注册**（曾被 whileServed 门控住 → 没有开关）
 *   ③ 宿主必须读当前条目配置并随诊断响应送回（否则壁纸是兜底图）
 *   ④ 写入必须走诊断通道（configForms 写不落盘 → 设置改不动）
 *
 * 用法：node tools/verify-four-fixes.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

const stripComments = (s) =>
	s
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1")
		.replace(/`(?:[^`\\]|\\.)*`/g, "``");

for (const [label, dir] of [
	["源码", join(ROOT, "lib")],
	["部署副本", join(DEPLOYED_DIR, "lib")]
]) {
	const hostPath = join(dir, "index.js");
	const clientPath = join(dir, "client.js");
	if (!existsSync(hostPath) || !existsSync(clientPath)) {
		console.log(`=== ${label} === 不存在，跳过\n`);
		continue;
	}
	const code = stripComments(readFileSync(clientPath, "utf8"));
	const host = readFileSync(hostPath, "utf8");
	const hostLines = host.split("\n");
	const at = (re) => hostLines.findIndex((l) => re.test(l));

	console.log(`=== ${label} ===`);
	const rows = [
		["① client: configForms 空值时不崩", /FALLBACK_FORM/.test(code), "否则 apply() 第一行就抛，行注册/壁纸/监听全不执行"],
		["② client: 设置行无条件注册", !/whileServed/.test(code), "被门控住就永远不注册 → 用户看不到「背景」控件"],
		["③ client: 采纳宿主送来的整份设置", /Object\.assign\(seedSettings, patch\)/.test(code), "不采纳就没法显示壁纸与当前值"],
		["③ host: 读当前条目配置", /function readOwnSettings/.test(host), "读不到画面就是内置兜底图"],
		["③ host: seed 在序列化之前", at(/record\.seed\s*=/) >= 0 && at(/record\.seed\s*=/) < at(/const line\s*=.*JSON\.stringify\(record\)/), "写在之后磁盘记录里没有 seed，会误判成「没送到」"],
		["④ client: 写入走诊断通道", /void persist\(\{ \[field\]: value \}\)/.test(code), "只走 configForms 的话设置改不动"],
		["④ host: 写配置入口 + 路由", /function writeOwnSettings/.test(host) && /body\.patch !== void 0/.test(host), "没有入口就没法落盘"],
		["client: seedSettings 覆盖层", /const seedSettings = \{\}/.test(code), "否则订阅回调拿空值把刚改的设置冲掉"]
	];
	let bad = 0;
	for (const [name, ok, hint] of rows) {
		if (!ok) bad++;
		console.log(`  ${ok ? "OK  " : "✗   "}${name}`);
		if (!ok && hint !== void 0) console.log(`        ${hint}`);
	}
	console.log(bad === 0 ? "  → 四项修复全部在位\n" : `  → ${bad} 项缺失\n`);
	if (bad > 0) process.exitCode = 1;
}
