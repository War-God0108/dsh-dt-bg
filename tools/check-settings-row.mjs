/**
 * 自检：设置行（「设置 → 通用」里的「背景」控件）是否会被**无条件注册**。
 *
 * 这个是用户反复报的"插件列表/设置面板里没有那个开关"的直接原因：
 * 注册语句被 `ctx.configForms.whileServed([NAMESPACE], …)` 包着 ——
 * 意思是"配置服务可用时才注册"。但真机上 `configForms.get(NAMESPACE)`
 * 拿不到本站点配置，`whileServed` 因而不触发，**设置行从来就没注册过**。
 *
 * 所以本检查盯住三件事：
 *   ① 不能再出现 whileServed 门控
 *   ② slots.inject("settings.general.item", …) 必须直接调用
 *   ③ Row 组件与 slots 依赖必须在
 *
 * 用法：node tools/check-settings-row.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEPLOYED_DIR, ROOT } from "./paths.mjs";

for (const [label, dir] of [
	["源码", join(ROOT, "lib")],
	["部署副本", join(DEPLOYED_DIR, "lib")]
]) {
	const file = join(dir, "client.js");
	if (!existsSync(file)) {
		console.log(`=== ${label} === 不存在，跳过\n`);
		continue;
	}
	const src = readFileSync(file, "utf8");
	/** 去掉注释后再检查 —— 否则"解释为什么去掉某个门控"的注释本身会被当成门控
	    （本脚本第一版就这么误报过）。 */
	const code = src
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
	console.log(`=== ${label} ===`);

	let bad = 0;
	const check = (name, ok, hint) => {
		if (!ok) bad++;
		console.log(`  ${ok ? "OK  " : "✗   "}${name}`);
		if (!ok && hint !== void 0) console.log(`        ${hint}`);
	};

	check("代码里没有 whileServed 门控", !/whileServed/.test(code), "它会在 configForms 拿不到配置时**根本不注册**设置行 —— 用户就看不到「背景」控件");
	check(
		"直接在 settings.general.item 插槽注册",
		/ctx\.slots\.inject\(\s*["']settings\.general\.item["']/.test(code),
		"没注册就没有那一组控件"
	);
	check("注册用的组件 Row 存在", /function Row\s*\(/.test(code));
	check("slots 在 inject 依赖里", /const inject = \[[^\]]*["']slots["']/.test(code), "不声明 slots 依赖，ctx.slots 可能不存在");
	check("configForms 拿不到时有兜底", /FALLBACK_FORM/.test(code), "没有兜底会让 apply() 第一行就抛，后面的行注册全都不执行");
	console.log(bad === 0 ? "  → 设置行会正常注册\n" : `  → ${bad} 项有问题\n`);
	if (bad > 0) process.exitCode = 1;
}
