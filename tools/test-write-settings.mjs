/**
 * 实测宿主的"写设置"函数（对应"设置面板点了没反应"的修复）。
 *
 * 验证四件事：
 *   1. 只改目标字段那一行，文件其它内容逐字节不变
 *   2. 写入后 YAML 仍能解析、config 字段齐全
 *   3. 追加新字段时位置正确（在 config 块内）
 *   4. 写完能还原
 *
 * 用法：node tools/test-write-settings.mjs
 */
import { copyFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CONFIG_FILE, resolveDshModules } from "./paths.mjs";

const require = createRequire(import.meta.url);
const YAML = require(join(resolveDshModules(), "..", "yaml"));

/* 直接加载部署副本的宿主半端（依赖在 profile 里可解析） */
const deployed = join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "dsh-dt-bg", "lib", "index.js");
const mod = await import(`file://${deployed.replace(/\\/g, "/")}`);
const { writeOwnSettings, readOwnSettings } = mod;

const before = readFileSync(CONFIG_FILE, "utf8");
const backup = `${CONFIG_FILE}.bak-writetest-${Date.now()}`;
copyFileSync(CONFIG_FILE, backup);
console.log(`原配置已备份 → ${backup}\n`);

const orig = readOwnSettings();
console.log("写入前：translucency =", orig.translucency, " dim =", orig.dim, " 图片 =", orig.image?.length ?? 0, "字符\n");

/* ① 改一个已有字段 */
const NEW_TL = 0.47;
let r = writeOwnSettings({ translucency: NEW_TL });
console.log("① writeOwnSettings({translucency: 0.47}) →", JSON.stringify(r));
let after = readFileSync(CONFIG_FILE, "utf8");
let parsed = YAML.parse(after);
const row = parsed.find((e) => e !== null && typeof e === "object" && e.id === "dsh-dt-bg" && e.config !== void 0);
console.log("   写后 YAML 解析：成功；translucency =", row?.config?.translucency, "（应为", NEW_TL + "）");
console.log("   图片仍在：", typeof row?.config?.image === "string" ? row.config.image.length + " 字符" : "✗ 丢了");

/* ② 追加一个新字段 */
r = writeOwnSettings({ color: "#abcdef" });
console.log("\n② writeOwnSettings({color: '#abcdef'}) →", JSON.stringify(r));
after = readFileSync(CONFIG_FILE, "utf8");
parsed = YAML.parse(after);
const row2 = parsed.find((e) => e !== null && typeof e === "object" && e.id === "dsh-dt-bg" && e.config !== void 0);
console.log("   写后 YAML 解析：成功；color =", row2?.config?.color, "（应为 #abcdef）");
console.log("   config 字段：", Object.keys(row2?.config ?? {}).join(", "));

/* ③ 差异面检查：除了目标字段，其它行必须一模一样 */
const b = before.split("\n");
const a = after.split("\n");
const diffs = [];
for (let i = 0; i < Math.max(a.length, b.length); i++) {
	if (a[i] !== b[i]) diffs.push(i);
}
console.log(`\n③ 逐行差异：${diffs.length} 处`);
for (const i of diffs.slice(0, 6)) {
	const show = (s) => (s === void 0 ? "(无此行)" : s.includes("base64") ? "<图片行>" : s.slice(0, 70));
	console.log(`   第 ${i + 1} 行  旧: ${show(b[i])}`);
	console.log(`               新: ${show(a[i])}`);
}
const risky = diffs.filter((i) => (b[i] ?? "").includes("base64") || (a[i] ?? "").includes("base64"));
console.log(`   涉及图片行的改动：${risky.length === 0 ? "无 ✓" : risky.length + " 处 ✗"}`);

/* ④ 还原 */
copyFileSync(backup, CONFIG_FILE);
const restored = readFileSync(CONFIG_FILE, "utf8");
console.log(`\n④ 已还原：与写入前逐字节一致 = ${restored === before}`);
