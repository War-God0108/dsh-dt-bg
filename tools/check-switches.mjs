/**
 * 一次性核对"排查开关"从配置到页面的完整链路。
 *
 * 这条链路踩过四次坑，每次的表现都是"改了配置、重启后毫无变化"：
 *   ① 字段不在 Config schema 里 → 宿主读不到
 *   ② 宿主读到了但没放进 seed → 送不到客户端
 *   ③ 客户端 adoptSeed 只认 image → 采纳了也不用
 *   ④ record.seed 写在写盘之后 → 连"有没有送到"都看不到
 *
 * 用法：node tools/check-switches.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

/** 真正实现的门控开关（schema 里应当有对应字段）。 */
const GATED = ["noBlanket"];
/** 代码里存在但未接 schema 的开关（仅作提示，不算失败）。 */
const EXTRA = ["noPanelBg", "noTint", "noFadeNeutralize", "noCornerFill"];

for (const [label, dir] of [
	["源码", join(ROOT, "lib")],
	["部署副本", join(DEPLOYED_DIR, "lib")]
]) {
	const host = readFileSync(join(dir, "index.js"), "utf8");
	const client = readFileSync(join(dir, "client.js"), "utf8");
	console.log(`=== ${label} ===`);

	let bad = 0;
	const rows = [
		["Host schema 定义了门控开关", GATED.every((s) => host.includes(`${s}: z.boolean()`))],
		["Host readOwnSettings 会读开关", GATED.every((s) => host.includes(`"${s}"`))],
		["Host seed 会送开关", host.includes("const SWITCHES = [")],
		["record.seed 在序列化之前", host.lastIndexOf("record.seed = {") < host.lastIndexOf("JSON.stringify(record)")],
		["Client DEFAULTS 定义了开关", GATED.every((s) => new RegExp(`${s}:\\s*(true|false)`).test(client))],
		["Client adoptSeed 采纳开关", client.includes('const k of ["noBlanket"')],
		["Client applyVisual 有 noBlanket 门控", client.includes("if (s.noBlanket === true)")],
		["Client 写入走诊断通道", client.includes("void persist({ [field]: value })")]
	];
	for (const [k, v] of rows) {
		if (!v) bad++;
		console.log(`  ${v ? "OK  " : "✗   "}${k}`);
	}
	const extras = EXTRA.filter((s) => host.includes(`${s}: z.boolean()`));
	console.log(`  （另有开关已接 schema：${extras.length === 0 ? "无" : extras.join(", ")}）`);
	console.log(bad === 0 ? "  → 链路完整\n" : `  → ${bad} 项缺失\n`);
	if (bad > 0) process.exitCode = 1;
}
