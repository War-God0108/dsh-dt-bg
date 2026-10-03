/**
 * 判决性实验：判断"配置到底有没有下发到插件"。
 *
 * 做法：把 `translucency` 写成一个**绝不会与默认值混淆**的数（0.33 →
 * 面板变量应约为 rgba(21,21,23,0.447)），等客户端刷新后读它自己的上报。
 *   - 读到 0.33 → 配置能下发，之前的问题在别处
 *   - 仍读 1    → 配置确实不下发（问题在绑定层）
 *
 * 用法：node tools/probe-config-delivery.mjs
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, DIAG_FILE } from "./paths.mjs";

const raw = readFileSync(CONFIG_FILE, "utf8");
const backup = `${CONFIG_FILE}.bak-delivery-${Date.now()}`;
copyFileSync(CONFIG_FILE, backup);
console.log(`配置已备份 → ${backup}\n`);

const MARK = 0.33;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 把我们的 config 里某个字段改成指定值。 */
function setField(text, field, value) {
	const re = new RegExp(`^(\\s+)${field}:.*$`, "m");
	if (!re.test(text)) return text;
	return text.replace(re, `$1${field}: ${value}`);
}

const before = /^\s*translucency:\s*([\d.]+)\s*$/m.exec(raw);
console.log(`改前 translucency = ${before === null ? "(未找到)" : before[1]}`);
let text = setField(raw, "translucency", MARK);
if (text === raw) {
	console.log("警告：正则没有替换成功（配置里可能没有 translucency 行）");
}
writeFileSync(CONFIG_FILE, text, "utf8");
console.log(`已写入 translucency = ${MARK}（期望面板 alpha ≈ ${(1 - MARK * 0.65).toFixed(3)}）\n`);

/* 等客户端刷新：客户端启动后约 1.2s 会 refresh 一次；这里多给几轮 */
let got = null;
for (let round = 1; round <= 6; round++) {
	await sleep(5000);
	if (!existsSync(DIAG_FILE)) continue;
	const lines = readFileSync(DIAG_FILE, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
	for (let i = lines.length - 1; i >= 0; i--) {
		let rec;
		try {
			rec = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const s = rec.report?.layerState?.settings;
		const a = rec.report?.applied;
		if (s === undefined) continue;
		got = { at: rec.at, translucency: s.translucency, imageChars: s.imageChars, sidebarVar: a?.sidebarVar };
		break;
	}
	if (got !== null && got.translucency === MARK) break;
	console.log(`  第 ${round} 轮：translucency=${got === null ? "?" : got.translucency}  sidebarVar=${got === null ? "?" : got.sidebarVar}`);
}

console.log("\n=== 结果 ===");
if (got === null) {
	console.log("  没读到任何上报");
} else {
	console.log(`  插件读到的 translucency = ${got.translucency}`);
	console.log(`  面板变量 sidebarVar     = ${got.sidebarVar}`);
	console.log(`  图片字符数              = ${got.imageChars}`);
	const ok = got.translucency === MARK;
	console.log(ok ? "\n  ✓ 配置**能**下发 —— 之前的问题在别处" : "\n  ✗ 配置**不下发** —— 问题在绑定层");
}

/* 还原 */
writeFileSync(CONFIG_FILE, raw, "utf8");
console.log(`\n已还原配置（${join(CONFIG_FILE)}）`);
