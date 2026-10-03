/**
 * 独立验证"宿主从 profile 配置读取自己设置"的解析逻辑。
 *
 * 这段逻辑与 `lib/index.js` 的 `readOwnSettings()` 等价 —— 因为 index.js 依赖
 * `@deepseek-ai/schemastery`，在仓库里无法直接 import，所以这里复制一份逻辑来验证
 * 它对本机真实配置的解析结果是否正确。
 *
 * 用法：node tools/test-read-settings.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE, ROOT } from "./paths.mjs";

const name = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;

function readOwnSettings() {
	const out = {};
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const candidates = [join(process.cwd(), "cordis.patch.yml"), join(home, "profiles", "desktop", "cordis.patch.yml"), CONFIG_FILE];
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		const lines = readFileSync(file, "utf8").split("\n");
		let inside = false;
		let seenConfig = false;
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed === `- id: ${name}`) {
				inside = true;
				seenConfig = false;
				continue;
			}
			if (!inside) continue;
			if (/^- /.test(line) && !trimmed.startsWith("- id:")) break;
			if (trimmed === "config:") {
				seenConfig = true;
				continue;
			}
			if (!seenConfig) continue;
			const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(trimmed);
			if (m === null) continue;
			const key = m[1];
			const value = m[2].replace(/^["']|["']$/g, "");
			if (value === "") continue;
			if (key === "enabled") out[key] = value === "true";
			else if (["opacity", "dim", "blur", "translucency"].includes(key)) {
				const n = Number(value);
				if (Number.isFinite(n)) out[key] = n;
			} else out[key] = value;
		}
		if (Object.keys(out).length > 0) {
			out.__source = file;
			return out;
		}
	}
	return out;
}

const got = readOwnSettings();
console.log(`插件名（命名空间）：${name}\n`);
console.log("解析结果：");
for (const [k, v] of Object.entries(got)) {
	if (k === "image") console.log(`  image        = ${typeof v === "string" ? v.length + " 字符" : v}`);
	else console.log(`  ${k.padEnd(12)} = ${v}`);
}

/* 判定：这些字段是客户端渲染所必需的 */
const NEED = ["image", "translucency", "scope"];
const missing = NEED.filter((k) => got[k] === void 0 || got[k] === "");
console.log(`\n判定：${missing.length === 0 ? "✓ 关键字段齐全，客户端可据此渲染" : "✗ 缺 " + missing.join(", ")}`);
if (typeof got.image === "string") {
	const head = got.image.slice(0, 32);
	console.log(`  image 开头：${head}${head.startsWith("data:image/") ? "（有效 data URL ✓）" : "（格式可疑 ✗）"}`);
}
process.exitCode = missing.length === 0 ? 0 : 1;
