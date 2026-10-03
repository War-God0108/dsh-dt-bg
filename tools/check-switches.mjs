/**
 * 自检：**壁纸**从配置到画面的链路是否完整。
 *
 * 这是当前版本最要紧的一条链路 —— 真机现象是"设置里明明选了图，画面还是
 * 内置兜底图"，根因是客户端 `configForms` 读不到配置（`getValue().image` 恒为空串），
 * 必须由宿主直接读文件、随诊断响应把图送回去。
 *
 * 踩过的坑（每一次的表现都是"重启后毫无变化"）：
 *   ① 宿主没读当前条目（只读 v1 的 `web-bg`）→ 送不出去
 *   ② `record.seed` 写在序列化/写盘之后 → 磁盘记录里看不到它，误判成"没送到"
 *   ③ 客户端 `adoptSeed` 在有图时直接 return → 送了也不用
 *
 * 设计原则：**只检查本版真实存在的链路**。早期版本的本脚本硬编码了
 * 调试开关字段，回退到没有那些字段的版本后就开始误报。
 *
 * 用法：node tools/check-switches.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

for (const [label, dir] of [
	["源码", join(ROOT, "lib")],
	["部署副本", join(DEPLOYED_DIR, "lib")]
]) {
	const hostPath = join(dir, "index.js");
	const clientPath = join(dir, "client.js");
	if (!existsSync(hostPath) || !existsSync(clientPath)) {
		console.log(`=== ${label} === 目录不存在，跳过\n`);
		continue;
	}
	const host = readFileSync(hostPath, "utf8");
	const client = readFileSync(clientPath, "utf8");
	console.log(`=== ${label} ===`);

	let bad = 0;
	const check = (name, ok, hint) => {
		if (!ok) bad++;
		console.log(`  ${ok ? "OK  " : "✗   "}${name}`);
		if (!ok && hint !== void 0) console.log(`        ${hint}`);
	};

	/* ---- 宿主侧 ---- */
	/* 宿主读配置的函数名各版本可能不同（readOwnImage / readOwnSettings），
	   所以按**能力**判定而不是按名字：必须存在一个读当前条目 image 的函数，
	   并且它被导出（否则测试与工具没法直接验证它）。 */
	const readerName = (/function (read\w*Own\w*)\s*\(/.exec(host) ?? [])[1] ?? null;
	check(
		"宿主有读当前条目配置的函数",
		readerName !== null,
		"没有它，客户端读不到配置里的图，画面会回落成内置兜底图"
	);
	if (readerName !== null) {
		/* 只在这里判一次导出（早期版本在别处还写过一条用 `/name\s*\}/` 的断言，
		   而导出列表里 `readOwnSettings,` 后面是逗号，那条永远失败）。 */
		check(`该函数（${readerName}）已导出`, new RegExp(`export\\s*\\{[^}]*\\b${readerName}\\b`).test(host), "未导出则单测/工具无法直接验证它");
	}
	check("诊断响应会送出 seed.image", /seed\.image/.test(host), "响应里没有 image，客户端拿不到图");
	/* 两处坑都在这条断言里踩过：
	   ① 用 `indexOf("JSON.stringify(record)")` 会匹到**注释**里提到它的那行，
	      得出"seed 写在序列化之后"的错误结论 —— 必须匹整行赋值语句；
	   ② `readOwnSettings` 的导出后面跟的是逗号不是右花括号。 */
	const seedLine = host.split("\n").findIndex((l) => /record\.seed\s*=/.test(l));
	const lineLine = host.split("\n").findIndex((l) => /const line\s*=.*JSON\.stringify\(record\)/.test(l));
	check(
		"record.seed 在序列化之前",
		seedLine >= 0 && lineLine >= 0 && seedLine < lineLine,
		`写在之后的话，磁盘记录里永远没有 seed —— 你会误判成「没送到」（seed 第 ${seedLine + 1} 行 / 序列化第 ${lineLine + 1} 行）`
	);
	if (readerName !== null) {
		check(
			`该函数（${readerName}）已导出`,
			new RegExp(`export\\s*\\{[^}]*\\b${readerName}\\b`).test(host),
			"未导出则单测/工具无法直接验证它"
		);
	}

	/* ---- 客户端侧 ---- */
	check("客户端有 adoptSeed", /async function adoptSeed/.test(client));
	check("adoptSeed 会采纳 image", /seed\.image/.test(client), "不采纳的话，宿主送来了也不会用");
	check("客户端模块 id 等于包名", /id:\s*"[^"]+",\s*\n\s*factory:/.test(client) && client.includes(`id: "${JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name}"`), "模块 id 与包名不一致时，客户端模块表里找不到它，插件等于没装");

	console.log(bad === 0 ? "  → 链路完整\n" : `  → ${bad} 项缺失\n`);
	if (bad > 0) process.exitCode = 1;
}
