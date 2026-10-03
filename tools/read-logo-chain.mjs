/**
 * 读取 logoChain 探针结果：小胖鲸到侧边栏根这条链上每层的几何与定位，
 * 以及折叠按钮（toggle）自身的位置与可见性。
 * 用法：node tools/read-logo-chain.mjs
 */
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const size = statSync(file).size;
const chunk = Math.min(size, 8 * 1024 * 1024);
const fd = openSync(file, "r");
const buf = Buffer.alloc(chunk);
readSync(fd, buf, 0, chunk, size - chunk);
closeSync(fd);
const lines = buf.toString("utf8").split("\n").filter((l) => l.trim().startsWith("{"));

let shown = 0;
const seen = new Set();
for (let i = lines.length - 1; i >= 0 && shown < 2; i--) {
	let rec;
	try {
		rec = JSON.parse(lines[i]);
	} catch {
		continue;
	}
	const c = rec.report?.logoChain;
	if (c === undefined || c.found !== true) continue;
	const key = c.sidebarRect?.[2] ?? "?";
	if (seen.has(key)) continue;
	seen.add(key);
	shown++;

	console.log(`\n===== ${rec.at}｜侧边栏 [${c.sidebarRect.join(", ")}] =====`);
	console.log("\n-- logo 行的层叠链（从 brandMark 往上）--");
	for (const r of c.chain) {
		console.log(`  ${String(r.rect.join(",")).padEnd(24)} ${r.cls.slice(0, 42)}`);
		console.log(`      pos=${r.pos} display=${r.display} flex=${r.flex} margin=${r.margin}`);
		if (r.justify !== "normal" || r.align !== "normal") console.log(`      justify=${r.justify} align=${r.align}`);
	}
	console.log("\n-- 折叠按钮（toggle）--");
	if (c.toggle === null) console.log("  未找到（侧边栏可能已折叠，按钮不存在）");
	else {
		console.log(`  ${c.toggle.cls}`);
		console.log(`  rect=[${c.toggle.rect.join(", ")}]  pos=${c.toggle.pos} display=${c.toggle.display}`);
		console.log(`  visibility=${c.toggle.visibility} opacity=${c.toggle.opacity} zIndex=${c.toggle.zIndex}`);
		console.log(`  bg=${c.toggle.background}  parent=${c.toggle.parentCls}`);
	}
}
if (shown === 0) console.log("未取到 logoChain（探针未生效或调试通道不可用）");
