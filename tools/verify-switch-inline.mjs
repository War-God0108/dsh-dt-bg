/**
 * 验证"新规格开关"的渲染：按行内样式生成最小页面，用无头 Chrome 截图放大。
 * 新规格：实心胶囊 36×20 / radius 10px / 无 padding；圆点 16×16 / radius 8px，
 *         开启时 left:18px（右侧）、关闭时 left:2px。
 *
 * 用法：node tools/verify-switch-inline.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

const css = (obj) =>
	Object.entries(obj)
		.map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
		.join(";");

const track = (on) => ({
	boxSizing: "border-box",
	display: "block",
	position: "relative",
	width: "36px",
	minWidth: "36px",
	height: "20px",
	minHeight: "20px",
	padding: "0",
	margin: "0",
	border: "0",
	borderRadius: "10px",
	overflow: "hidden",
	background: on ? "rgb(249, 250, 251)" : "rgb(53, 54, 56)",
	cursor: "pointer",
	appearance: "none",
	outline: "none",
	boxShadow: "none"
});

const thumb = (on) => ({
	display: "block",
	position: "absolute",
	top: "2px",
	left: on ? "18px" : "2px",
	width: "16px",
	height: "16px",
	borderRadius: "8px",
	background: on ? "rgb(15, 17, 21)" : "rgb(249, 250, 251)"
});

const sw = (on) => `<button style="${css(track(on))}"><span style="${css(thumb(on))}"></span></button>`;

const html = `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#2c2c2e;padding:24px;font:12px monospace;color:#9aa0a6">
<div>开启（圆点应在右）—— 1:1</div>
<div style="margin:8px 0 20px">${sw(true)}</div>
<div>关闭（圆点应在左）—— 1:1</div>
<div style="margin:8px 0 20px">${sw(false)}</div>
<div>开启 —— 8× 放大</div>
<div style="margin:8px 0;zoom:8">${sw(true)}</div>
<div>关闭 —— 8× 放大</div>
<div style="margin:8px 0;zoom:8">${sw(false)}</div>
</body>`;

const file = join(tmpdir(), "dsh-switch-inline.html");
writeFileSync(file, html, "utf8");
console.log(`页面: ${file}`);

const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
const out = join(ROOT, "test", "screenshots", "switch-inline-spec.png");
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=520,560", `--screenshot=${out}`, `file:///${file.replace(/\\/g, "/")}`], { stdio: "pipe", timeout: 40000 });
console.log(`截图: ${out}`);
