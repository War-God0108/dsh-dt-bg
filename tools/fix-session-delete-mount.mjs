/**
 * 修复被 `fix-after-rollback.mjs` 误改的 session-delete 挂载名。
 *
 * 事故经过：那个脚本"把所有 insert 块里的 name 都改成包名"，
 * 于是 session-delete 的挂载名也被改成了 `dsh-web-bg-2` —— 它加载会失败。
 * 教训：批量替换**绝不要跨条目**，必须按条目 id 限定范围。
 *
 * 用法：node tools/fix-session-delete-mount.mjs [--apply]
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const WANT = { "session-delete": "dsh-session-delete", "web-bg-2": "dsh-web-bg-2" };

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
let fixed = 0;
for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	if (!/^\s*name:\s*['"]?\S+['"]?\s*$/.test(line)) {
		out.push(line);
		continue;
	}
	/* 往上找本条目最近的 `- id:`，据此决定 name 该是什么 */
	let id = null;
	for (let j = i - 1; j >= 0 && j > i - 6; j--) {
		const m = /-\s*id:\s*['"]?([^'"\s]+)['"]?/.exec(lines[j]);
		if (m !== null) {
			id = m[1];
			break;
		}
	}
	const want = id === null ? void 0 : WANT[id];
	if (want === void 0) {
		out.push(line);
		continue;
	}
	const indent = line.slice(0, line.length - line.trimStart().length);
	const next = `${indent}name: '${want}'`;
	if (line !== next) {
		console.log(`  第 ${i + 1} 行（id=${id}）：${line.trim()} → ${next.trim()}`);
		fixed++;
	}
	out.push(next);
}

console.log(`\n共修正 ${fixed} 处挂载名`);
if (apply && fixed > 0) {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-sessionfix-${Date.now()}`);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log("已写入");
} else if (!apply) {
	console.log("[预演] 未写入。加 --apply 生效。");
}
