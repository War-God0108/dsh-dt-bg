/**
 * 一次性：把某文件里的旧包名整体替换为新包名，并做语法检查。
 * 用法：node tools/swap-name.mjs <相对路径> <旧名> <新名>
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const [rel, oldName, newName] = process.argv.slice(2);
if (rel === void 0 || oldName === void 0 || newName === void 0) {
	console.log("用法：node tools/swap-name.mjs <相对路径> <旧名> <新名>");
	process.exit(1);
}
const file = join(ROOT, rel);
const text = readFileSync(file, "utf8");
const count = text.split(oldName).length - 1;
if (count === 0) {
	console.log(`${rel}: 未找到「${oldName}」，无改动。`);
	process.exit(0);
}
writeFileSync(file, text.split(oldName).join(newName), "utf8");
console.log(`${rel}: 替换 ${count} 处「${oldName}」→「${newName}」`);

try {
	execFileSync(process.execPath, ["--check", file], { stdio: "pipe", timeout: 20000 });
	console.log("  语法检查通过");
} catch (error) {
	console.log("  ✗ 语法检查失败");
	void error;
	process.exitCode = 1;
}
