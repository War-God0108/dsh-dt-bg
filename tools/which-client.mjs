/**
 * 判定"渲染进程跑的到底是哪一版客户端"，并报出客户端持有的开关值。
 *
 * 为什么需要：宿主半端有版本标记（which-host2.mjs 能看出没重载），客户端原先没有，
 * 于是"改了客户端 → 重启 → 毫无变化"时无法区分：
 *   ① 客户端没加载新代码；② 加载了但逻辑没生效。
 *
 * 用法：node tools/which-client.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEPLOYED_DIR } from "./paths.mjs";

const depClient = join(DEPLOYED_DIR, "lib", "client.js");
const onDisk = existsSync(depClient) ? /CLIENT_BUILD = "([^"]+)"/.exec(readFileSync(depClient, "utf8")) : null;
console.log(`磁盘上的客户端版本标记：${onDisk === null ? "(无 —— 这版还没有标记)" : onDisk[1]}\n`);

const FILE = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
if (!existsSync(FILE)) {
	console.log("没有诊断文件");
	process.exit(1);
}
const lines = readFileSync(FILE, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
let seen = null;
for (let i = lines.length - 1; i >= 0 && i > lines.length - 20; i--) {
	let r;
	try {
		r = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const s = r.report?.applied;
	if (s !== void 0) {
		seen = { at: r.at, build: s.clientBuild ?? "(无标记)", settings: s.settings ?? null, attrs: s.htmlAttrs ?? [], committed: s.committedKeys ?? [] };
		break;
	}
}
if (seen === null) {
	console.log("最近 20 条里没有带 applied 的记录");
	process.exit(1);
}

console.log("=== 运行中的客户端 ===");
console.log(`  上报时间        ${seen.at}`);
console.log(`  clientBuild     ${seen.build}`);
console.log(`  与磁盘一致      ${onDisk !== null && seen.build === onDisk[1] ? "是 ✓" : "否 ✗（客户端没加载新代码）"}`);
console.log(`  已提交的设置键  ${seen.committed.length === 0 ? "(空)" : seen.committed.join(", ")}`);

console.log("\n=== 客户端实际持有的开关值 ===");
if (seen.settings === null) {
	console.log("  探针里没有 settings（这一版客户端还没有该字段）");
} else {
	for (const k of ["enabled", "kind", "translucency", "scope", "noBlanket", "noTint", "noPanelBg", "noRowHover", "noCornerFill"]) {
		console.log(`  ${k.padEnd(16)} = ${String(seen.settings[k])}`);
	}
	console.log(`  imageChars       = ${seen.settings.imageChars}`);
}

console.log("\n=== html 上的插件属性 ===");
for (const a of seen.attrs) console.log(`  ${a}`);
const has = (n) => seen.attrs.some((a) => a.includes(n));
if (seen.settings !== null) {
	const expectBlanket = seen.settings.noBlanket !== true;
	const actualBlanket = has("blanket");
	console.log(
		`\n  一致性：noBlanket=${seen.settings.noBlanket} 时 blanket 属性应${expectBlanket ? "存在" : "不存在"}，实际${actualBlanket ? "存在" : "不存在"} → ${expectBlanket === actualBlanket ? "一致 ✓" : "不一致 ✗（说明 applyVisual 没按该值执行）"}`
	);
}
