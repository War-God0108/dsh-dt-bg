/**
 * 用 YAML 解析器读 profile 配置，检查 `- id: <ns>` 那条目的 config.image
 * 到底能不能被解析出来 —— 定位"其他设置生效、只有图片丢了"的原因。
 *
 * 用法：node tools/inspect-config-image.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CONFIG_FILE, resolveDshModules } from "./paths.mjs";

const require = createRequire(import.meta.url);
/* yaml 包与 @deepseek-ai/* 平级（都在 npx 缓存的 node_modules 下），
   所以取 @deepseek-ai 的父目录再拼 yaml。 */
const modules = resolveDshModules();
const YAML = require(join(modules, "..", "yaml"));

const raw = readFileSync(CONFIG_FILE, "utf8");
console.log(`配置文件: ${(raw.length / 1024).toFixed(0)} KB\n`);

let doc;
try {
	doc = YAML.parse(raw);
	console.log("① YAML 解析成功，顶层条目数:", doc.length);
} catch (error) {
	console.log("① YAML 解析失败:", String(error.message).split("\n")[0]);
	/* 打印出错位置附近的内容，便于定位 */
	const line = Number(/at line (\d+)/.exec(String(error.message))?.[1] ?? 0);
	if (line > 0) {
		raw.split("\n").slice(Math.max(0, line - 3), line + 2).forEach((l, i) => {
			const n = Math.max(0, line - 3) + i + 1;
			console.log(`   ${n}| ${l.slice(0, 120)}`);
		});
	}
	process.exit(0);
}

/* 找出所有带 config 的条目 */
console.log("\n② 带 config 的条目：");
for (const entry of doc) {
	if (entry === null || typeof entry !== "object") continue;
	if (entry.insert !== void 0) {
		const rows = Array.isArray(entry.insert) ? entry.insert : [entry.insert];
		for (const row of rows) console.log(`   [insert] id=${row?.id} name=${row?.name}`);
		continue;
	}
	if (entry.id === void 0) continue;
	const cfg = entry.config ?? {};
	const img = cfg.image;
	console.log(`   [row] id=${entry.id}`);
	console.log(`         config 键: ${Object.keys(cfg).join(", ")}`);
	console.log(`         image: ${typeof img === "string" ? `${img.length} 字符，开头 "${img.slice(0, 32)}"` : `(${typeof img}) ${JSON.stringify(img)?.slice(0, 60)}`}`);
	console.log(`         translucency=${cfg.translucency} scope=${cfg.scope} kind=${cfg.kind} enabled=${cfg.enabled}`);
}

/* 存成 JSON 看整体大小（DSH 要把 config 序列化后下发） */
const namespaced = doc.filter((e) => e !== null && typeof e === "object" && e.id !== void 0 && e.config !== void 0);
for (const entry of namespaced) {
	const json = JSON.stringify(entry.config);
	console.log(`\n③ 条目 ${entry.id} 的 config 序列化后大小: ${(json.length / 1024).toFixed(0)} KB`);
	if (json.length > 512 * 1024) console.log("   ⚠ 超过 512 KB —— 有些通道会对超大 payload 做截断/拒绝");
}

