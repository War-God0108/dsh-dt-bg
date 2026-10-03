/**
 * 回退后的两处修正：
 *   1. 包内 `cordis.patch.yml` 的挂载 `name` 必须是**可解析的包名**
 *      （`dsh-web-bg-2`），不是命名空间（`web-bg-2`）——
 *      写成命名空间会让 DSH 找不到包，插件根本不加载（真机提示"背景插件未启用"）。
 *   2. profile 配置里清掉改名留下的 `dsh-dt-bg` 残留。
 *
 * 用法：node tools/fix-after-rollback.mjs [--apply]
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DSH_HOME, ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const PKG = "dsh-web-bg-2";
const NS = "web-bg-2";
const OLD = "dsh-dt-bg";

/* ---------- 1. 包内补丁的 name ---------- */
console.log("① 包内 cordis.patch.yml");
{
	const f = join(ROOT, "cordis.patch.yml");
	const lines = readFileSync(f, "utf8").split("\n");
	let changed = 0;
	const out = lines.map((l) => {
		if (/^\s*name:\s*\S+\s*$/.test(l) && !l.trimStart().startsWith("#")) {
			changed++;
			return `      name: ${PKG}`;
		}
		return l;
	});
	console.log(`   挂载 name → ${PKG}（改 ${changed} 行）`);
	if (apply && changed > 0) writeFileSync(f, out.join("\n"), "utf8");
}
/* 同步到部署副本 */
{
	const dep = join(DSH_HOME, "profiles", "node_modules", PKG, "cordis.patch.yml");
	if (existsSync(dep) && apply) copyFileSync(join(ROOT, "cordis.patch.yml"), dep);
	console.log(`   部署副本补丁：${existsSync(dep) ? "已同步" : "（不存在）"}`);
}

/* ---------- 2. profile 配置：清残留 + 挂载 name 用包名 ---------- */
console.log("\n② profile 配置");
{
	const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
	const out = [];
	let fixedMount = 0;
	let cleared = 0;
	let insideInsert = false;
	let insertIndent = 0;
	for (const line of lines) {
		const indent = line.length - line.trimStart().length;
		if (line.trimStart().startsWith("- insert:")) {
			insideInsert = true;
			insertIndent = indent;
			out.push(line);
			continue;
		}
		if (insideInsert && line.trim() !== "" && indent <= insertIndent) insideInsert = false;

		/* 挂载块里的 name：必须等于包名 */
		if (insideInsert && /^\s*name:\s*['"]?\S+['"]?\s*$/.test(line)) {
			out.push(`      name: '${PKG}'`);
			fixedMount++;
			continue;
		}
		/* 残留的 dsh-dt-bg */
		if (line.includes(OLD)) {
			out.push(line.split(OLD).join(NS));
			cleared++;
			continue;
		}
		out.push(line);
	}
	console.log(`   挂载 name → '${PKG}'（改 ${fixedMount} 处）；清理 ${OLD} 残留 ${cleared} 处`);
	if (apply && (fixedMount > 0 || cleared > 0)) {
		copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-postrollback-${Date.now()}`);
		writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	}
}

/* ---------- 3. 校验 ---------- */
console.log("\n③ 校验");
if (apply) {
	const req = createRequire(join(dirname(CONFIG_FILE), "package.json"));
	for (const name of [PKG, NS]) {
		try {
			console.log(`   ✓ "${name}" 可解析 → ${req.resolve(`${name}/package.json`)}`);
		} catch {
			console.log(`   ✗ "${name}" 解析失败`);
		}
	}
	const cfg = readFileSync(CONFIG_FILE, "utf8");
	console.log(`   配置：- id: ${NS} ${(cfg.match(new RegExp(`- id: ${NS}`, "g")) ?? []).length} 处；${OLD} 残留 ${(cfg.match(new RegExp(OLD, "g")) ?? []).length} 处`);
	const patch = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8");
	console.log(`   补丁挂载 name: ${(/^\s*name:\s*(\S+)/m.exec(patch) ?? [])[1] ?? "?"}`);
} else {
	console.log("   [预演] 未写入。加 --apply 生效。");
}
