/**
 * 恢复/停用 v2 设置行的总开关（只改 `enabled`，不动别的）。
 *
 * 用途：`disable-v2.mjs` 会把 enabled 置为 false 并把挂载块删掉；
 * 用 `install.mjs` 重新挂载之后，需要用这个把开关打开。
 *
 * 用法：
 *   node tools/set-enabled.mjs true
 *   node tools/set-enabled.mjs false
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const NS = "web-bg-2";
const want = process.argv[2];
if (want !== "true" && want !== "false") {
	console.log("用法：node tools/set-enabled.mjs <true|false>");
	process.exit(1);
}

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
let inside = false;
let changed = 0;
for (let i = 0; i < lines.length; i++) {
	const t = lines[i].trim();
	if (t === `- id: ${NS}`) {
		inside = true;
		continue;
	}
	if (!inside) continue;
	if (/^- /.test(lines[i])) break;
	const m = /^(\s*)enabled:\s*(\w+)\s*$/.exec(lines[i]);
	if (m === null) continue;
	if (m[2] === want) {
		console.log(`  第 ${i + 1} 行已经是 enabled: ${want}`);
		break;
	}
	console.log(`  第 ${i + 1} 行：enabled: ${m[2]} → ${want}`);
	lines[i] = `${m[1]}enabled: ${want}`;
	changed++;
	break;
}

if (changed === 0) {
	console.log("没有需要修改的地方。");
} else {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-setenabled-${Date.now()}`);
	writeFileSync(CONFIG_FILE, lines.join("\n"), "utf8");
	console.log("已写入。**重启 DSH** 生效（配置只在启动时读入）。");
}
