/**
 * 导出插件里所有"作用于官方元素"的 CSS 规则，便于逐条审查它们可能造成的副作用。
 * 用法：node tools/list-official-rules.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const text = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
const lines = text.split("\n");

/* CSS 数组范围：从 `const CSS = [` 到 `].join` */
const from = lines.findIndex((l) => l.includes("const CSS = ["));
const to = lines.findIndex((l) => l.includes('].join("\\n")'));
console.log(`CSS 数组：第 ${from + 1} ~ ${to + 1} 行`);

const rules = [];
for (let i = from; i < to; i++) {
	const raw = lines[i].trim();
	if (!raw.startsWith("`html[") && !raw.startsWith("`#") && !raw.startsWith('"html[')) continue;
	/* 只留选择器部分（到第一个 { 为止） */
	const brace = raw.indexOf("{");
	const selector = brace < 0 ? raw : raw.slice(0, brace);
	const body = brace < 0 ? "" : raw.slice(brace + 1).replace(/`,?$/, "").replace(/"?,?$/, "");
	rules.push({ line: i + 1, selector, body });
}

console.log(`共 ${rules.length} 条作用于官方元素的规则\n`);
const out = [];
for (const r of rules) {
	const sel = r.selector.replace(/`/g, "").replace(/\$\{MARK\}/g, "wbg2");
	const short = sel.length > 150 ? sel.slice(0, 150) + "…" : sel;
	out.push(`L${r.line}  ${short}`);
	out.push(`      { ${r.body.slice(0, 200)} }`);
}
console.log(out.join("\n"));
writeFileSync(join(ROOT, "test", "screenshots", "official-rules.txt"), out.join("\n"), "utf8");
console.log(`\n已写入 test/screenshots/official-rules.txt`);
