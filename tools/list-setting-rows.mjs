/**
 * 清点设置面板里的"行"，确认已删除的行不再出现。
 * 用法：node tools/list-setting-rows.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const rows = [...text.matchAll(/wbg2-row", key: "([A-Za-z]+)"/g)].map((m) => m[1]);
console.log("设置行：", rows.join(", "));
console.log("是否还有 titlebar 行：", rows.includes("titlebar"));

/* 逐行打印所有含 titlebar 的代码位置，确认只剩"顶栏色变量"这类在用引用 */
const lines = text.split("\n");
console.log("\n含 titlebar 的位置：");
for (let i = 0; i < lines.length; i++) {
	if (!/titlebar/i.test(lines[i])) continue;
	console.log(`  ${i + 1}: ${lines[i].trim().slice(0, 120)}`);
}
