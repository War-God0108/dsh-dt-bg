/**
 * 从备份里恢复"用户自己的设置值"到当前配置。
 *
 * 背景：绑定坏掉期间，插件的 `host.set()` 会把**出厂默认值**写回配置，
 * 把用户真实的值（kind=image、translucency=0.6）覆盖掉。
 * 备份里还留着原值，这里把它找回来。
 *
 * 只改「我们条目 config 块内」的字段值，不动图片、不动别人的条目。
 *
 * 用法：
 *   node tools/restore-user-settings.mjs          # 预演
 *   node tools/restore-user-settings.mjs --apply
 */
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_FILE } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const NS = "web-bg-2";
/** 需要从备份里找回的字段（不含图片：图片一直完好）。 */
const FIELDS = ["kind", "translucency", "dim", "blur", "scope", "enabled"];

/** 从一段配置文本里，取我们条目的 config 字段。 */
function readOurConfig(text) {
	const lines = text.split("\n");
	let inside = false;
	let seenConfig = false;
	const out = {};
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === `- id: ${NS}`) {
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
		const m = /^([A-Za-z][\w-]*):\s*(.+)$/.exec(trimmed);
		if (m !== null) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	return out;
}

const dir = dirname(CONFIG_FILE);
const current = readFileSync(CONFIG_FILE, "utf8");
const nowCfg = readOurConfig(current);
console.log("当前配置：");
for (const f of FIELDS) console.log(`  ${f.padEnd(14)} = ${nowCfg[f] ?? "(无)"}`);

/* 在备份里找"用户真实设置"：kind=image 且 translucency 不是 1 的那份 */
const cands = readdirSync(dir)
	.filter((f) => f.startsWith("cordis.patch.yml.bak"))
	.map((f) => {
		const p = join(dir, f);
		try {
			const t = readFileSync(p, "utf8");
			const own = readOurConfig(t);
			return { f, p, own, mtime: statSync(p).mtimeMs };
		} catch {
			return null;
		}
	})
	.filter((c) => c !== null && c.own.kind === "image" && c.own.translucency !== void 0)
	.sort((a, b) => b.mtime - a.mtime);

if (cands.length === 0) {
	console.log("\n备份里找不到 kind=image 的用户设置。");
	process.exit(1);
}
const best = cands[0];
console.log(`\n选用备份：${best.f}（${new Date(best.mtime).toLocaleString()}）`);
for (const f of FIELDS) console.log(`  ${f.padEnd(14)} = ${best.own[f] ?? "(无)"}`);

/* 写回：只替换我们条目 config 块内的这些字段 */
const lines = current.split("\n");
const out = [];
let inside = false;
const pending = new Map(FIELDS.map((f) => [f, best.own[f]]));
let changed = 0;
for (const line of lines) {
	const trimmed = line.trim();
	if (trimmed === `- id: ${NS}`) {
		inside = true;
		out.push(line);
		continue;
	}
	if (inside && /^- /.test(line) && !trimmed.startsWith("- id:")) inside = false;
	if (inside) {
		const m = /^(\s*)([A-Za-z][\w-]*):\s*(.+)$/.exec(line);
		if (m !== null && pending.has(m[2]) && pending.get(m[2]) !== void 0) {
			const want = String(pending.get(m[2]));
			if (m[3] !== want) {
				console.log(`  第 ${out.length + 1} 行：${m[2]} ${m[3]} → ${want}`);
				changed++;
			}
			out.push(`${m[1]}${m[2]}: ${want}`);
			pending.delete(m[2]);
			continue;
		}
	}
	out.push(line);
}
console.log(`\n共修正 ${changed} 处`);
if (apply && changed > 0) {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-restoresettings-${Date.now()}`);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log("已写入。");
} else if (!apply) {
	console.log("[预演] 未写入。加 --apply 生效。");
}
