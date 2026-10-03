/**
 * 自检：宿主的 `record.seed` 是否真的写在"序列化并写盘"之前。
 *
 * 这是踩过的坑：`record.seed = …` 曾被放在 `JSON.stringify(record)` 之后，
 * 于是磁盘上的记录**永远没有 seed 字段**，而我恰恰靠这个文件判断状态 ——
 * 白白绕了好几轮。
 *
 * 用法：node tools/check-seed-order.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

for (const [label, file] of [
	["源码", join(ROOT, "lib", "index.js")],
	["部署副本", join(DEPLOYED_DIR, "lib", "index.js")]
]) {
	const src = readFileSync(file, "utf8");
	const lines = src.split("\n");
	/* 注意：handler 里有两处 `JSON.stringify`（patch 分支一处、记录一处），
	   必须取**最后一次**出现，否则会匹到 patch 分支、得出错误结论。 */
	const lastIndexOf = (needle) => {
		for (let i = lines.length - 1; i >= 0; i--) if (lines[i].includes(needle)) return i;
		return -1;
	};
	const seedAt = lastIndexOf("record.seed = {");
	const stringifyAt = lastIndexOf("JSON.stringify(record)");
	const writeAt = lastIndexOf("await appendFile(file, line,");
	const seedCount = lines.filter((l) => l.includes("record.seed = {")).length;

	console.log(`=== ${label} ===`);
	console.log(`  record.seed 赋值行        ${seedAt < 0 ? "未找到 ✗" : seedAt + 1}${seedCount > 1 ? `（出现 ${seedCount} 次，疑似重复）` : ""}`);
	console.log(`  JSON.stringify(record) 行 ${stringifyAt < 0 ? "未找到" : stringifyAt + 1}`);
	console.log(`  appendFile 写盘行         ${writeAt < 0 ? "未找到" : writeAt + 1}`);
	if (seedAt < 0) {
		console.log("  ✗ 没有 record.seed —— 宿主不会把设置送回客户端\n");
		process.exitCode = 1;
		continue;
	}
	const ok = seedAt < stringifyAt && stringifyAt < writeAt;
	console.log(`  ${ok ? "✓" : "✗"} 顺序正确（seed → 序列化 → 写盘）：${ok ? "是" : "否"}`);
	if (!ok) process.exitCode = 1;
	/* 顺带看 seed 白名单里有没有调试开关 */
	const seedBlock = lines.slice(seedAt - 12, seedAt + 2).join("\n");
	const switches = ["noBlanket", "noRowHover", "noTint"].filter((s) => seedBlock.includes(`"${s}"`));
	console.log(`  seed 白名单含调试开关：${switches.length > 0 ? switches.join(", ") : "无 ✗"}`);
	console.log("");
}
