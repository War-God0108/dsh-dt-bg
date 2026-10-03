/**
 * 回退后的最终状态核对（重启前跑一次）。
 * 用法：node tools/final-state.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DSH_HOME, ROOT } from "./paths.mjs";

const PKG = "dsh-web-bg-2";
const NS = "web-bg-2";
const dep = join(DSH_HOME, "profiles", "node_modules", PKG);
const cfg = readFileSync(CONFIG_FILE, "utf8");
const patch = readFileSync(join(ROOT, "cordis.patch.yml"), "utf8");
const depHost = existsSync(join(dep, "lib", "index.js")) ? readFileSync(join(dep, "lib", "index.js"), "utf8") : null;

const pick = (text, re) => {
	const m = re.exec(text ?? "");
	return m === null ? "(未找到)" : m[1];
};

console.log("=== 包与部署 ===");
console.log(`  包名（目录名）        = ${PKG}`);
console.log(`  部署目录存在          = ${existsSync(dep) ? "是 ✓" : "否 ✗"}`);
console.log(`  旧目录 dsh-dt-bg 残留 = ${existsSync(join(DSH_HOME, "profiles", "node_modules", "dsh-dt-bg")) ? "仍存在 ✗" : "已清除 ✓"}`);
console.log(`  包内补丁 name         = ${pick(patch, /^\s*name:\s*(\S+)/m)}`);

console.log("\n=== 命名空间（应处处为 " + NS + "）===");
/** 取**我们条目**的 insert 块：id 必须等于命名空间。
    不能用"第一个 insert"—— 配置里还有 session-delete 的块（早期探针就是这么误报的）。 */
const ourMount = new RegExp(`- insert:\\s*\\n\\s*- id:\\s*${NS}\\s*\\n\\s*name:\\s*'?([^'\\n]+)'?`).exec(cfg);
const nsRows = [
	["lib/index.js 导出 name", pick(readFileSync(join(ROOT, "lib", "index.js"), "utf8"), /const name = "([^"]+)"/)],
	["lib/client.js NAMESPACE", pick(readFileSync(join(ROOT, "lib", "client.js"), "utf8"), /const NAMESPACE = "([^"]+)"/)],
	["部署副本导出 name", depHost === null ? "(未部署)" : pick(depHost, /const name = "([^"]+)"/)],
	["配置：挂载 id（我们的）", ourMount === null ? "(未找到)" : NS],
	["配置：设置行 id", pick(cfg, /- id:\s*(\S+)\s*\n\s*config:/)]
];
for (const [k, v] of nsRows) console.log(`  ${k.padEnd(24)} = ${v}`);

console.log("\n=== 挂载与其它插件 ===");
console.log(`  我们条目的挂载 name     = ${ourMount === null ? "(未找到)" : ourMount[1]}`);
console.log(`  session-delete 挂载     = ${/name: 'dsh-session-delete'/.test(cfg) ? "正确 ✓" : "异常 ✗"}`);
console.log(`  dsh-dt-bg 残留          = ${(cfg.match(/dsh-dt-bg/g) ?? []).length} 处`);

console.log("\n=== 用户数据 ===");
const img = /image:\s*"?data:image\/(\w+);base64,([A-Za-z0-9+/=]+)/.exec(cfg);
console.log(`  壁纸                  = ${img === null ? "丢失 ✗" : `${(Buffer.from(img[2], "base64").length / 1024).toFixed(0)} KiB（${img[1]}）✓`}`);
console.log(`  通透强度              = ${pick(cfg, /translucency:\s*([\d.]+)/)}`);
console.log(`  配置体积              = ${(cfg.length / 1024).toFixed(0)} KB`);

/* 关键判据：包名必须可解析 */
console.log("\n=== 判定 ===");
let bad = 0;
const req = createRequire(join(dirname(CONFIG_FILE), "package.json"));
try {
	const r = req.resolve(`${PKG}/package.json`);
	console.log(`  ✓ 包名可解析：${r}`);
} catch {
	console.log(`  ✗ 包名无法解析 —— 插件会加载失败`);
	bad++;
}
const nsUniq = [...new Set(nsRows.map((r) => r[1]).filter((v) => v !== "(未找到)" && v !== "(未部署)"))];
if (nsUniq.length === 1 && nsUniq[0] === NS) console.log(`  ✓ 命名空间一致：${NS}`);
else {
	console.log(`  ✗ 命名空间不一致：${JSON.stringify(nsUniq)}`);
	bad++;
}
if (ourMount === null || ourMount[1] !== PKG) {
	console.log(`  ✗ 我们条目的挂载 name 不是包名（${ourMount === null ? "未找到" : ourMount[1]}）`);
	bad++;
} else {
	console.log(`  ✓ 挂载 name 是包名：${PKG}`);
}
if (img === null) bad++;
console.log(bad === 0 ? "\n可以重启验证。" : `\n${bad} 项异常。`);
process.exitCode = bad === 0 ? 0 : 1;
