/**
 * 定位官方"开关"组件的真实标记：搜 role="switch" / aria-checked 的渲染代码。
 * 用法：node tools/find-switch-markup.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const base = join(homedir(), "AppData", "Local", "npm-cache", "_npx", "1e7f6d9597241db0", "node_modules", "@deepseek-ai");

const NEEDLES = ['role: "switch"', 'role:"switch"', '"aria-checked"', "ariaChecked", "_toggle", "_Switch"];

for (const pkg of readdirSync(base)) {
	if (!pkg.startsWith("dsh-client")) continue;
	const file = join(base, pkg, "lib", "client.js");
	try {
		if (!statSync(file).isFile()) continue;
	} catch {
		continue;
	}
	const text = readFileSync(file, "utf8");
	for (const needle of NEEDLES) {
		const at = text.indexOf(needle);
		if (at < 0) continue;
		console.log(`--- ${pkg}  「${needle}」 ---`);
		console.log(text.slice(Math.max(0, at - 420), at + 420).replace(/\n/g, " ").slice(0, 800));
		console.log("");
	}
}
