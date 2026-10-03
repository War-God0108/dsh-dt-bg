/**
 * 从 lib/client.js 抽出真实的样式表内容，写成独立页面（含开关结构）并用无头 Chrome 截图。
 * 目的：在**不碰用户机器**的前提下，确认"插件当前的 CSS + 开关结构"渲染出来到底是什么形状。
 *
 * 用法：node tools/render-switch.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const source = readFileSync(join(ROOT, "lib", "client.js"), "utf8");

/* 把 CSS 数组里的字符串逐条抽出来：形如  "...."，或 `....`，且含 { */
const cssParts = [];
const arrayStart = source.indexOf("const css = [");
const arrayEnd = source.indexOf("];", arrayStart);
const body = source.slice(arrayStart, arrayEnd);
const strRe = /"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
let m;
while ((m = strRe.exec(body)) !== null) {
	const raw = m[1] ?? m[2];
	if (raw === void 0 || !raw.includes("{")) continue;
	cssParts.push(
		raw
			.replace(/\\"/g, '"')
			.replace(/\\n/g, "\n")
			.replace(/\$\{LAYER_ID\}/g, "dsh-web-bg-2-layer")
			.replace(/\$\{VEIL_ID\}/g, "dsh-web-bg-2-veil")
			.replace(/\$\{CHROME_ID\}/g, "dsh-web-bg-2-chrome")
			.replace(/\$\{MARK\}/g, "wbg2")
			.replace(/\$\{STYLE_ID\}/g, "dsh-web-bg-2")
			.replace(/\$\{[A-Za-z_$][^}]*\}/g, "x")
	);
}
console.log(`抽出 ${cssParts.length} 条 CSS`);
const css = cssParts.join("\n");
console.log(`开关相关规则 ${(css.match(/wbg2-switch/g) ?? []).length} 处`);

const html = `<!doctype html><meta charset="utf-8"><title>t</title>
<style>body{margin:0;padding:20px;background:#1b1b1c}</style>
<style id="plugin">${css}</style>
<body>
<div data-wbg2="panel" style="width:600px;padding:16px">
  <div class="wbg2-head">
    <div class="wbg2-title">背景</div>
    <button class="wbg2-switch" role="switch" aria-checked="true" aria-pressed="true"><span class="wbg2-thumb"></span></button>
  </div>
  <div style="height:14px"></div>
  <div class="wbg2-head">
    <div class="wbg2-title">关</div>
    <button class="wbg2-switch" role="switch" aria-checked="false"><span class="wbg2-thumb"></span></button>
  </div>
</div>
<div style="zoom:5;margin-top:20px">
  <button class="wbg2-switch" role="switch" aria-checked="true"><span class="wbg2-thumb"></span></button>
</div>
</body>`;

const dir = mkdtempSync(join(tmpdir(), "dsh-render-"));
const htmlFile = join(dir, "switch.html");
writeFileSync(htmlFile, html, "utf8");

const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
const out = join(ROOT, "test", "screenshots", "switch-from-source.png");
console.log(`浏览器: ${chrome}`);
console.log(`页面: ${htmlFile}`);
try {
	execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=680,520", `--screenshot=${out}`, `file:///${htmlFile.replace(/\\/g, "/")}`], { stdio: "pipe", timeout: 40000 });
	console.log(`截图: ${out}`);
} catch (error) {
	console.log(`截图失败: ${String(error.message).slice(0, 160)}`);
} finally {
	/* 保留 html 供人工复查 */
	console.log(`（临时页面保留在 ${htmlFile}）`);
	void rmSync;
}
