/**
 * 核对"源码 vs 部署副本"以及"调试开关链路在部署副本里是否完整"。
 *
 * 这个检查是被同一类事故逼出来的：改了源码、跑了 install.mjs、让用户重启，
 * 结果行为毫无变化 —— 因为真正被加载的是部署副本，而它没更新（或更新的是半端）。
 *
 * 用法：node tools/check-deployed.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

const srcDir = join(ROOT, "lib");
const depDir = join(DEPLOYED_DIR, "lib");
console.log("部署目录:", DEPLOYED_DIR);
console.log("");

console.log("=== 源码 vs 部署副本 ===");
let diff = 0;
for (const f of ["client.js", "index.js"]) {
	const a = readFileSync(join(srcDir, f), "utf8");
	const p = join(depDir, f);
	const b = existsSync(p) ? readFileSync(p, "utf8") : null;
	const same = a === b;
	if (!same) diff++;
	console.log(`  ${f.padEnd(12)} 源码 ${String(a.split("\n").length).padStart(5)} 行 / 部署 ${b === null ? "缺失" : String(b.split("\n").length).padStart(5) + " 行"}   ${same ? "一致 ✓" : "不一致 ✗"}`);
	console.log(`               部署修改时间 ${existsSync(p) ? statSync(p).toLocaleString() : "-"}`);
}

console.log("\n=== 调试开关在**部署副本**里是否完整 ===");
const dep = existsSync(join(depDir, "index.js")) ? readFileSync(join(depDir, "index.js"), "utf8") : "";
const SWITCHES = ["noBlanket", "noPanelBg", "noTint", "noFadeNeutralize", "noCornerFill", "noRowHover"];
let bad = 0;
for (const s of SWITCHES) {
	const inSchema = dep.includes(`${s}: z.boolean()`);
	const inSeed = dep.includes(`"${s}"`);
	const ok = inSchema && inSeed;
	if (!ok) bad++;
	console.log(`  ${ok ? "OK  " : "✗   "}${s.padEnd(18)} schema=${inSchema ? "有" : "无"} seed=${inSeed ? "有" : "无"}`);
}

console.log("\n=== 判定 ===");
if (diff > 0) {
	console.log("  ✗ 部署副本与源码不一致 —— 先跑 node install.mjs，再重启。");
	process.exitCode = 1;
} else if (bad > 0) {
	console.log("  ✗ 部署副本里的开关链路不完整 —— A/B 会是空转。");
	process.exitCode = 1;
} else {
	console.log("  ✓ 部署一致且开关链路完整。若行为仍无变化，那是「规则确实与此无关」。");
}
