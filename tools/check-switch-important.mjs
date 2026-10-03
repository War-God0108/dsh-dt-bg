/**
 * 检查真实生成的样式表里，开关规则的 `!important` 是否齐全。
 *
 * 为什么查这个：官方 ui-theme 的样式表是在**运行时注入的**（插件的 <style> 之后），
 * 同优先级下后者会覆盖前者。如果我的规则漏了 `!important`，
 * 表现就恰好是"尺寸/布局生效、圆角与底色被官方按钮样式盖掉"——也就是用户看到的方角。
 *
 * 用法：node tools/check-switch-important.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

const start = src.indexOf("const CSS = [");
const end = src.indexOf("\n\t\t];", start);
const body = src.slice(start, end < 0 ? src.length : end);

const parts = [];
const re = /"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
let m;
while ((m = re.exec(body)) !== null) {
	const raw = m[1] ?? m[2];
	if (raw === void 0 || !raw.includes("{")) continue;
	parts.push(
		raw
			.replace(/\\"/g, '"')
			.replace(/\\n/g, "\n")
			.replace(/\$\{LAYER_ID\}/g, "dsh-dt-bg-layer")
			.replace(/\$\{VEIL_ID\}/g, "dsh-dt-bg-veil")
			.replace(/\$\{CHROME_ID\}/g, "dsh-dt-bg-chrome")
			.replace(/\$\{MARK\}/g, "wbg2")
			.replace(/\$\{STYLE_ID\}/g, "dsh-dt-bg")
			.replace(/\$\{[A-Za-z_$][^}]*\}/g, "x")
	);
}
const css = parts.join("\n");

console.log("=== 真实 CSS 里的开关规则 ===");
for (const line of css.split("\n")) {
	if (!line.includes("wbg2-switch")) continue;
	const imp = (line.match(/!important/g) ?? []).length;
	const decls = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
	const total = decls.split(";").filter((d) => d.trim() !== "").length;
	console.log(`  !important ${imp}/${total}  ${line.trim().slice(0, 130)}`);
}

console.log("\n=== 插件的控件规则（pill / btn / input）===");
for (const line of css.split("\n")) {
	if (!/button\.wbg2-(pill|btn)|\.wbg2-(input|range|color)\{/.test(line)) continue;
	const imp = (line.match(/!important/g) ?? []).length;
	console.log(`  !important ${imp}  ${line.trim().slice(0, 120)}`);
}
