/**
 * 给测试文件里每个用到 `adoptSeed` 的用例开头插入 `resetSeed();`。
 *
 * 背景：模块只被 eval 一次，`seedAdopted` 是模块级状态 ——
 * 第一个调用 adoptSeed 的用例会把它置真，后续用例就全都拿不到种子。
 * 真机上"一次会话只采纳一次"是对的，但测试需要每个用例重新开始。
 *
 * 用法：node tools/patch-tests-reset-seed.mjs [--apply]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const file = join(ROOT, "test", "client-visual.test.mjs");
const lines = readFileSync(file, "utf8").split("\n");

const out = [];
let inserted = 0;
for (let i = 0; i < lines.length; i++) {
	out.push(lines[i]);
	/* 用例标题里提到"采纳宿主"的，就是需要种子的那几个 */
	if (!/^test\(/.test(lines[i]) || !/采纳宿主/.test(lines[i])) continue;
	const next = lines[i + 1];
	if (next === void 0 || !/buildApp\(\)/.test(next)) continue;
	out.push("\tresetSeed();");
	inserted++;
}
console.log(`${apply ? "已修改" : "[预演] 将修改"}：插入 ${inserted} 处 resetSeed()`);
if (apply) writeFileSync(file, out.join("\n"), "utf8");
else console.log("加 --apply 生效。");
