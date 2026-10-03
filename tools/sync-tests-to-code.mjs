/**
 * 把测试里的硬编码标识同步为 `lib/client.js` 里的实际值。
 *
 * 背景：包名改过一次又回退过，测试文件被改成了新名（`dsh-dt-bg*`），
 * 而代码回到了旧名（`dsh-web-bg-2*`），于是测试全线报"id 不符"。
 * 与其手工来回改，不如让测试跟着源码走。
 *
 * 替换范围：test/*.mjs、test/*.html 里的
 *   - 模块 id / STYLE_ID 前缀
 *   - NAMESPACE
 *   - LAYER_ID / VEIL_ID
 *
 * 用法：
 *   node tools/sync-tests-to-code.mjs          # 预演
 *   node tools/sync-tests-to-code.mjs --apply
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const src = readFileSync(join(ROOT, "lib", "client.js"), "utf8");

const pick = (re) => {
	const m = re.exec(src);
	return m === null ? null : m[1];
};
const id = pick(/id:\s*"([^"]+)",\s*\n\s*factory:/);
const ns = pick(/const NAMESPACE = "([^"]+)"/);
const layer = pick(/const LAYER_ID = "([^"]+)"/);
const veil = pick(/const VEIL_ID = "([^"]+)"/);
const styleId = pick(/const STYLE_ID = "([^"]+)"/);

console.log("源码里的实际标识：");
console.log(`  模块 id   = ${id}`);
console.log(`  NAMESPACE = ${ns}`);
console.log(`  LAYER_ID  = ${layer}`);
console.log(`  VEIL_ID   = ${veil}`);
console.log(`  STYLE_ID  = ${styleId}`);

if ([id, ns, layer, veil].some((v) => v === null)) {
	console.log("\n有标识没解析出来，中止。");
	process.exit(1);
}

/* 旧的（改名时期的）标识 → 新的（当前代码的） */
const PAIRS = [
	["dsh-dt-bg-layer", layer],
	["dsh-dt-bg-veil", veil],
	["dsh-dt-bg/main", styleId],
	["dsh-dt-bg", id]
];
/* 命名空间单独替换（它可能出现在 id 里，所以放最后并避免误伤已替换的） */
const NS_PAIRS = [
	["web-bg-2", ns],
	["dsh-dt-bg", ns]
];

const dir = join(ROOT, "test");
const files = readdirSync(dir).filter((f) => /\.(mjs|html)$/.test(f));
let total = 0;
const report = [];

for (const f of files) {
	const p = join(dir, f);
	let text = readFileSync(p, "utf8");
	const before = text;
	let n = 0;
	/* ① 先替换带后缀的长标识（避免被短的前缀规则先吃掉） */
	for (const [from, to] of PAIRS) {
		if (from === to) continue;
		const c = text.split(from).length - 1;
		if (c > 0) {
			text = text.split(from).join(to);
			n += c;
		}
	}
	if (text !== before) {
		report.push({ f, n });
		total += n;
		if (apply) writeFileSync(p, text, "utf8");
	}
}

console.log(`\n${apply ? "已修改" : "[预演] 将修改"} ${report.length} 个测试文件，共 ${total} 处：`);
for (const r of report) console.log(`  ${r.f.padEnd(28)} ${r.n} 处`);
if (!apply) console.log("\n加 --apply 生效。");
