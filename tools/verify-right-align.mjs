/**
 * 本地渲染"背景"行，验证开关是否贴到右侧（与官方一致）。
 * 结构照抄客户端：行(flex) + 标签(flex:none, 86px) + 弹性占位(flex:1) + 开关。
 * 用法：node tools/verify-right-align.mjs
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

const row = {
	display: "flex",
	alignItems: "center",
	gap: "10px",
	minWidth: "0",
	width: "560px",
	padding: "10px 14px",
	background: "#2c2c2e",
	borderRadius: "12px"
};
const label = { color: "#cfd3d6", fontSize: "13px", lineHeight: "20px", flex: "none", width: "86px" };
const spacer = { flex: "1 1 auto", minWidth: "0" };
const track = (on) => ({
	boxSizing: "border-box",
	display: "block",
	position: "relative",
	flex: "0 0 auto",
	width: "36px",
	minWidth: "36px",
	height: "20px",
	minHeight: "20px",
	padding: "0",
	margin: "0",
	border: "0",
	borderRadius: "10px",
	overflow: "hidden",
	background: on ? "rgb(249,250,251)" : "rgb(53,54,56)",
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
	background: on ? "rgb(15,17,21)" : "rgb(249,250,251)"
});
const sw = (on) => `<button style="${css(track(on))}"><span style="${css(thumb(on))}"></span></button>`;

const html = `<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#1b1b1c;padding:24px;font:12px system-ui;color:#8a8f94">
<div>开启（圆点应在右、整体贴右侧）</div>
<div style="margin:10px 0 24px">${`<div style="${css(row)}"><div style="${css(label)}">背景</div><div style="${css(spacer)}"></div>${sw(true)}</div>`}</div>
<div>关闭（圆点应在左、整体仍贴右侧）</div>
<div style="margin:10px 0">${`<div style="${css(row)}"><div style="${css(label)}">背景</div><div style="${css(spacer)}"></div>${sw(false)}</div>`}</div>
</body>`;

const file = join(tmpdir(), "dsh-right-align.html");
writeFileSync(file, html, "utf8");

const chrome = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));
const out = join(ROOT, "test", "screenshots", "switch-right-align.png");
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=680,240", `--screenshot=${out}`, `file:///${file.replace(/\\/g, "/")}`], { stdio: "pipe", timeout: 40000 });
console.log(`截图: ${out}`);
console.log(`页面: ${file}`);
