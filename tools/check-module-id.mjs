/**
 * 核对客户端模块 id 与"部署副本是否与源码逐字节一致"。
 * 用法：node tools/check-module-id.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

const src = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
const pickId = (text) => {
	const m = /id:\s*"([^"]+)",\s*\n\s*factory:/.exec(text);
	return m === null ? "(未找到)" : m[1];
};

const deployedFile = join(DEPLOYED_DIR, "lib", "client.js");
const deployed = existsSync(deployedFile) ? readFileSync(deployedFile, "utf8") : null;

console.log(`  源码模块 id            = ${pickId(src)}`);
console.log(`  部署副本模块 id        = ${deployed === null ? "(未部署)" : pickId(deployed)}`);
console.log(`  两份逐字节一致         = ${deployed === null ? "(未部署)" : src === deployed}`);

/* namespace 与 id 应当同名（都等于包名） */
const ns = /const NAMESPACE = "([^"]+)"/.exec(src);
const st = /const STYLE_ID = "([^"]+)"/.exec(src);
console.log(`  NAMESPACE              = ${ns === null ? "(未找到)" : ns[1]}`);
console.log(`  STYLE_ID               = ${st === null ? "(未找到)" : st[1]}`);

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
/* 约束是「模块 id / NAMESPACE / STYLE_ID 前缀」三者一致，
   **不要求**等于 npm 包名 —— 命名空间是插件的内部标识；
   跟着包名改会让 DSH 找不到对应实例、配置不再下发（实测踩过，见 README）。 */
const trio = [pickId(src), ns?.[1], st?.[1]?.replace("/main", "")];
const uniq = [...new Set(trio)];
console.log(`\n  模块 id / NAMESPACE / STYLE_ID 前缀：${JSON.stringify(uniq)}`);
console.log(uniq.length === 1 ? `  ✓ 三者同名：${uniq[0]}` : "  ✗ 三者不一致 —— 配置不会下发到插件");
console.log(`  npm 包名 = ${pkg.name}（与命名空间可以不同）`);
if (uniq.length !== 1) process.exitCode = 1;
