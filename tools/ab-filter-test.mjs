/**
 * A/B 对照：确认"折叠按钮压到 logo 上"是否由插件的 drop-shadow 滤镜引起。
 *
 * 原理：CSS `filter` 会为元素建立新的包含块（containing block），
 * 使其内部 `position: fixed` 的后代改为相对该元素定位，而不是相对视口。
 * 官方那个折叠按钮正是 `position: fixed`，一旦侧边栏列带上了 filter，
 * 它就会从"视口左上角"变成"侧边栏左上角"，从而压到 logo 上。
 *
 * 本脚本依次设置 filter 开/关，各触发一次上报，把两次的 toggle 位置并排打印。
 *
 * 用法：node tools/ab-filter-test.mjs
 */
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const YAML = "C:/Users/31259/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/yaml";
const CONFIG = "C:/Users/31259/.dsh/profiles/desktop/cordis.patch.yml";
const DIAG = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const node = process.execPath;

function setConfig(patch) {
	const code = `
const fs=require('fs');const Y=require(${JSON.stringify(YAML)});
const f=${JSON.stringify(CONFIG)};
const d=Y.parse(fs.readFileSync(f,'utf8'));
const e=d.find(x=>x&&x.id==='web-bg-2');
e.config={...e.config, ...${JSON.stringify(patch)}};
fs.writeFileSync(f,Y.stringify(d,{lineWidth:0}),'utf8');
`;
	execFileSync(node, ["-e", code], { stdio: "pipe", timeout: 30000 });
}

/** 取最近一条含 logoChain 的记录。 */
function latestChain() {
	const size = statSync(DIAG).size;
	const chunk = Math.min(size, 4 * 1024 * 1024);
	const fd = openSync(DIAG, "r");
	const buf = Buffer.alloc(chunk);
	readSync(fd, buf, 0, chunk, size - chunk);
	closeSync(fd);
	const lines = buf.toString("utf8").split("\n").filter((l) => l.trim().startsWith("{"));
	for (let i = lines.length - 1; i >= 0; i--) {
		let rec;
		try {
			rec = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const c = rec.report?.logoChain;
		if (c !== undefined && c.found === true) return { at: rec.at, chain: c };
	}
	return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 触发一次上报（改一个无关紧要的数值）。 */
async function poke(i) {
	setConfig({ enabled: true, dim: 0.25 + (i % 5) * 0.0009 });
	await sleep(4000);
}

console.log("步骤 1/2：保持现状（含 drop-shadow 滤镜）触发上报…");
await poke(1);
await poke(2);
const withFilter = latestChain();

console.log("步骤 2/2：临时去掉滤镜，再触发上报…");
setConfig({ noCornerFill: true });
await poke(3);
await poke(4);
const withoutFilter = latestChain();

/* 恢复默认（滤镜开启） */
setConfig({ noCornerFill: false, enabled: true });
console.log("已恢复配置（滤镜开启）。\n");

const show = (label, got) => {
	if (got === null) {
		console.log(`${label}：未取到记录`);
		return;
	}
	const t = got.chain.toggle;
	console.log(`${label}（${got.at}）`);
	if (t === null) {
		console.log("   折叠按钮：不存在");
		return;
	}
	console.log(`   按钮 rect = [${t.rect.join(", ")}]   pos = ${t.pos}`);
	const row = got.chain.chain.find((c) => c.cls.includes("logoRow"));
	if (row !== undefined) console.log(`   logoRow rect = [${row.rect.join(", ")}]`);
};

show("【含滤镜】", withFilter);
show("【去滤镜】", withoutFilter);

if (withFilter !== null && withoutFilter !== null) {
	const a = withFilter.chain.toggle?.rect ?? [];
	const b = withoutFilter.chain.toggle?.rect ?? [];
	const moved = a.length > 0 && b.length > 0 && (a[0] !== b[0] || a[1] !== b[1]);
	console.log(`\n按钮位置是否随滤镜改变：${moved ? "是 → 滤镜就是元凶 ✓" : "否 → 另有原因，需要继续查"}`);
	if (moved) console.log(`  含滤镜 [${a.join(", ")}]  →  去滤镜 [${b.join(", ")}]`);
}
