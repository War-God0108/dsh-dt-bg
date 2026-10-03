/**
 * 本地渲染 SVG 版开关，确认形状与圆点位置。
 * 这是"不依赖 CSS 圆角"的方案：形状由 SVG 的 <rect rx> 与 <circle> 绘制。
 * 用法：node tools/render-svg-switch.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

/** 与 lib/client.js 中的实现保持一致。 */
function art(on) {
	const track = on ? "rgb(249, 250, 251)" : "rgb(53, 54, 56)";
	const knob = on ? "rgb(15, 17, 21)" : "rgb(249, 250, 251)";
	const cx = on ? 26 : 10;
	return `<svg width="36" height="20" viewBox="0 0 36 20" style="display:block;width:36px;height:20px" aria-hidden="true"><rect x="0" y="0" width="36" height="20" rx="10" ry="10" fill="${track}"></rect><circle cx="${cx}" cy="10" r="8" fill="${knob}"></circle></svg>`;
}

function sw(on) {
	return `<button style="box-sizing:border-box;display:block;width:36px;min-width:36px;height:20px;min-height:20px;padding:0;margin:0;border:0;background:transparent;cursor:pointer;line-height:0;font-size:0">${art(on)}</button>`;
}

const html = `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#2c2c2e;padding:20px;font:12px system-ui;color:#9aa0a6">
<div>开启 —— 1:1（圆点应在右）</div>
<div style="margin:8px 0 18px">${sw(true)}</div>
<div>关闭 —— 1:1（圆点应在左）</div>
<div style="margin:8px 0 18px">${sw(false)}</div>
<div>开启 —— 8× 放大</div>
<div style="margin:8px 0 16px;zoom:8">${sw(true)}</div>
<div>关闭 —— 8× 放大</div>
<div style="margin:8px 0;zoom:8">${sw(false)}</div>
</body>`;

const file = join(tmpdir(), "dsh-svg-switch.html");
writeFileSync(file, html, "utf8");

const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
const out = join(ROOT, "test", "screenshots", "switch-svg.png");
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=460,440", `--screenshot=${out}`, `file:///${file.replace(/\\/g, "/")}`], { stdio: "pipe", timeout: 40000 });
console.log(`截图: ${out}`);
console.log(`页面: ${file}`);
