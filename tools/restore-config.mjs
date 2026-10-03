/**
 * 从备份恢复 profile 配置，并修正 `image:` 行的缩进。
 *
 * 背景：配置曾被清空成 663 字节的默认模板（"背景插件未启用"就是这个原因）。
 * 本脚本挑一个**最新的、含我们挂载且体积正常**的备份恢复，然后按行修正缩进
 * （历史上有一次脚本改写把 `image:` 变成了顶格 → config 缺字段 → DSH 丢弃整份配置）。
 *
 * 用法：
 *   node tools/restore-config.mjs            # 预演：挑备份 + 校验，不写入
 *   node tools/restore-config.mjs --apply
 */
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONFIG_FILE, resolveDshModules } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const require = createRequire(import.meta.url);
const YAML = require(join(resolveDshModules(), "..", "yaml"));

const NS = "dsh-dt-bg";
const FIELDS = ["enabled", "kind", "image", "color", "opacity", "dim", "blur", "translucency", "scope"];

/* ---------- 1. 挑备份 ---------- */
const dir = dirname(CONFIG_FILE);
const cands = readdirSync(dir)
	.filter((f) => f.startsWith("cordis.patch.yml.bak"))
	.map((f) => {
		const p = join(dir, f);
		let text = "";
		try {
			text = readFileSync(p, "utf8");
		} catch {
			return null;
		}
		const ok = text.includes(NS) && text.includes("- insert:") && text.length > 100000;
		return { p, f, size: statSync(p).size, mtime: statSync(p).mtimeMs, ok };
	})
	.filter((c) => c !== null && c.ok)
	.sort((a, b) => b.mtime - a.mtime);

if (cands.length === 0) {
	console.log("没有可用的备份（要求：含挂载、有时 insert 块、体积 > 100 KB）");
	process.exit(1);
}
const best = cands[0];
console.log(`选用备份：${best.f}`);
console.log(`  ${(best.size / 1024).toFixed(0)} KB  修改于 ${new Date(best.mtime).toLocaleString()}`);
console.log(`  （另有 ${cands.length - 1} 个候选）\n`);

/* ---------- 2. 清理损坏行 + 修缩进 ---------- */
const lines = readFileSync(best.p, "utf8").split("\n");
const fixed = [];
let inRow = false;
let cfgIndent = -1;
let repaired = 0;
let dropped = 0;

/** 明显的垃圾行：只有数字/点、且不是合法的 `key: value`。 */
const isJunk = (l) => /^[\s]*[.\d]+\s*$/.test(l) && !/^\s*$/.test(l);

for (const line of lines) {
	if (new RegExp(`^- id:\\s*${NS}\\s*$`).test(line)) {
		inRow = true;
		cfgIndent = -1;
		fixed.push(line);
		continue;
	}
	if (inRow && /^- /.test(line)) {
		inRow = false;
		cfgIndent = -1;
	}
	if (inRow) {
		/* 垃圾行（历史上被脚本误插入过 `.77` 这种）直接丢掉 */
		if (isJunk(line)) {
			dropped++;
			console.log(`  丢弃损坏行（第 ${fixed.length + dropped} 行左右）：${JSON.stringify(line)}`);
			continue;
		}
		if (/^\s*config:\s*$/.test(line)) {
			cfgIndent = line.length - line.trimStart().length;
			fixed.push(line);
			continue;
		}
		const m = new RegExp(`^(\\s*)(${FIELDS.join("|")}):`).exec(line);
		if (m !== null && cfgIndent >= 0) {
			const want = " ".repeat(cfgIndent + 2);
			if (m[1] !== want) {
				repaired++;
				if (repaired <= 5) console.log(`  修缩进：${m[2]}  ${m[1].length} → ${want.length} 空格`);
				fixed.push(want + line.trimStart());
				continue;
			}
		}
	}
	fixed.push(line);
}
const text = fixed.join("\n");
console.log(`缩进修正 ${repaired} 行；丢弃损坏行 ${dropped} 行`);

/* ---------- 2b. 补齐被损坏行吃掉的字段 ----------
   历史上那次破坏把 `dim: 0.25` 与误插入的 `.77` 揉在一起；
   丢弃垃圾行后 `dim` 就没了 —— 这里按需补回（先记下缺哪些）。 */
const NEED_DEFAULTS = { dim: 0.25 };
const missingFields = [];
{
	const ls = text.split("\n");
	let inRow2 = false;
	const seen = new Set();
	for (const line of ls) {
		if (new RegExp(`^- id:\\s*${NS}\\s*$`).test(line)) {
			inRow2 = true;
			seen.clear();
			continue;
		}
		if (inRow2 && /^- /.test(line)) inRow2 = false;
		if (!inRow2) continue;
		const m = new RegExp(`^\\s*(${FIELDS.join("|")}):`).exec(line);
		if (m !== null) seen.add(m[1]);
	}
	for (const k of Object.keys(NEED_DEFAULTS)) if (!seen.has(k)) missingFields.push(k);
}
let finalText = text;
if (missingFields.length > 0) {
	console.log(`补齐缺失字段：${missingFields.join(", ")}`);
	finalText = text.replace(
		new RegExp(`(^- id:\\s*${NS}\\s*\\n(?:.*\\n)*?)(?=^- )`, "m"),
		(match) => {
			const extra = missingFields.map((k) => `    ${k}: ${NEED_DEFAULTS[k]}`).join("\n");
			return `${match}${extra}\n`;
		}
	);
	if (finalText === text) {
		console.log("  （补齐失败：没找到插入点，将按原样恢复）");
		finalText = text;
	}
}

/* ---------- 3. 校验 ---------- */
console.log("\n=== 校验 ===");
let doc;
try {
	doc = YAML.parse(finalText);
	console.log("① YAML 解析：成功");
} catch (error) {
	console.log("① YAML 解析：失败 →", String(error.message).split("\n")[0]);
	process.exit(1);
}
const row = doc.find((e) => e !== null && typeof e === "object" && e.id === NS && e.config !== void 0);
if (row === void 0) {
	console.log("② 找不到设置行");
	process.exit(1);
}
const cfg = row.config;
const missing = FIELDS.filter((f) => !(f in cfg));
console.log(`② config 键：${Object.keys(cfg).join(", ")}`);
console.log(`   缺失：${missing.length === 0 ? "无 ✓" : missing.join(", ") + " ✗"}`);
console.log(`   图片：${typeof cfg.image === "string" ? cfg.image.length + " 字符" : "✗"}`);
console.log(`   通透：${cfg.translucency}  压暗：${cfg.dim}  范围：${cfg.scope}`);
const mounts = (finalText.match(/^- insert:/gm) ?? []).length;
const ours = (finalText.match(new RegExp(`- id: ${NS}`, "g")) ?? []).length;
console.log(`③ insert 块 ${mounts} 个；我们的 id 出现 ${ours} 处（应为 2：挂载 + 设置行）`);

/* 用插件真实 schema 校验 */
try {
	const { DEPLOYED_DIR } = await import("./paths.mjs");
	const { Config } = await import(`file://${join(DEPLOYED_DIR, "lib", "index.js").replace(/\\/g, "/")}`);
	Config(cfg);
	console.log("④ 插件 schema 校验：通过 ✓");
} catch (error) {
	console.log("④ 插件 schema 校验：", String(error.message).split("\n")[0].slice(0, 160));
}

if (!apply) {
	console.log("\n[预演] 未写入。加 --apply 生效。");
} else {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-before-restore-${Date.now()}`);
	writeFileSync(CONFIG_FILE, finalText, "utf8");
	console.log(`\n已恢复并写入（当前配置已另存为 .bak-before-restore-*）。**重启 DSH** 后生效。`);
}

