/**
 * 一次性核对：调试开关链路是否完整（这是 A/B 排查的前提）。
 *
 * 踩过的坑：把 `noBlanket: true` 写进配置后毫无变化 ——
 * 因为该字段不在 `Config` schema 里，宿主读不到、也就送不到客户端。
 * 这份检查把链路四段都点一遍。
 *
 * 用法：node tools/check-switch-plumbing.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, ROOT } from "./paths.mjs";

const SWITCHES = ["noBlanket", "noPanelBg", "noTint", "noFadeNeutralize", "noCornerFill", "noRowHover"];
const host = readFileSync(join(ROOT, "lib", "index.js"), "utf8");
const client = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
const cfg = existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, "utf8") : "";

console.log("开关链路的四段（缺一段 A/B 就是空转）：\n");
let bad = 0;
for (const s of SWITCHES) {
	/* ① 客户端 DEFAULTS 里有默认值 */
	const inDefaults = new RegExp(`${s}:\\s*(true|false)`).test(client);
	/* ② 宿主 Config schema 里有定义（否则 readOwnSettings 读不到） */
	const inSchema = new RegExp(`${s}: z\\.boolean\\(\\)`).test(host);
	/* ③ 宿主 seed 白名单里带出去 */
	const inSeed = new RegExp(`"${s}"`).test(host.slice(host.indexOf("const seed = {}"), host.indexOf("record.seed = {")));
	/* ④ 客户端采纳时不再用白名单（用 Object.keys(DEFAULTS)） */
	const adaptive = /for \(const k of Object\.keys\(DEFAULTS\)\)/.test(client);
	const inConfig = cfg.includes(`${s}:`);
	const ok = inDefaults && inSchema && inSeed && adaptive;
	if (!ok) bad++;
	console.log(
		`  ${ok ? "OK  " : "✗   "}${s.padEnd(18)} DEFAULTS=${inDefaults ? "有" : "无"} schema=${inSchema ? "有" : "无"} seed=${inSeed ? "有" : "无"} 客户端自适应采纳=${adaptive ? "是" : "否"}${inConfig ? "（配置里当前已设置）" : ""}`
	);
}
console.log(bad === 0 ? "\n链路完整。" : `\n${bad} 个开关链路不完整 —— 改了也不会生效。`);
process.exitCode = bad === 0 ? 0 : 1;
