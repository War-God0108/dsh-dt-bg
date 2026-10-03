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

console.log("插件命名空间出现的位置：\n");
for (const [label, value] of rows) console.log(`  ${label.padEnd(34)} = ${value}`);

const namespace = [rows[0][1], rows[1][1], rows[2][1], rows[3][1], rows[5][1], rows[7][1], rows[8][1]];
const uniq = [...new Set(namespace)];
console.log(`\n命名空间取值：${JSON.stringify(uniq)}`);
console.log(uniq.length === 1 ? `  ✓ 已全部一致：${uniq[0]}` : "  ✗ 仍不一致 —— 配置不会下发到插件");

const ids = [rows[4][1], rows[6][1], rows[8][1]];
const idsUniq = [...new Set(ids)];
console.log(`\n挂载/设置行 id：${JSON.stringify(idsUniq)}`);
console.log(idsUniq.length === 1 ? `  ✓ 已一致：${idsUniq[0]}` : "  ✗ id 不一致");
