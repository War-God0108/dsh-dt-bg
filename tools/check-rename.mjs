/**
 * 核对重命名结果：包名、部署目录名、挂载 id、内部标识各自应当是什么。
 * 用法：node tools/check-rename.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const install = readFileSync(join(ROOT, "install.mjs"), "utf8");
const patch = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8");
const client = readFileSync(join(ROOT, "lib", "client.js"), "utf8");
const host = readFileSync(join(ROOT, "lib", "index.js"), "utf8");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");

const pick = (text, re) => {
	const m = re.exec(text);
	return m === null ? "(未找到)" : m[1];
};

const EXPECT = [
	/* npm 包名 / 仓库名 / 部署目录名 */
	["package.json name", pkg.name, "dsh-dt-bg"],
	["package.json version", pkg.version, "2.0.0"],
	["repository.url", pkg.repository.url, "https://github.com/War-God0108/dsh-dt-bg.git"],
	["install.mjs PLUGIN_NAME（=部署目录名）", pick(install, /PLUGIN_NAME = "([^"]+)"/), "dsh-dt-bg"],
	/* 配置命名空间：**必须等于一个能被 Node 解析到的包名**。
	   实测（createRequire 从 profile 目录解析）：
	     dsh-dt-bg → 解析成功 ✓
	     web-bg-2  → 解析失败 ✗（插件会加载不了，真机提示"背景插件未启用"）
	   所以这里取包名；它与模块 id / NAMESPACE / STYLE_ID 也必须一致。 */
	["install.mjs PLUGIN_ID（=配置命名空间）", pick(install, /const PLUGIN_ID = "([^"]+)"/), "dsh-dt-bg"],
	["install.mjs ENTRY_ID（=挂载 id）", pick(install, /ENTRY_ID = "([^"]+)"/), "dsh-dt-bg"],
	["cordis.patch.yml 挂载 name", pick(patch, /name: (.+)/).trim(), "dsh-dt-bg"],
	["lib/index.js 导出 name", pick(host, /const name = "([^"]+)"/), "dsh-dt-bg"],
	["lib/client.js NAMESPACE", pick(client, /const NAMESPACE = "([^"]+)"/), "dsh-dt-bg"]
];

let bad = 0;
for (const [label, got, want] of EXPECT) {
	const ok = got === want;
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "✗   "} ${label.padEnd(42)} = ${got}${ok ? "" : `  （应为 ${want}）`}`);
}

console.log("\n内部标识：");
const KEEP = [
	/* STYLE_ID 已随包名统一（`<style data-plugin-css>` 的值），便于排查时一眼对上包 */
	["client.js STYLE_ID", /STYLE_ID = "dsh-dt-bg\/main"/.test(client), true],
	/* MARK 前缀与诊断 API 路径是**内部协议**，与包名无关，刻意保留 */
	["client.js MARK 前缀 wbg2", /MARK = "wbg2"/.test(client), true],
	["宿主诊断路由 /api/wbg2", /api\/wbg2/.test(host), true],
	["README 含新包名 dsh-dt-bg", readme.includes("dsh-dt-bg"), true]
];
for (const [label, got, want] of KEEP) {
	const ok = got === want;
	if (!ok) bad++;
	console.log(`${ok ? "OK  " : "✗   "} ${label.padEnd(42)} = ${got}`);
}

console.log(`\n${bad === 0 ? "全部正确" : bad + " 项异常"}`);
process.exitCode = bad === 0 ? 0 : 1;
