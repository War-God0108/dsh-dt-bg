/**
 * 把命名空间与包名统一为 `dsh-dt-bg`，并**验证它确实能被 Node 解析到**。
 *
 * 上一轮的教训（两个方向都踩过）：
 *   - 把命名空间改成包名 `dsh-dt-bg` → 当时配置里有两个挂载块，属另一问题；
 *   - 把命名空间改成 `web-bg-2`        → **Node 根本解析不到这个包**，插件不加载
 *     （真机提示"背景插件未启用"）。
 *
 * 关键事实（用 createRequire 实测）：从 profile 目录解析时，Node 会查
 * `<profiles>/node_modules`，所以 `name:` 只要等于**部署目录名**（= npm 包名）即可。
 *
 * 本脚本做两件事：
 *   1. 把四处名字统一写成 `dsh-dt-bg`，并用 Node 解析验证；
 *   2. 迁移本机 profile 配置（挂载块的 id/name、用户设置行 id），并清理重复块。
 *
 * 用法：
 *   node tools/unify-names.mjs              # 预演
 *   node tools/unify-names.mjs --apply
 */
import { createRequire } from "node:module";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, DEPLOYED_DIR, ROOT } from "./paths.mjs";

const NS = "dsh-dt-bg";
/** 历史命名空间（要一并替换掉）。 */
const LEGACY = ["web-bg-2", "dsh-web-bg-2"];
const apply = process.argv.includes("--apply");

/* ---------- 0. 先验证这个包名能被解析（最重要的一步） ---------- */
const profileDir = join(CONFIG_FILE, "..");
const req = createRequire(join(profileDir, "package.json"));
let resolved = null;
try {
	resolved = req.resolve(`${NS}/package.json`);
} catch {
	try {
		resolved = req.resolve(NS);
	} catch {
		resolved = null;
	}
}
console.log(`① 包名可解析性验证：${NS}`);
console.log(`   从 ${profileDir} 解析 → ${resolved === null ? "✗ 失败（插件会加载不了）" : resolved}`);
if (resolved === null) {
	console.log("\n中止：这个包名解析不到，先修好部署再改名。");
	process.exit(1);
}

/* ---------- 1. 仓库内四处 ---------- */
const FILES = [
	["lib/index.js", /const name = "[^"]+";/, `const name = "${NS}";`],
	["lib/client.js", /const NAMESPACE = "[^"]+";/, `const NAMESPACE = "${NS}";`],
	["install.mjs", /const PLUGIN_ID = "[^"]+";/, `const PLUGIN_ID = "${NS}";`],
	["install.mjs", /const ENTRY_ID = "[^"]+";/, `const ENTRY_ID = "${NS}";`]
];
console.log("\n② 仓库文件：");
for (const [rel, re, to] of FILES) {
	const file = join(ROOT, rel);
	const text = readFileSync(file, "utf8");
	if (!re.test(text)) {
		console.log(`   ${rel.padEnd(16)} 未匹配 ${re}`);
		continue;
	}
	console.log(`   ${rel.padEnd(16)} ${(re.exec(text) ?? [])[0]} → ${to}`);
	if (apply) writeFileSync(file, text.replace(re, to), "utf8");
}
/* cordis.patch.yml 的 id / name */
{
	const file = join(ROOT, "cordis.patch.yml");
	let text = readFileSync(file, "utf8");
	const before = text;
	for (const legacy of LEGACY) {
		text = text.replace(new RegExp(`^(\\s*- id:\\s*)${legacy}\\s*$`, "m"), `$1${NS}`);
		text = text.replace(new RegExp(`^(\\s*name:\\s*)['"]?${legacy}['"]?\\s*$`, "m"), `$1${NS}`);
	}
	console.log(`   cordis.patch.yml  ${before === text ? "（已是目标值）" : "id/name → " + NS}`);
	if (apply && before !== text) writeFileSync(file, text, "utf8");
}

/* ---------- 2. profile 配置 ---------- */
console.log("\n③ 本机 profile 配置：");
const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
let inserts = 0;
let removedInserts = 0;
let rows = 0;
const isOurs = (id) => id === NS || LEGACY.includes(id);

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
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
		if (isOurs(id)) {
			if (inserts === 0) {
				out.push(
					...body
						.replace(/- id:\s*\S+/, `- id: ${NS}`)
						.replace(/name:\s*'?[^'\n]+'?/, `name: '${NS}'`)
						.split("\n")
				);
				inserts++;
			} else {
				removedInserts++;
			}
			i = j - 1;
			continue;
		}
		out.push(...block);
		i = j - 1;
		continue;
	}
	const rowM = /^- id:\s*(\S+)\s*$/.exec(line);
	if (rowM !== null && isOurs(rowM[1]) && /^\s*config:\s*$/.test(lines[i + 1] ?? "")) {
		out.push(`- id: ${NS}`);
		if (rowM[1] !== NS) rows++;
		continue;
	}
	out.push(line);
}
console.log(`   挂载块：保留 1 个（id/name = ${NS}），删除重复 ${removedInserts} 个`);
console.log(`   设置行 id：修正 ${rows} 处`);

if (apply) {
	const backup = `${CONFIG_FILE}.bak-unifynames-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log(`   已写入（备份 → ${backup}）`);
} else {
	console.log("   [预演] 未写入");
}
console.log(apply ? "\n完成。**重启 DSH** 后生效。" : "\n加 --apply 生效。");
void DEPLOYED_DIR;
