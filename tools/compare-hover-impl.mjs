/**
 * 对比"21:41 那版"与当前版本的悬停相关实现。
 *
 * 用户反馈：回退后「新会话」不再发灰了，但"跟随鼠标位置的悬停动画"仍然没有。
 * 因为回退版本来就含 paintRow 那套行内悬停，需要判断它是否本来就把
 * 「新会话」纳入了接管范围（ROW_SELECTOR 里含 [class*=newSession]）。
 *
 * 用法：node tools/compare-hover-impl.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const GOOD = "415ce3f";
const good = execFileSync("git", ["show", `${GOOD}:lib/client.js`], { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const now = readFileSync(join(ROOT, "lib", "client.js"), "utf8");

const KEYS = ["ROW_SELECTOR =", "function paintRow", "function rowTarget", "pointerover", "pointerout", "selectedPainter"];
for (const [label, src] of [
	[`${GOOD}（21:41 那版）`, good],
	["当前", now]
]) {
	const lines = src.split("\n");
	console.log(`=== ${label} ===`);
	for (const kw of KEYS) {
		const i = lines.findIndex((l) => l.includes(kw));
		console.log(`  ${kw.padEnd(20)} ${i < 0 ? "未找到" : `第 ${i + 1} 行`}`);
	}
	const rs = lines.find((l) => l.includes("ROW_SELECTOR ="));
	console.log(`  → 选择器：${rs === void 0 ? "(无)" : rs.trim()}`);
	console.log("");
}

/* 逐行确认二者的悬停实现是否完全一致 */
const seg = (src) => {
	const lines = src.split("\n");
	const a = lines.findIndex((l) => l.includes("const ROW_SELECTOR ="));
	const b = lines.findIndex((l) => l.includes("function startWatcher"));
	return lines.slice(a, b).join("\n");
};
const same = seg(good) === seg(now);
console.log(`悬停相关代码段（ROW_SELECTOR → startWatcher）两版是否逐字相同：${same ? "是 ✓" : "否 ✗"}`);
if (!same) {
	const a = seg(good).split("\n");
	const b = seg(now).split("\n");
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		if (a[i] !== b[i]) {
			console.log(`  第一处差异（段内第 ${i + 1} 行）：`);
			console.log(`    ${GOOD}: ${a[i] === void 0 ? "(无)" : a[i].trim().slice(0, 120)}`);
			console.log(`    当前  : ${b[i] === void 0 ? "(无)" : b[i].trim().slice(0, 120)}`);
			break;
		}
	}
}
