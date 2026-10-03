/**
 * 核对插件"配置命名空间"是否处处一致（改名后自检）。
 * 用法：node tools/list-names.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, DEPLOYED_DIR, ROOT } from "./paths.mjs";

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const host = read("lib/index.js");
const client = read("lib/client.js");
const pkgPatch = read("cordis.patch.yml");
const install = read("install.mjs");
const config = readFileSync(CONFIG_FILE, "utf8");

const pick = (text, re) => {
	const m = re.exec(text);
	return m === null ? "(未找到)" : m[1];
};

/** 取出**最后一个** insert 块（我们的挂载块在配置末尾）。 */
const lastInsert = (() => {
	const blocks = [...config.matchAll(/- insert:\s*\n\s*- id:\s*(\S+)\s*\n\s*name:\s*'?([^'\n]+)'?/g)];
	if (blocks.length === 0) return { id: "(无)", name: "(无)" };
	const b = blocks[blocks.length - 1];
	return { id: b[1], name: b[2].trim() };
})();

const deployedHost = join(DEPLOYED_DIR, "lib", "index.js");
/** 从 yaml 文本里取"非注释行"的 `key: value`。注释行里也会出现 `name:` 字样，
    早期直接用 /name:\s*(.+)/ 会匹到注释内容，得出错误结论。 */
const yamlValue = (text, key) => {
	for (const line of text.split("\n")) {
		if (line.trimStart().startsWith("#")) continue;
		const m = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`).exec(line);
		if (m !== null) return m[1].replace(/^["']|["']$/g, "");
	}
	return "(未找到)";
};

const rows = [
	["lib/index.js 导出 name（命名空间）", pick(host, /const name = "([^"]+)"/)],
	["lib/client.js NAMESPACE", pick(client, /const NAMESPACE = "([^"]+)"/)],
	["包内 cordis.patch.yml 的 name", yamlValue(pkgPatch, "name")],
	["install.mjs PLUGIN_ID", pick(install, /const PLUGIN_ID = "([^"]+)"/)],
	["install.mjs ENTRY_ID（挂载 id）", pick(install, /const ENTRY_ID = "([^"]+)"/)],
	["已部署副本的导出 name", existsSync(deployedHost) ? pick(readFileSync(deployedHost, "utf8"), /const name = "([^"]+)"/) : "(未部署)"],
	["本机配置：挂载 id", lastInsert.id],
	["本机配置：挂载 name", lastInsert.name],
	["本机配置：设置行 id", pick(config, /- id:\s*(\S+)\s*\n\s*config:/)]
];

console.log("插件标识一览：\n");
for (const [label, value] of rows) console.log(`  ${label.padEnd(34)} = ${value}`);

/* ---------- 两组必须分别一致 ----------
   ① **命名空间**：宿主导出 name、客户端 NAMESPACE、install 的 PLUGIN_ID/ENTRY_ID、
      挂载 id、设置行 id。六者必须相同，否则 DSH 认为配置行没有对应实例。
   ② **包名**：包内补丁的 name、挂载 name —— 会被解析成包，**必须等于部署目录名**。
   命名空间与包名**允许不同**（官方亦然，如 ui-theme 与 @deepseek-ai/dsh-client-ui-theme）。 */
const namespace = [rows[0][1], rows[1][1], rows[3][1], rows[4][1], rows[6][1], rows[8][1]];
const nsUniq = [...new Set(namespace)];
console.log(`\n① 命名空间（六处必须相同）：${JSON.stringify(nsUniq)}`);
console.log(nsUniq.length === 1 ? `  ✓ 一致：${nsUniq[0]}` : "  ✗ 不一致 —— 配置不会下发到插件");

const pkgNames = [rows[2][1], rows[7][1]];
const pkgUniq = [...new Set(pkgNames)];
const deployed = rows[5][1];
console.log(`\n② 包名（挂载用，必须可解析）：${JSON.stringify(pkgUniq)}`);
console.log(pkgUniq.length === 1 ? `  ✓ 一致：${pkgUniq[0]}` : "  ✗ 不一致");
if (deployed !== "(未部署)") {
	console.log(`  已部署副本的命名空间 = ${deployed}（与①相同即为正常）`);
}

/* ---------- 包名是否真的能解析（最硬的检查） ---------- */
if (pkgUniq.length === 1) {
	try {
		const { createRequire } = await import("node:module");
		const { CONFIG_FILE } = await import("./paths.mjs");
		const req = createRequire(join(CONFIG_FILE, "..", "package.json"));
		req.resolve(`${pkgUniq[0]}/package.json`);
		console.log(`  ✓ "${pkgUniq[0]}" 可被 Node 解析 —— 插件能加载`);
	} catch {
		console.log(`  ✗ "${pkgUniq[0]}" 无法解析 —— 插件会加载失败（真机提示"未启用"）`);
		process.exitCode = 1;
	}
}
if (nsUniq.length !== 1 || pkgUniq.length !== 1) process.exitCode = 1;
