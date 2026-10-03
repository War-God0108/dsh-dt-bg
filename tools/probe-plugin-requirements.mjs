/**
 * 确认插件包是否符合官方 dsh-plugin-manager 的安装要求：
 *   - package.json 里 dsh 清单的字段
 *   - 主入口导出什么（apply / name / Config …）
 *   - 安装到 profile 之后是否会自动挂载（还是要手写 cordis.patch.yml）
 *
 * 用法：node tools/probe-plugin-requirements.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const base = join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules", "@deepseek-ai");
const text = readFileSync(join(base, "dsh-plugin-manager", "lib", "index.js"), "utf8");

function show(label, needle, before = 240, after = 420, max = 3) {
	const out = [];
	let from = 0;
	while (out.length < max) {
		const i = text.indexOf(needle, from);
		if (i < 0) break;
		out.push(text.slice(Math.max(0, i - before), i + after).replace(/\n/g, " ").replace(/\s+/g, " "));
		from = i + needle.length;
	}
	if (out.length === 0) {
		console.log(`\n（未找到「${label}」）`);
		return;
	}
	console.log(`\n===== ${label} =====`);
	for (const s of out) console.log(`  ${s.slice(0, 620)}\n`);
}

show("安装后是否写入 profile patch", "patch", 200, 320, 3);
show("cordis.patch.yml", "cordis.patch", 220, 320, 3);
show("dsh 清单字段（client/manifest）", "manifest", 160, 300, 3);
show("插件目录位置", "node_modules", 200, 260, 3);
