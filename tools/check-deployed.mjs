/**
 * 核对"源码 vs 部署副本"，以及"部署副本里的关键函数是否齐全"。
 *
 * 为什么存在：多次发生"改了源码、跑了 install.mjs、让用户重启，行为却毫无变化"——
 * 因为真正被加载的是部署副本，而它没更新（或只更新了一半）。
 * 这类问题语法检查与单元测试都发现不了。
 *
 * 设计原则：**不要拿另一个版本的期望来判定当前版本**。
 * 本脚本早期硬编码了 writeOwnSettings / 调试开关等字段，
 * 回退到没有这些功能的版本后就开始误报，白白浪费一轮排查。
 * 现在只检查"两份文件是否一致 + 源码里的顶层函数在部署副本里是否都在"。
 *
 * 用法：node tools/check-deployed.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

const srcDir = join(ROOT, "lib");
const depDir = join(DEPLOYED_DIR, "lib");

if (!existsSync(depDir)) {
	console.log(`部署目录不存在：${depDir}\n先跑 node install.mjs`);
	process.exit(1);
}

console.log(`部署目录：${DEPLOYED_DIR}\n`);
console.log("=== 源码 vs 部署副本 ===");
let diff = 0;
for (const f of ["client.js", "index.js"]) {
	const a = readFileSync(join(srcDir, f), "utf8");
	const p = join(depDir, f);
	const b = existsSync(p) ? readFileSync(p, "utf8") : null;
	const same = a === b;
	if (!same) diff++;
	const depDesc = b === null ? "缺失" : `${String(b.split("\n").length).padStart(5)} 行`;
	console.log(`  ${f.padEnd(12)} 源码 ${String(a.split("\n").length).padStart(5)} 行 / 部署 ${depDesc}   ${same ? "一致 ✓" : "不一致 ✗"}`);
	if (existsSync(p)) console.log(`               部署修改时间 ${statSync(p).toLocaleString("zh-CN")}`);
}

/* 关键链路：源码里的顶层函数，部署副本里必须都有。
   不预设"某个版本应该有哪个功能"—— 那是专项检查的事。 */
console.log("\n=== 部署副本是否包含源码里的顶层函数 ===");
const srcHost = readFileSync(join(srcDir, "index.js"), "utf8");
const depHost = readFileSync(join(depDir, "index.js"), "utf8");
const fns = [...srcHost.matchAll(/^function ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
let missing = 0;
for (const fn of fns) {
	const has = new RegExp(`function ${fn}\\b`).test(depHost);
	if (!has) missing++;
	console.log(`  ${has ? "OK  " : "✗   "}${fn}`);
}
console.log(`  源码共 ${fns.length} 个顶层函数`);

/* 客户端：模块 id / NAMESPACE 必须与包名/挂载一致 —— 这决定插件能否加载 */
console.log("\n=== 标识一致性 ===");
const srcClient = readFileSync(join(srcDir, "client.js"), "utf8");
const depClient = readFileSync(join(depDir, "client.js"), "utf8");
const pkgName = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;
const id = (/id:\s*"([^"]+)",\s*\n\s*factory:/.exec(srcClient) ?? [])[1] ?? "(未找到)";
const ns = (/const NAMESPACE = "([^"]+)"/.exec(srcClient) ?? [])[1] ?? "(未找到)";
const depName = (/const name = "([^"]+)"/.exec(depHost) ?? [])[1] ?? "(未找到)";
console.log(`  包名（= 部署目录名）      ${pkgName}`);
console.log(`  模块 id                  ${id}${id === pkgName ? " ✓" : " ✗（应等于包名，否则客户端模块表里找不到）"}`);
console.log(`  宿主导出 name            ${depName}`);
console.log(`  客户端 NAMESPACE         ${ns}${ns === depName ? " ✓ 与宿主一致" : " ✗ 与宿主不一致（配置不会下发）"}`);
console.log(`  部署副本 client.js 与源码一致  ${srcClient === depClient ? "✓" : "✗"}`);

console.log("\n=== 判定 ===");
const idOk = id === pkgName;
const nsOk = ns === depName;
if (diff > 0) {
	console.log("  ✗ 部署副本与源码不一致 —— 先跑 node install.mjs，再重启。");
	process.exitCode = 1;
} else if (missing > 0) {
	console.log(`  ✗ 部署副本缺 ${missing} 个函数 —— 重新部署。`);
	process.exitCode = 1;
} else if (!idOk || !nsOk) {
	console.log("  ✗ 标识不一致 —— 插件会加载失败或收不到配置。");
	process.exitCode = 1;
} else {
	console.log("  ✓ 部署一致、函数齐全、标识匹配。");
}
