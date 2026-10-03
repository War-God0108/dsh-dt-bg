/**
 * 调试 writeOwnSettings 为何找不到条目。
 * 用法：node tools/debug-write.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE } from "./paths.mjs";

const deployedDir = join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "node_modules", "dsh-dt-bg");
const deployed = join(deployedDir, "lib", "index.js");
console.log("部署副本:", deployed);
console.log("  存在:", existsSync(deployed), " 行数:", existsSync(deployed) ? readFileSync(deployed, "utf8").split("\n").length : "-");
console.log("  含 writeOwnSettings:", readFileSync(deployed, "utf8").includes("writeOwnSettings"));
console.log("  含 ind <= configIndent 判定:", readFileSync(deployed, "utf8").includes("ind <= configIndent"));

const mod = await import(`file://${deployed.replace(/\\/g, "/")}`);
console.log("\n导出:", Object.keys(mod).sort().join(", "));
console.log("name =", mod.name);

/* 复现 configFile() 的候选判据 */
const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh");
const profile = process.env.DSH_PROFILE ?? "desktop";
const candidates = [
	join(process.cwd(), "cordis.patch.yml"),
	join(home, "profiles", profile, "cordis.patch.yml"),
	join(home, "profiles", "desktop", "cordis.patch.yml"),
	join(home, "profiles", "web", "cordis.patch.yml")
];
console.log("\n候选配置文件：");
for (const f of candidates) {
	const exists = existsSync(f);
	let hasEntry = false;
	if (exists) {
		try {
			hasEntry = readFileSync(f, "utf8").includes(`- id: ${mod.name}`);
		} catch { /* 忽略 */ }
	}
	console.log(`  exists=${exists}  含"- id: ${mod.name}"=${hasEntry}  ${f}`);
}

/* 直接看真实配置里那一行的原文（含不可见字符） */
const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
console.log("\n配置文件里与我们条目相关的行（原文 JSON）：");
lines.forEach((l, i) => {
	if (/- id: dsh-dt-bg/.test(l) || l.trim() === "config:") {
		console.log(`  ${i + 1}| ${JSON.stringify(l)}`);
	}
});
console.log("\n文件修改时间:", statSync(CONFIG_FILE).mtime.toLocaleTimeString());

/* 直接调用一次写函数，看返回 */
const r = mod.writeOwnSettings({ translucency: 0.47 });
console.log("\nwriteOwnSettings({translucency:0.47}) →", JSON.stringify(r));
const after = readFileSync(CONFIG_FILE, "utf8");
const m = /^\s*translucency:\s*([\d.]+)\s*$/m.exec(after);
console.log("  写后配置里的 translucency =", m ? m[1] : "(未找到)");
