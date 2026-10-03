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
import { CONFIG_FILE, DEPLOYED_DIR, resolveDshModules, ROOT } from "./paths.mjs";

const require = createRequire(import.meta.url);
const YAML = require(join(resolveDshModules(), "..", "yaml"));

/* 直接加载部署副本的宿主半端（依赖在 profile 里可解析）。
   包名从 package.json 取，别写死 —— 改名/回退过一次，写死就会指向不存在的目录。 */
const pkgName = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name;
/* 配置条目的 id 是**命名空间**，不是包名（两者故意不同）。 */
const NS = "web-bg-2";
const deployed = join(DEPLOYED_DIR, "lib", "index.js");
void pkgName;
const mod = await import(`file://${deployed.replace(/\\/g, "/")}`);
const { writeOwnSettings } = mod;

/* 并非每个版本都带"宿主直写配置"这个能力（它是为修
   "configForms 写入不落盘"而加的）。本版没有时**跳过**而不是报失败 ——
   拿另一个版本的期望来判定当前版本，正是早期反复误报的原因。
   跳过时会明确打印原因，避免"静默通过"被误读成"写入没问题"。 */
if (typeof writeOwnSettings !== "function") {
	console.log("本版宿主没有 writeOwnSettings —— 跳过写入实测。");
	console.log("（该能力用于绕过 configForms 写入不落盘的问题；此版没有它，属预期。）");
	process.exit(0);
}

/** 本地读一份配置里我们条目的字段（宿主那版没导出这个函数）。 */
function readOur(text) {
	const out = {};
	let inside = false;
	let config = false;
	for (const line of text.split("\n")) {
		const t = line.trim();
		if (t === `- id: ${NS}`) {
			inside = true;
			config = false;
			continue;
		}
		if (!inside) continue;
		if (/^- /.test(line) && !t.startsWith("- id:")) break;
		if (t === "config:") {
			config = true;
			continue;
		}
		if (!config) continue;
		const m = /^([A-Za-z][\w-]*):\s*(.+)$/.exec(t);
		if (m !== null) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	return out;
}

const before = readFileSync(CONFIG_FILE, "utf8");
const backup = `${CONFIG_FILE}.bak-writetest-${Date.now()}`;
copyFileSync(CONFIG_FILE, backup);
console.log(`原配置已备份 → ${backup}\n`);

const orig = readOur(before);
console.log("写入前：translucency =", orig.translucency, " dim =", orig.dim, " 图片 =", orig.image?.length ?? 0, "字符\n");

/* ① 改一个已有字段 */
const NEW_TL = 0.47;
let r = writeOwnSettings({ translucency: NEW_TL });
console.log("① writeOwnSettings({translucency: 0.47}) →", JSON.stringify(r));
let after = readFileSync(CONFIG_FILE, "utf8");
let parsed = YAML.parse(after);
const row = parsed.find((e) => e !== null && typeof e === "object" && e.id === NS && e.config !== void 0);
console.log("   写后 YAML 解析：成功；translucency =", row?.config?.translucency, "（应为", NEW_TL + "）");
console.log("   图片仍在：", typeof row?.config?.image === "string" ? row.config.image.length + " 字符" : "✗ 丢了");

/* ② 追加一个新字段 */
r = writeOwnSettings({ color: "#abcdef" });
console.log("\n② writeOwnSettings({color: '#abcdef'}) →", JSON.stringify(r));
after = readFileSync(CONFIG_FILE, "utf8");
parsed = YAML.parse(after);
const row2 = parsed.find((e) => e !== null && typeof e === "object" && e.id === NS && e.config !== void 0);
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


