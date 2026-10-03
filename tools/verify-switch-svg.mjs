/**
 * 本地对照渲染：把插件**真实的 CSS** + 开关结构放进无头 Chrome，
 * 报告计算样式并放大渲染成 PNG。
 *
 * 用途：确立"干净环境下开关长什么样"这个基准，用来和真机现象对比。
 * 用法：node tools/verify-switch-svg.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const source = readFileSync(join(ROOT, "lib", "client.js"), "utf8");

/* ---- 抽出真实 CSS ---- */
const start = source.indexOf("const CSS = [");
const end = source.indexOf("\n\t\t];", start);
const body = source.slice(start, end < 0 ? source.length : end);
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

/* 关键：把**官方主题样式表**也加载进来。真实页面里官方 ui-theme 的 CSS 与插件 CSS 共存，
   只测插件 CSS 会漏掉"官方样式覆盖插件控件"这一类问题。 */
const themePath = join(ROOT, "test", "theme-tokens.css");
const themeCss = existsSync(themePath) ? readFileSync(themePath, "utf8") : "";
console.log(`官方主题样式表: ${themeCss.length} 字符${themeCss === "" ? "（未找到，跳过）" : ""}`);

const page = `<!doctype html><meta charset="utf-8">
<style id="theme">${themeCss}</style>
<style id="plugin">${css}</style>
<body style="margin:0;background:#1b1b1c">
<div data-wbg2="panel" style="padding:24px">
  <button id="sw" class="wbg2-switch" role="switch" aria-checked="true"><span class="wbg2-thumb"></span></button>
</div>
<div id="out" style="color:#8a8f94;font:12px monospace;padding:0 24px"></div>
<script>
	const el = document.getElementById("sw");
	const r = el.getBoundingClientRect();
	const cs = getComputedStyle(el);
	const kid = el.querySelector(".wbg2-thumb");
	const kcs = getComputedStyle(kid);
	document.getElementById("out").textContent = "COMPUTED=" + JSON.stringify({
		size: [Math.round(r.width), Math.round(r.height)],
		radius: cs.borderRadius,
		bg: cs.backgroundColor,
		display: cs.display,
		padding: cs.padding,
		thumb: [Math.round(kid.getBoundingClientRect().width), Math.round(kid.getBoundingClientRect().height)],
		thumbRadius: kcs.borderRadius,
		thumbBg: kcs.backgroundColor,
		thumbTransform: kcs.transform
	});
	const box = document.createElement("div");
	box.style.cssText = "margin:16px 24px;padding:10px;background:#2c2c2e;display:inline-block";
	const big = el.cloneNode(true);
	big.style.zoom = "8";
	box.appendChild(big);
	document.body.appendChild(box);
</script>
</body>`;

const dir = mkdtempSync(join(tmpdir(), "dsh-svg-"));
const file = join(dir, "t.html");
writeFileSync(file, page, "utf8");

const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
if (chrome === void 0) {
	console.log("找不到浏览器");
	process.exit(1);
}

const dom = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--dump-dom", `file:///${file.replace(/\\/g, "/")}`], { stdio: "pipe", encoding: "utf8", timeout: 40000 });
const got = /COMPUTED=(\{[\s\S]*?\})\s*</.exec(dom);
console.log("干净环境下的开关计算样式：");
console.log(got === null ? "（未取到）" : JSON.stringify(JSON.parse(got[1]), null, 2));

const outPng = join(ROOT, "test", "screenshots", "switch-clean-env.png");
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=560,300", `--screenshot=${outPng}`, `file:///${file.replace(/\\/g, "/")}`], { stdio: "pipe", timeout: 40000 });
console.log(`放大渲染图: ${outPng}`);
