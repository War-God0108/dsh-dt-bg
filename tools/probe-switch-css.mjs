/**
 * 端到端校验开关 CSS：把 lib/client.js 里真实生成的样式表整段喂给无头浏览器，
 * 插入与插件相同的 DOM 结构，然后读**计算样式**并回传。
 *
 * 这能发现"规则被浏览器丢弃 / 被其它规则覆盖"的问题 —— 也就是"尺寸生效但圆角不生效"
 * 这类局部失效的典型症状（我之前只读源码文本，没让浏览器真正解析过）。
 *
 * 用法：node tools/probe-switch-css.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const source = readFileSync(join(ROOT, "lib", "client.js"), "utf8");

/** 抽出 css 数组里的每个字符串片段。 */
function extractCss(src) {
	const start = src.indexOf("const CSS = [");
	if (start < 0) throw new Error("找不到 CSS 数组");
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
	return parts.join("\n");
}

const css = extractCss(source);
const switchRules = (css.match(/wbg2-switch/g) ?? []).length;
console.log(`抽出 CSS ${css.length} 字符，其中含 wbg2-switch 的片段 ${switchRules} 处`);

const html = `<!doctype html><meta charset="utf-8">
<style id="plugin">${css}</style>
<body>
<div id="host" data-wbg2="panel">
  <div class="wbg2-head">
    <button id="sw" class="wbg2-switch" role="switch" aria-checked="true"><span id="th" class="wbg2-thumb"></span></button>
  </div>
</div>
<div id="out"></div>
<script>
	const el = document.getElementById("sw");
	const th = document.getElementById("th");
	const cs = getComputedStyle(el);
	const kcs = getComputedStyle(th);
	const sheet = document.styleSheets[document.styleSheets.length - 1];
	document.getElementById("out").textContent = JSON.stringify({
		parsedRuleCount: sheet.cssRules.length,
		switchRect: [el.getBoundingClientRect().width, el.getBoundingClientRect().height],
		borderRadius: cs.borderRadius,
		backgroundColor: cs.backgroundColor,
		display: cs.display,
		padding: cs.padding,
		overflow: cs.overflow,
		thumbRect: [th.getBoundingClientRect().width, th.getBoundingClientRect().height],
		thumbRadius: kcs.borderRadius,
		thumbBg: kcs.backgroundColor,
		thumbTransform: kcs.transform
	});
</script>
</body>`;

const dir = mkdtempSync(join(tmpdir(), "dsh-css-"));
const file = join(dir, "probe.html");
writeFileSync(file, html, "utf8");

const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
if (chrome === void 0) {
	console.log("找不到浏览器");
	process.exit(1);
}
try {
	const dom = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--dump-dom", `file:///${file.replace(/\\/g, "/")}`], { stdio: "pipe", encoding: "utf8", timeout: 40000 });
	const m = /<div id="out">([\s\S]*?)<\/div>/.exec(dom);
	console.log("\n浏览器实测：");
	console.log(m === null ? "（没取到输出，页面可能报错）" : JSON.stringify(JSON.parse(m[1]), null, 2));
} catch (error) {
	console.log(`执行失败：${String(error.message).slice(0, 200)}`);
}

