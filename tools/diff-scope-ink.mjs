/**
 * 在两种 scope 下各抓一次侧边栏"绘制证据"，做差集，
 * 定位"透出模式下悬停反馈消失"到底是哪个元素少了什么绘制。
 *
 * 用法：node tools/diff-scope-ink.mjs
 */
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const YAML = "C:/Users/31259/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/yaml";
const CONFIG = "C:/Users/31259/.dsh/profiles/desktop/cordis.patch.yml";
const DIAG = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const node = process.execPath;

function setScope(scope) {
	const code = `
const fs=require('fs');const Y=require(${JSON.stringify(YAML)});
const f=${JSON.stringify(CONFIG)};
const d=Y.parse(fs.readFileSync(f,'utf8'));
const e=d.find(x=>x&&x.id==='web-bg-2');
e.config={...e.config, scope:${JSON.stringify(scope)}, enabled:true, noBlanket:false, noTint:false, noFadeNeutralize:false};
fs.writeFileSync(f,Y.stringify(d,{lineWidth:0}),'utf8');
`;
	execFileSync(node, ["-e", code], { stdio: "pipe", timeout: 30000 });
}

/** 取最近一条 sidebarInk，按 scope 标签区分。 */
function latestInk(want) {
	const size = statSync(DIAG).size;
	const chunk = Math.min(size, 6 * 1024 * 1024);
	const fd = openSync(DIAG, "r");
	const buf = Buffer.alloc(chunk);
	readSync(fd, buf, 0, chunk, size - chunk);
	closeSync(fd);
	const lines = buf.toString("utf8").split("\n").filter((l) => l.trim().startsWith("{"));
	for (let i = lines.length - 1; i >= 0; i--) {
		let rec;
		try {
			rec = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const ink = rec.report?.sidebarInk;
		if (ink === undefined || ink.found !== true) continue;
		if (want === "on" && ink.scope !== "on") continue;
		if (want === "off" && ink.scope !== "off") continue;
		return { at: rec.at, ink };
	}
	return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poke(tag) {
	for (let i = 0; i < 3; i++) {
		const code = `
const fs=require('fs');const Y=require(${JSON.stringify(YAML)});
const f=${JSON.stringify(CONFIG)};
const d=Y.parse(fs.readFileSync(f,'utf8'));
const e=d.find(x=>x&&x.id==='web-bg-2');
e.config={...e.config, dim: 0.25 + (${i} * 0.0007) + ${tag} * 0.00003};
fs.writeFileSync(f,Y.stringify(d,{lineWidth:0}),'utf8');
`;
		execFileSync(node, ["-e", code], { stdio: "pipe", timeout: 30000 });
		await sleep(3500);
	}
}

console.log("抓取【不透出 scope=off】…");
setScope("off");
await poke(1);
const off = latestInk("off");

console.log("抓取【全窗口 scope=all】…");
setScope("all");
await poke(2);
const on = latestInk("on");

if (off === null || on === null) {
	console.log(`\n记录不齐：scope=off ${off === null ? "缺" : "有"}，scope=on ${on === null ? "缺" : "有"}`);
	console.log("（面板未打开时探针不上报；可重复运行本脚本）");
	process.exit(0);
}

console.log(`\n不透出：${off.ink.total} 个可见绘制元素   全窗口：${on.ink.total} 个\n`);

const norm = (row) => row.split("|")[0]; // 只用类名做键
const mapOff = new Map(off.ink.rows.map((r) => [norm(r) + "#" + r.split("|")[1], r]));
const mapOn = new Map(on.ink.rows.map((r) => [norm(r) + "#" + r.split("|")[1], r]));

console.log("=== 只在【不透出】里出现的绘制（= 透出后丢失的）===");
let n = 0;
for (const [k, v] of mapOff) {
	if (mapOn.has(k)) continue;
	console.log("  " + v);
	if (++n >= 25) break;
}
if (n === 0) console.log("  （无）");

console.log("\n=== 两边都有但数值不同 ===");
let m = 0;
for (const [k, v] of mapOff) {
	const other = mapOn.get(k);
	if (other === void 0 || other === v) continue;
	console.log("  不透出: " + v);
	console.log("  全窗口: " + other);
	if (++m >= 15) break;
}
if (m === 0) console.log("  （无差异）");
