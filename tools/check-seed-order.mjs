/**
 * 自检：宿主的 `record.seed` 是否写在"序列化并写盘"之前。
 *
 * 这是踩过三次的坑：`record.seed = …` 若放在 `JSON.stringify(record)` 之后，
 * 磁盘上的记录**永远没有 seed 字段** —— 而我恰恰靠这个文件判断
 * "图/开关有没有送到客户端"，于是每次都误读成"没送到"，把排查方向带偏。
 *
 * 实现注意：handler 里可能有多处 `JSON.stringify`（例如写设置的分支）。
 * 所以要**限定在诊断记录那一段里**找，否则会匹到别的分支、得出相反结论。
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
	const lines = readFileSync(file, "utf8").split("\n");

	console.log(`=== ${label} ===`);

	/* 记录段的起点：构造 record 的那一行。
	   它一定出现在 `const record = {` 之后。 */
	const recStart = lines.findIndex((l) => l.includes("const record = {"));
	if (recStart < 0) {
		console.log("  找不到 `const record = {` —— 宿主结构变了，本检查需要同步。");
		process.exitCode = 1;
		continue;
	}

	/* 在记录段内找三处。序列化行形如 `const line = `${JSON.stringify(record)}\n`;`，
	   必须用**整行正则**而不是 includes("JSON.stringify(record)") ——
	   后者会匹到 `record.seed` 那一行里的同名表达式（`image: `data URL ${…}``），
	   于是得出"seed 与序列化同一行 → 顺序不对"的错误结论。 */
	const findLine = (re, from = recStart) => {
		for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
		return -1;
	};
	const stringifyAt = findLine(/const line\s*=.*JSON\.stringify\(record\)/);
	const writeAt = findLine(/await appendFile\(file, line,/);
	const seedAt = findLine(/record\.seed\s*=/, recStart);

	const show = (i) => (i < 0 ? "未找到" : i + 1);
	console.log(`  record 构造行              ${recStart + 1}`);
	console.log(`  record.seed 赋值行         ${show(seedAt)}`);
	console.log(`  序列化（stringify record）行 ${show(stringifyAt)}`);
	console.log(`  写盘（appendFile）行       ${show(writeAt)}`);

	if (seedAt < 0) {
		console.log("  – 本版没有 record.seed（不把设置送回客户端的设计）。跳过。");
		console.log("");
		continue;
	}
	if (stringifyAt < 0 || writeAt < 0) {
		console.log("  ✗ 找不到序列化或写盘行 —— 宿主结构变了，本检查需要同步。");
		process.exitCode = 1;
		console.log("");
		continue;
	}
	const ok = seedAt < stringifyAt && stringifyAt < writeAt;
	console.log(`  ${ok ? "✓" : "✗"} 顺序应满足 seed → 序列化 → 写盘：${ok ? "满足" : "不满足（磁盘记录里将看不到 seed）"}`);
	if (!ok) process.exitCode = 1;
	console.log("");
}
