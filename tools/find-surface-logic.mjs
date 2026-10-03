/**
 * 查 `surface` 标记（"真正画底色的那层"）是怎么打的、打在谁身上。
 *
 * 背景：blanket 规则把面板内**所有**后代底色清成透明，只有被标成 `surface`
 * 的元素能保留（用它继承分组色）。官方开关/按钮丢了背景，说明它们没被标成 surface。
 *
 * 用法：node tools/find-surface-logic.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const lines = readFileSync(join(ROOT, "lib", "client.js"), "utf8").split("\n");
const KW = ["surface", "blanket", "panelbg"];
console.log("=== 与 surface / blanket / panelbg 相关的行 ===\n");
for (const [i, l] of lines.entries()) {
	const lower = l.toLowerCase();
	if (!KW.some((k) => lower.includes(k))) continue;
	console.log(`${String(i + 1).padStart(4)}| ${l.trim().slice(0, 160)}`);
}
