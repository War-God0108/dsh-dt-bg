/**
 * 一次性核对：客户端与宿主半端的版本标记是否都已就位、且部署副本与源码一致。
 *
 * 用法：node tools/check-builds.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const srcClient = read(join(ROOT, "lib", "client.js"));
const srcHost = read(join(ROOT, "lib", "index.js"));
const depClient = read(join(DEPLOYED_DIR, "lib", "client.js"));
const depHost = read(join(DEPLOYED_DIR, "lib", "index.js"));

const clientBuild = /clientBuild:\s*"([^"]+)"/.exec(srcClient);
const hostBuild = /build:\s*"([^"]+)"/.exec(srcHost);

const rows = [
	["源码 client.js 版本标记", clientBuild === null ? "(无)" : clientBuild[1]],
	["源码 index.js 版本标记", hostBuild === null ? "(无)" : hostBuild[1]],
	["部署 client.js 同源码", srcClient === depClient ? "一致 ✓" : "不一致 ✗"],
	["部署 index.js 同源码", srcHost === depHost ? "一致 ✓" : "不一致 ✗"],
	["client 有 seed 兜底", srcClient.includes("seedSettings !== null") ? "有 ✓" : "无 ✗"],
	["host 有写设置入口", srcHost.includes("writeOwnSettings") ? "有 ✓" : "无 ✗"],
	["host 的 seed 在写盘前", srcHost.indexOf("record.seed = {") < srcHost.indexOf("${JSON.stringify(record)}") ? "是 ✓" : "否 ✗"]
];
for (const [k, v] of rows) console.log(`  ${k.padEnd(26)} = ${v}`);
