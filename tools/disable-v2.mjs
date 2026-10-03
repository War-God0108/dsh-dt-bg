/**
 * 停用 v2（dsh-web-bg-2），但**不删除配置与设置**。
 *
 * 做法：把挂载块从 profile 配置里移除（插件不再被加载），
 * 同时给设置行加 `enabled: false` —— 这样将来想恢复只需删掉这个字段。
 * 图片与其它设置原样保留，不会丢。
 *
 * 用法：
 *   node tools/disable-v2.mjs          # 预演
 *   node tools/disable-v2.mjs --apply
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const NS = "web-bg-2";

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const out = [];
let removedMounts = 0;
let disabledRow = false;
let insideOurs = false;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	const t = line.trim();

	/* 挂载块：id 是我们的就整块删掉 */
	if (t.startsWith("- insert:")) {
		const indent = line.length - line.trimStart().length;
		const block = [line];
		let j = i + 1;
		while (j < lines.length) {
			const l = lines[j];
			if (l.trim() === "") break;
			if (l.length - l.trimStart().length <= indent) break;
			block.push(l);
			j++;
		}
		const id = (/- id:\s*['"]?([^'"\s]+)/.exec(block.join("\n")) ?? [])[1] ?? "";
		if (id === NS) {
			console.log(`  删除挂载块（第 ${i + 1} 行起，id=${id}）`);
			removedMounts++;
			i = j - 1;
			continue;
		}
		out.push(...block);
		i = j - 1;
		continue;
	}

	/* 我们的设置行：保留，但把 enabled 置为 false */
	if (t === `- id: ${NS}`) {
		insideOurs = true;
		out.push(line);
		continue;
	}
	if (insideOurs && /^- /.test(line)) insideOurs = false;
	if (insideOurs && /^\s*enabled:\s*true\s*$/.test(line)) {
		out.push(line.replace(/enabled:\s*true/, "enabled: false"));
		disabledRow = true;
		console.log(`  enabled: true → false（第 ${i + 1} 行）`);
		continue;
	}
	out.push(line);
}

console.log(`\n挂载块删除 ${removedMounts} 个；设置行已停用：${disabledRow ? "是" : "否（可能本来就是 false）"}`);
if (apply) {
	copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.bak-disablev2-${Date.now()}`);
	writeFileSync(CONFIG_FILE, out.join("\n"), "utf8");
	console.log("已写入。**重启 DSH** 后 v2 不再加载；图片与设置都还在。");
} else {
	console.log("[预演] 未写入。加 --apply 生效。");
}
