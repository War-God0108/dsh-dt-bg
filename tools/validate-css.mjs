/**
 * 校验插件样式表的 CSS 语法：把它写进一个独立文件，用无头 Chrome 解析，
 * 让浏览器报告**被丢弃的规则**（CSS 里一条规则写坏，浏览器会静默跳过它，
 * 表现为"部分样式生效、部分不生效"——正是开关圆角不生效的可疑原因）。
 *
 * 用法：node tools/validate-css.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const text = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

/* 抽出样式表里的每条 CSS 字符串：形如 `"...规则..."` 且含 `{` */
const rules = [];
const re = /`([^`]*\{[^`]*)`|"((?:[^"\\]|\\.)*\{[^"]*)"/g;
let m;
while ((m = re.exec(text)) !== null) {
	const raw = m[1] ?? m[2];
	if (raw === void 0) continue;
	const css = raw
		.replace(/\\"/g, '"')
		.replace(/\\n/g, "\n")
		.replace(/\$\{LAYER_ID\}/g, "dsh-dt-bg-layer")
		.replace(/\$\{VEIL_ID\}/g, "dsh-dt-bg-veil")
		.replace(/\$\{MARK\}/g, "wbg2")
		.replace(/\$\{[A-Z_]+[^}]*\}/g, "x");
	if (!css.includes("{")) continue;
	rules.push(css);
}

console.log(`抽出 ${rules.length} 条 CSS 片段`);
const combined = rules.join("\n");

/* 用无头 Chrome 解析并报告被丢弃的规则数 */
const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
if (chrome === void 0) {
	console.log("找不到 Chrome/Edge，只能做静态括号检查");
	const open = (combined.match(/\{/g) ?? []).length;
	const close = (combined.match(/\}/g) ?? []).length;
	console.log(`  花括号: { ${open} 个, } ${close} 个 → ${open === close ? "配对" : "不配对！"}`);
	process.exit(open === close ? 0 : 1);
}

const dir = mkdtempSync(join(tmpdir(), "dsh-css-"));
const cssFile = join(dir, "plugin.css");
const htmlFile = join(dir, "check.html");
writeFileSync(cssFile, combined, "utf8");
writeFileSync(
	htmlFile,
	`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="plugin.css">
<body><div id="out"></div><script>
	const sheet = document.styleSheets[0];
	const total = sheet.cssRules.length;
	/* 用 CSSOM 逐条重新序列化：写坏的规则会被浏览器丢掉，数量就会少于源码里的条数 */
	document.title = "RULES=" + total;
</script></body>`,
	"utf8"
);

try {
	const dom = execFileSync(
		chrome,
		["--headless=new", "--disable-gpu", "--dump-dom", `file:///${htmlFile.replace(/\\/g, "/")}`],
		{ stdio: "pipe", encoding: "utf8", timeout: 30000 }
	);
	const title = /RULES=(\d+)/.exec(dom);
	console.log(`  浏览器解析出的规则数: ${title === null ? "(未取到)" : title[1]}`);
	console.log(`  源码里的规则数（按 } 计数）: ${(combined.match(/\}/g) ?? []).length}`);
} catch (error) {
	console.log(`  无头浏览器执行失败：${String(error.message).slice(0, 120)}`);
} finally {
	rmSync(dir, { recursive: true, force: true });
}
