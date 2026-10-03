/**
 * 盘点快照：每个快照里的 client.js 行数与关键标识（模块 id / NAMESPACE / 包名），
 * 用于挑出"最后一次确定能用的状态"来回退。
 *
 * 用法：node tools/survey-snapshots.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const dir = join(ROOT, "snapshots");
if (!existsSync(dir)) {
	console.log("没有 snapshots 目录");
	process.exit(0);
}

/** 递归找 client.js（快照里可能平铺也可能在 lib/ 下）。 */
function findClient(base) {
	const hits = [];
	const walk = (d, depth) => {
		if (depth > 3) return;
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) walk(p, depth + 1);
			else if (e.name === "client.js") hits.push(p);
		}
	};
	walk(base, 0);
	return hits[0] ?? null;
}

const rows = [];
for (const name of readdirSync(dir)) {
	const base = join(dir, name);
	if (!statSync(base).isDirectory()) continue;
	const f = findClient(base);
	if (f === null) {
		rows.push({ name, mtime: statSync(base).mtime, note: "(无 client.js)" });
		continue;
	}
	const t = readFileSync(f, "utf8");
	const id = /id:\s*"([^"]+)",\s*\n\s*factory:/.exec(t);
	const ns = /const NAMESPACE = "([^"]+)"/.exec(t);
	const dep = /const LAYER_ID = "([^"]+)"/.exec(t);
	rows.push({
		name,
		mtime: statSync(base).mtime,
		lines: t.split("\n").length,
		id: id === null ? "?" : id[1],
		ns: ns === null ? "?" : ns[1],
		layer: dep === null ? "?" : dep[1],
		path: f.replace(`${base}\\`, "").replace(`${base}/`, "")
	});
}

rows.sort((a, b) => b.mtime - a.mtime);
console.log("快照名".padEnd(34) + "时间".padEnd(14) + "行数".padEnd(7) + "模块 id".padEnd(14) + "NAMESPACE".padEnd(13) + "LAYER_ID");
for (const r of rows.slice(0, 16)) {
	const time = r.mtime.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
	console.log(
		r.name.padEnd(34) +
			time.padEnd(14) +
			String(r.lines ?? "-").padEnd(7) +
			String(r.id ?? "-").padEnd(14) +
			String(r.ns ?? "-").padEnd(13) +
			String(r.layer ?? "-") +
			(r.note === void 0 ? "" : `  ${r.note}`)
	);
}
