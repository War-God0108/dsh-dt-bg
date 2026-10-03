/**
 * 把 profile 配置里**我们自己的**挂载块与相关注释整理成"恰好一个"。
 *
 * 处理三类历史残留：
 *   1. 重复的 insert 块（历史上 name 写法变化导致 install.mjs 认不出旧块而重复追加）
 *   2. 孤立的注释行（`# <包名>: 背景替换插件…`，其对应的块已被删除）
 *   3. 误留的旧命名空间挂载块（web-bg-2 / dsh-web-bg-2）
 *
 * 用法：
 *   node tools/tidy-mounts.mjs          # 预演
 *   node tools/tidy-mounts.mjs --apply
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { CONFIG_FILE, ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const NS = JSON.parse(readFileSync(`${ROOT}/package.json`, "utf8")).name;
const LEGACY = new Set(["web-bg-2", "dsh-web-bg-2", NS, "dsh-web-bg"]);

const lines = readFileSync(CONFIG_FILE, "utf8").split("\n");
const keep = [];
let keptBlock = false;
let removedBlocks = 0;
let removedComments = 0;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];

	/* ① 我们的注释行：先看它后面是否紧跟一个 insert 块；有块就留给块自己处理 */
	if (line.trimStart().startsWith("#") && /背景替换插件|bg.*v2|dsh-.*bg.*install\.mjs/.test(line)) {
		removedComments++;
		continue;
	}

	/* ② insert 块 */
	if (line.trimStart().startsWith("- insert:")) {
		const indent = line.length - line.trimStart().length;
		const block = [line];
		let j = i + 1;
		while (j < lines.length) {
			const l = lines[j];
			const ind = l.length - l.trimStart().length;
			if (l.trim() === "" || ind > indent) {
				block.push(l);
				j++;
				continue;
			}
			break;
		}
		/* 块的 id：取第一处 `- id:` */
		const body = block.join("\n");
		const id = (/- id:\s*['"]?([^'"\s]+)['"]?/.exec(body) ?? [])[1] ?? "";
		if (LEGACY.has(id)) {
			if (!keptBlock) {
				const rewritten = body
					.replace(/- id:\s*['"]?[^'"\s]+['"]?/, `- id: ${NS}`)
					.replace(/name:\s*['"]?[^'"\n]+['"]?/, `name: '${NS}'`);
				keep.push(`# ${NS}: 背景替换插件 v2（由 install.mjs 写入，删除该条目即可卸载）`);
				keep.push(...rewritten.split("\n"));
				keptBlock = true;
			} else {
				removedBlocks++;
			}
			i = j - 1;
			continue;
		}
		keep.push(...block);
		i = j - 1;
		continue;
	}
	keep.push(line);
}

/* 压掉多余空行 */
const text = keep.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n");

console.log(`保留挂载块：${keptBlock ? 1 : 0} 个`);
console.log(`删除重复挂载块：${removedBlocks} 个`);
console.log(`删除孤立注释行：${removedComments} 行`);

if (apply) {
	const backup = `${CONFIG_FILE}.bak-tidy-${Date.now()}`;
	copyFileSync(CONFIG_FILE, backup);
	writeFileSync(CONFIG_FILE, text, "utf8");
	console.log(`已写入（备份 → ${backup}）\n`);
} else {
	console.log("[预演] 未写入\n");
}

/* 打印结果 */
const after = (apply ? text : keep.join("\n")).split("\n");
after.forEach((l, i) => {
	if (l.includes("base64")) {
		console.log(`  ${String(i + 1).padStart(3)}| image: <${(l.length / 1024).toFixed(0)} KB data URL>`);
		return;
	}
	console.log(`  ${String(i + 1).padStart(3)}| ${l}`);
});
