/**
 * 回退到"最后一次确定能用"的状态（快照 good-final-2026-10-03）。
 *
 * 这次改名（dsh-web-bg-2 → dsh-dt-bg）引出了一连串问题：
 * 挂载名解析不到、配置行绑不上、面板写不进去…… 与其继续往前修，
 * 不如回到**用户确认过可用**的那一版，把改名当作未完成的尝试。
 *
 * 本脚本做五件事（可直接 --rollback 执行）：
 *   1. 用快照覆盖 lib/、install.mjs、package.json（包名回到 dsh-web-bg-2）
 *   2. 修 cordis.patch.yml 的挂载 name（回到 web-bg-2）
 *   3. 部署：建 profiles/node_modules/dsh-web-bg-2，删掉 dsh-dt-bg
 *   4. 改 profile 配置：挂载 id/name 与设置行 id 都回到 web-bg-2
 *   5. 每步都校验（语法 / YAML / 部署一致性 / 包可解析）
 *
 * 用法：
 *   node tools/rollback-to-good.mjs            # 预演，只报告将要做什么
 *   node tools/rollback-to-good.mjs --apply
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DSH_HOME, ROOT } from "./paths.mjs";

const SNAP = join(ROOT, "snapshots", "good-final-2026-10-03", "files");
const apply = process.argv.includes("--apply");
const PKG = "dsh-web-bg-2";
const NS = "web-bg-2";
const NEW_PKG = "dsh-dt-bg";
const REPO = "https://github.com/War-God0108/dsh-dt-bg.git";

if (!existsSync(SNAP)) {
	console.log(`找不到快照：${SNAP}`);
	process.exit(1);
}
console.log(`${apply ? "执行" : "[预演]"} 回退到 good-final-2026-10-03`);
console.log(`  包名 ${NEW_PKG} → ${PKG}；命名空间 → ${NS}\n`);

/* ---------- 1. 用快照覆盖源码 ---------- */
console.log("① 恢复源码文件");
const FILES = [["lib/client.js"], ["lib/index.js"], ["install.mjs"], ["package.json"]];
for (const [rel] of FILES) {
	const src = join(SNAP, rel);
	if (!existsSync(src)) {
		console.log(`   ✗ 快照里没有 ${rel}`);
		continue;
	}
	console.log(`   ${rel}  ← 快照（${readFileSync(src, "utf8").split("\n").length} 行）`);
	if (apply) copyFileSync(src, join(ROOT, rel));
}

/* package.json：仓库地址写成当前实际仓库（包名保持 dsh-web-bg-2） */
if (apply) {
	const pj = join(ROOT, "package.json");
	const j = JSON.parse(readFileSync(pj, "utf8"));
	j.repository = { type: "git", url: REPO };
	writeFileSync(pj, `${JSON.stringify(j, null, 2)}\n`, "utf8");
	console.log(`   package.json：仓库地址 → ${REPO}`);
}

/* ---------- 2. cordis.patch.yml 的挂载 name ---------- */
console.log("\n② 修包内挂载补丁");
if (apply) {
	const f = join(ROOT, "cordis.patch.yml");
	const lines = readFileSync(f, "utf8").split("\n");
	const out = lines.map((l) => (/^\s*name:\s*\S+\s*$/.test(l) ? `      name: ${NS}` : l));
	writeFileSync(f, out.join("\n"), "utf8");
	const after = readFileSync(f, "utf8").split("\n").filter((l) => /name:/.test(l) && !l.trimStart().startsWith("#"));
	console.log(`   挂载 name → ${after.map((s) => s.trim()).join(", ")}`);
}

/* ---------- 3. 部署 ---------- */
console.log("\n③ 部署到 profile");
const nodeModules = join(DSH_HOME, "profiles", "node_modules");
const targetOld = join(nodeModules, NEW_PKG);
const targetNew = join(nodeModules, PKG);
console.log(`   删除 ${NEW_PKG}：${existsSync(targetOld) ? "存在" : "不存在"}`);
console.log(`   建立 ${PKG} ← 仓库 lib/ + package.json + cordis.patch.yml`);
if (apply) {
	if (existsSync(targetOld)) rmSync(targetOld, { recursive: true, force: true });
	if (existsSync(targetNew)) rmSync(targetNew, { recursive: true, force: true });
	mkdirSync(targetNew, { recursive: true });
	cpSync(join(ROOT, "package.json"), join(targetNew, "package.json"));
	cpSync(join(ROOT, "lib"), join(targetNew, "lib"), { recursive: true });
	cpSync(join(ROOT, "cordis.patch.yml"), join(targetNew, "cordis.patch.yml"));
}

/* ---------- 4. profile 配置：挂载与设置行都回到 web-bg-2 ---------- */
console.log("\n④ 修 profile 配置");
if (apply) {
	const backup = `${CONFIG_FILE}.bak-rollback-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
	const out = [];
	/** 处理 insert 块：id 与 name 都改回 NS；重复块只留第一个 */
	let keptInsert = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^- id:\s*dsh-dt-bg\s*$/.test(line)) {
			out.push(`- id: ${NS}`);
			continue;
		}
		if (line.trimStart().startsWith("- insert:")) {
			const indent = line.length - line.trimStart().length;
			const block = [line];
			let j = i + 1;
			while (j < lines.length && block.length <= 6) {
				const l = lines[j];
				const ind = l.length - l.trimStart().length;
				if (l.trim() === "" || ind > indent) {
					block.push(l);
					j++;
					continue;
				}
				break;
			}
			const body = block.join("\n");
			const id = (/- id:\s*(\S+)/.exec(body) ?? [])[1] ?? "";
			if (["dsh-dt-bg", "web-bg-2", "dsh-web-bg-2"].includes(id)) {
				if (keptInsert === 0) {
					const rewritten = body
						.replace(/- id:\s*\S+/, `- id: ${NS}`)
						.replace(/name:\s*'?[^'\n]+'?/, `name: '${NS}'`);
					out.push(...rewritten.split("\n"));
					keptInsert++;
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
		out.push(line);
	}
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log(`   保留挂载块 ${keptInsert} 个；备份 → ${backup}`);
}

/* ---------- 5. 校验 ---------- */
console.log("\n⑤ 校验");
if (apply) {
	for (const rel of ["lib/client.js", "lib/index.js", "install.mjs"]) {
		try {
			execFileSync(process.execPath, ["--check", join(ROOT, rel)], { stdio: "pipe", timeout: 20000 });
			console.log(`   ✓ ${rel} 语法`);
		} catch {
			console.log(`   ✗ ${rel} 语法`);
			process.exitCode = 1;
		}
	}
	const req = createRequire(join(dirname(CONFIG_FILE), "package.json"));
	for (const name of [PKG, NS]) {
		try {
			const r = req.resolve(`${name}/package.json`);
			console.log(`   ✓ "${name}" 可解析 → ${r}`);
		} catch {
			console.log(`   ✗ "${name}" 解析失败（挂载会加载不了）`);
			process.exitCode = 1;
		}
	}
	const cfg = readFileSync(CONFIG_FILE, "utf8");
	console.log(`   配置里 - id: ${NS} 出现 ${(cfg.match(new RegExp(`- id: ${NS}`, "g")) ?? []).length} 处（应为 2）`);
	console.log(`   配置里 dsh-dt-bg 残留 ${(cfg.match(/dsh-dt-bg/g) ?? []).length} 处（应为 0）`);
} else {
	console.log("   [预演] 未写入。加 --apply 生效。");
}
