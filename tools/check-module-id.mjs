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

/* NAMESPACE 是**配置命名空间**，必须与宿主导出 name、挂载 id/name 一致
   （见 tools/list-names.mjs）。它与模块 id、npm 包名是三件不同的事：
     - 模块 id  ：客户端模块表里的键，取包名即可
     - NAMESPACE：读设置的键，改了会让配置不再下发（实测踩过，见 README）
     - 包名     ：npm / 部署目录名
   这里只验 NAMESPACE 与 STYLE_ID 前缀一致（两者是同一套内部标识）。 */
const ns = /const NAMESPACE = "([^"]+)"/.exec(src);
const st = /const STYLE_ID = "([^"]+)"/.exec(src);
console.log(`  NAMESPACE              = ${ns === null ? "(未找到)" : ns[1]}`);
console.log(`  STYLE_ID               = ${st === null ? "(未找到)" : st[1]}`);

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const pair = [ns?.[1], st?.[1]?.replace("/main", "")];
const uniq = [...new Set(pair)];
console.log(`\n  NAMESPACE / STYLE_ID 前缀：${JSON.stringify(uniq)}`);
console.log(uniq.length === 1 ? `  ✓ 两者同名：${uniq[0]}` : "  ✗ 两者不一致");
console.log(`  模块 id = ${pickId(src)}`);
console.log(`  npm 包名 = ${pkg.name}`);
if (uniq.length !== 1) process.exitCode = 1;
