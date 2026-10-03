/**
 * 修复 profile 配置里的**缩进错误**，并对结果做结构与 schema 双重校验。
 *
 * 踩过的坑：某次用脚本改写配置后，`image:` 那一行的缩进丢了（顶格）。
 * YAML 于是把它放到顶层，`config` 里缺 `image` → 整份 config 过不了插件 schema
 * → DSH 丢弃配置、插件全部用默认值（真机表现：壁纸变内置兜底图、
 * 通透回 100%、"无法设置"）。
 *
 * 所以要**按行修缩进**，不能只做正则替换。
 *
 * 用法：
 *   node tools/fix-config-indent.mjs          # 预演 + 校验
 *   node tools/fix-config-indent.mjs --apply
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CONFIG_FILE, DEPLOYED_DIR, resolveDshModules, ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const require = createRequire(import.meta.url);
const YAML = require(join(resolveDshModules(), "..", "yaml"));

/** 属于我们插件 config 的字段名。 */
const FIELDS = ["enabled", "kind", "image", "color", "opacity", "dim", "blur", "translucency", "scope"];
const NS = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;

const raw = readFileSync(CONFIG_FILE, "utf8");
const lines = raw.split("\n");

/* ---------- 定位我们的设置行，并修正其 config 块内的缩进 ---------- */
let inOurRow = false;
let configIndent = -1;
const fixed = [];
let repaired = 0;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];

	/* 进入我们的设置行 */
	if (new RegExp(`^- id:\\s*${NS}\\s*$`).test(line)) {
		inOurRow = true;
		configIndent = -1;
		fixed.push(line);
		continue;
	}
	/* 离开：遇到新的顶层条目 */
	if (inOurRow && /^- /.test(line)) {
		inOurRow = false;
		configIndent = -1;
	}
	if (inOurRow) {
		if (/^\s*config:\s*$/.test(line)) {
			configIndent = line.length - line.trimStart().length;
			fixed.push(line);
			continue;
		}
		/* config 块内的字段：缩进必须是 configIndent + 2 */
		const fieldM = new RegExp(`^(\\s*)(${FIELDS.join("|")}):`).exec(line);
		if (fieldM !== null && configIndent >= 0) {
			const want = " ".repeat(configIndent + 2);
			if (fieldM[1] !== want) {
				const repairedLine = want + line.trimStart();
				console.log(`第 ${i + 1} 行缩进修正：${line.length - line.trimStart().length} → ${want.length} 空格`);
				console.log(`   ${line.slice(0, 60)}${line.length > 60 ? "…" : ""}`);
				repaired++;
				fixed.push(repairedLine);
				continue;
			}
		}
	}
	fixed.push(line);
}

const text = fixed.join("\n");
console.log(`\n共修正 ${repaired} 行缩进。`);

/* ---------- 校验：YAML 解析 + 结构检查 ---------- */
console.log("\n=== 校验 ===");
let doc;
try {
	doc = YAML.parse(text);
	console.log("① YAML 解析：成功");
} catch (error) {
	console.log("① YAML 解析：失败 →", String(error.message).split("\n")[0]);
	process.exit(1);
}

const row = doc.find((e) => e !== null && typeof e === "object" && e.id === NS && e.config !== void 0);
if (row === void 0) {
	console.log(`② 找不到设置行 id=${NS}`);
	process.exit(1);
}
const cfg = row.config;
console.log(`② 设置行 config 的键：${Object.keys(cfg).join(", ")}`);
const missing = FIELDS.filter((f) => !(f in cfg));
console.log(`   缺失字段：${missing.length === 0 ? "无 ✓" : missing.join(", ") + " ✗"}`);
if (typeof cfg.image === "string") {
	console.log(`   image：${cfg.image.length} 字符（data URL）`);
} else {
	console.log(`   image：${typeof cfg.image} ✗（应为 string）`);
}
/* 顶层是否残留了本该在 config 里的键 */
const stray = doc.filter((e) => e !== null && typeof e === "object" && FIELDS.some((f) => f in e) && e.config === void 0);
console.log(`③ 顶层残留的字段条目：${stray.length === 0 ? "无 ✓" : stray.length + " 个 ✗"}`);

/* 用插件真实的 schema 校验（部署副本里那份） */
try {
	const deployedLib = join(DEPLOYED_DIR, "lib", "index.js");
	const { Config } = await import(`file://${deployedLib.replace(/\\/g, "/")}`);
	Config(cfg);
	console.log("④ 插件 schema 校验：通过 ✓");
} catch (error) {
	console.log("④ 插件 schema 校验：", String(error.message).split("\n")[0].slice(0, 200));
}

if (!apply) {
	console.log("\n[预演] 未写入。加 --apply 生效。");
} else if (repaired > 0) {
	const backup = `${CONFIG_FILE}.bak-indent-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	writeFileSync(CONFIG_FILE, text, "utf8");
	console.log(`\n已写入（备份 → ${backup}）。**重启 DSH** 后生效。`);
} else {
	console.log("\n无需修正。");
}

