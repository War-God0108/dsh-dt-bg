/**
 * 批量替换：把仓库里剩余的旧包名字符串改成新包名。
 * 只做**字面量替换**，不碰函数名/文件名（它们不含连字符形式）。
 *
 * 用法：node tools/swap-all.mjs <旧名> <新名> [--dry]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const [oldName, newName] = process.argv.slice(2);
const dry = process.argv.includes("--dry");
if (oldName === void 0 || newName === void 0) {
	console.log("用法：node tools/swap-all.mjs <旧名> <新名> [--dry]");
	process.exit(1);
}

const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
const touched = [];
for (const rel of files) {
	if (/\.(png|jpg|jpeg|tgz|ico)$/i.test(rel)) continue;
	const file = join(ROOT, rel);
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		continue;
	}
	const n = text.split(oldName).length - 1;
	if (n === 0) continue;
	touched.push([rel, n]);
	if (!dry) writeFileSync(file, text.split(oldName).join(newName), "utf8");
}

console.log(`${dry ? "[预演] 将修改" : "已修改"} ${touched.length} 个文件：`);
for (const [rel, n] of touched) console.log(`  ${rel.padEnd(38)} ${n} 处`);

if (!dry) {
	console.log("\n语法检查（.js/.mjs）：");
	let bad = 0;
	for (const [rel] of touched) {
		if (!/\.(js|mjs)$/.test(rel)) continue;
		try {
			execFileSync(process.execPath, ["--check", join(ROOT, rel)], { stdio: "pipe", timeout: 20000 });
		} catch {
			bad++;
			console.log(`  ✗ ${rel}`);
		}
	}
	console.log(bad === 0 ? "  全部通过" : `  ${bad} 个失败`);
}
