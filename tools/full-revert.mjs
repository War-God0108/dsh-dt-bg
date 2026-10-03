/**
 * 彻底回退到"21:41 那版"的运行形态。
 *
 * 做四件事，全部是**回到过去**，不引入任何新东西：
 *   1. 部署目录只保留 dsh-web-bg-2（删掉 dsh-dt-bg 等改名残留）
 *   2. profile 配置里：挂载 id/name 与设置行 id 都回到 web-bg-2 / dsh-web-bg-2
 *   3. 清掉配置里所有"内部排查开关"（noBlanket / noTint / noRowHover …）
 *      —— 那版没有这些字段，留着只会误导
 *   4. 只保留一个挂载块（重复块会让插件挂两次）
 * 图片、颜色、通透强度等**用户设置一律保留**。
 *
 * 用法：
 *   node tools/full-revert.mjs          # 预演
 *   node tools/full-revert.mjs --apply
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DSH_HOME, ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const PKG = "dsh-web-bg-2";
const NS = "web-bg-2";
/** 那版没有的字段，一律从配置里清掉。 */
const STALE = ["noBlanket", "noPanelBg", "noTint", "noFadeNeutralize", "noCornerFill", "noRowHover"];

console.log(`${apply ? "执行" : "[预演]"} 彻底回退到 21:41 那版\n`);

/* ---------- 1. 部署目录 ---------- */
console.log("① 部署目录");
const modulesDir = join(DSH_HOME, "profiles", "node_modules");
for (const stale of ["dsh-dt-bg", "dsh-web-bg"]) {
	const p = join(modulesDir, stale);
	if (!existsSync(p)) continue;
	/* dsh-web-bg 是 v1，可能还在用；只删改名残留 dsh-dt-bg */
	if (stale === "dsh-web-bg") {
		console.log(`   保留 ${stale}（v1，不属本次回退范围）`);
		continue;
	}
	console.log(`   删除 ${stale}`);
	if (apply) rmSync(p, { recursive: true, force: true });
}
console.log(`   ${PKG}：${existsSync(join(modulesDir, PKG)) ? "存在 ✓" : "不存在（稍后由 install.mjs 部署）"}`);

/* ---------- 2/3/4. profile 配置 ---------- */
console.log("\n② profile 配置");
const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
let insideOurs = false;
let keptInsert = 0;
let clearedFields = 0;
let fixedNames = 0;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	const t = line.trim();

	/* 挂载块：只留一个，id/name 都回到本版 */
	if (t.startsWith("- insert:")) {
		const indent = line.length - line.trimStart().length;
		const block = [line];
		let j = i + 1;
		while (j < lines.length) {
			const l = lines[j];
			if (l.trim() === "") break;
			if (l.length - l.trimStart().length <= indent) break;
			block.push(l);
			j++;
		}
		const body = block.join("\n");
		const id = (/- id:\s*['"]?([^'"\s]+)/.exec(body) ?? [])[1] ?? "";
		const ours = [NS, "dsh-dt-bg", "dsh-web-bg-2", "dsh-web-bg"].includes(id);
		if (ours) {
			if (keptInsert === 0) {
				const rewritten = body
					.replace(/- id:\s*['"]?[^'"\s]+['"]?/, `- id: ${NS}`)
					.replace(/name:\s*['"]?[^'"\n]+['"]?/, `name: ${PKG}`);
				out.push(...rewritten.split("\n"));
				keptInsert++;
				fixedNames++;
			} else {
				console.log(`   删除重复挂载块（id=${id}）`);
			}
			i = j - 1;
			continue;
		}
		out.push(...block);
		i = j - 1;
		continue;
	}

	/* 我们的设置行 */
	if (t === `- id: ${NS}` || t === "- id: dsh-dt-bg") {
		insideOurs = true;
		out.push(`- id: ${NS}`);
		if (t !== `- id: ${NS}`) fixedNames++;
		continue;
	}
	if (insideOurs && /^- /.test(line)) insideOurs = false;

	if (insideOurs) {
		const m = /^\s*([A-Za-z][\w-]*):/.exec(line);
		if (m !== null && STALE.includes(m[1])) {
			console.log(`   清掉排查开关 ${m[1]}`);
			clearedFields++;
			continue;
		}
		/* 顺手把历史上缺缩进的 image 行规范回块内（YAML 才合法） */
		if (m !== null && m[1] === "image" && !/^\s{4}/.test(line)) {
			out.push(`    ${line.trimStart()}`);
			fixedNames++;
			continue;
		}
	}
	/* 改名残留 */
	if (line.includes("dsh-dt-bg")) {
		out.push(line.split("dsh-dt-bg").join(NS));
		fixedNames++;
		continue;
	}
	out.push(line);
}

console.log(`   挂载块保留 ${keptInsert} 个；清理开关 ${clearedFields} 处；修正字段 ${fixedNames} 处`);

if (apply) {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-fullrevert-${Date.now()}`);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log("   已写入");
} else {
	console.log("   [预演] 未写入");
}

/* ---------- 校验 ---------- */
console.log("\n③ 校验");
if (apply) {
	const req = createRequire(join(dirname(CONFIG_FILE), "package.json"));
	try {
		console.log(`   ✓ 包名可解析 → ${req.resolve(`${PKG}/package.json`)}`);
	} catch {
		console.log("   ✗ 包名无法解析（先跑 node install.mjs）");
		process.exitCode = 1;
	}
	const cfg = readFileSync(CONFIG_FILE, "utf8");
	for (const s of STALE) {
		if (cfg.includes(`${s}:`)) {
			console.log(`   ✗ 仍有残留开关 ${s}`);
			process.exitCode = 1;
		}
	}
	console.log(`   配置里 - id: ${NS} 出现 ${(cfg.match(new RegExp(`- id: ${NS}`, "g")) ?? []).length} 处（应为 2）`);
	console.log(`   dsh-dt-bg 残留 ${(cfg.match(/dsh-dt-bg/g) ?? []).length} 处（应为 0）`);
	const client = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
	const host = readFileSync(join(ROOT, "lib", "index.js"), "utf8");
	const intruders = ["committedSettings", "keepbg", "CLIENT_BUILD", "writeOwnSettings", "readOwnSettings"].filter(
		(s) => client.includes(s) || host.includes(s)
	);
	console.log(`   源码里的排查期产物：${intruders.length === 0 ? "无 ✓" : intruders.join(", ") + " ✗"}`);
} else {
	console.log("   [预演] 未执行");
}
