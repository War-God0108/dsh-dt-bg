/**
 * 改动后的**强制自检**——一条命令跑完全部验证。
 *
 * 为什么存在这个文件（请务必读完再改代码）：
 *
 * 这个插件的排查史里，最大的时间浪费不是"想不出原因"，而是
 * **改完不确认改动是否生效，就接着改下一处**。表现完全一样：
 * 改了代码 / 写了配置 → 让用户重启 → 用户说"没变化" → 我以为"这条规则无罪"，
 * 继续往下推。而实际上那一步改动从来没生效过。真实发生过的四种原因：
 *
 *   ① 宿主插件没重载（有孤儿进程占着）→ 跑的是旧代码
 *   ② 字段没写进 Config schema（宿主读不到）→ 开关是空转
 *   ③ seed 被写在 JSON.stringify / appendFile **之后** → 磁盘记录里没有它，
 *      连"有没有送到"都看不到
 *   ④ 缺一行 import（回退代码时被一起退掉）→ 调用时才抛
 *
 * 它们的共同点是：**语法检查、单元测试、代码审阅全都发现不了**。
 * 只有"真跑一次那条路径"或者"核对部署副本与运行版本"才能发现。
 *
 * 所以：**每次改完必须跑这个脚本，全绿才允许让用户重启。**
 * 用法：node tools/verify-all.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

/**
 * 每一项：名称 + 为什么它必要（失败时这句话会打出来提醒原因）。
 * `optional: true` 的项在没有对应文件时跳过（回退到旧版后某些脚本可能不存在）。
 */
const CHECKS = [
	["check-deployed.mjs", "源码与部署副本必须一致，且部署副本里的链路完整", false],
	["check-settings-row.mjs", "设置行必须无条件注册（曾被 whileServed 门控住，用户因此看不到「背景」控件）", true],
	["check-seed-order.mjs", "record.seed 必须写在序列化/写盘之前，否则磁盘记录里看不到它", true],
	["check-switches.mjs", "宿主读图 → seed → 客户端采纳这条链路必须完整", true],
	["check-marking.mjs", "面板标记的选择器必须与脚本里的类名一致", true],
	["check-corners.mjs", "圆角规则只能压平内容列左上角，不得清零官方圆角", true],
	["check-titlebar-wiring.mjs", "顶栏配色链路的变量必须接对", true],
	["check-inline-hover.mjs", "行内悬停反馈的实现必须完整（历史上被误删过）", true],
	["test-host-load.mjs", "宿主半端必须能被 import（缺 import 只在调用时炸）", true],
	["test-read-own.mjs", "宿主必须能从配置里读出壁纸（读不到画面就是内置兜底图）", true],
	["test-write-settings.mjs", "设置写入必须**真跑一次**（改字段/追加字段/图片不受影响/可还原）", true]
];

/** 单元测试单独列——它们跑得快，但覆盖不到上面那些链路问题。 */
const SUITES = [
	["test/client-visual.test.mjs", "客户端可视行为（标记/样式表/圆角/开关）"],
	["../dsh-web-bg/test/panel-transparency.test.mjs", "面板透明化（v1 遗留、仍然有效）"]
];

let failed = 0;
let skipped = 0;

console.log("=== 一、链路检查（脚本全绿才算数）===\n");
for (const [script, why, optional] of CHECKS) {
	const file = join(ROOT, "tools", script);
	if (!existsSync(file)) {
		if (optional) {
			console.log(`  – 跳过 ${script}（文件不存在）`);
			skipped++;
		} else {
			console.log(`  ✗ 缺少必需检查：${script.split(".")[0]}.mjs`);
			console.log(`      它验证的是：${why}`);
			failed++;
		}
		continue;
	}
	try {
		const out = execFileSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
		const tail = out.trim().split("\n").slice(-1)[0] ?? "";
		console.log(`  ✓ ${script.padEnd(26)} ${tail.slice(0, 64)}`);
	} catch (error) {
		failed++;
		console.log(`  ✗ ${script}`);
		console.log(`      它验证的是：${why}`);
		const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().split("\n").slice(-4);
		for (const l of out) console.log(`      | ${l.slice(0, 130)}`);
	}
}

console.log("\n=== 二、单元测试 ===\n");
for (const [suite, why] of SUITES) {
	const file = join(ROOT, suite);
	if (!existsSync(file)) {
		console.log(`  – 跳过 ${suite}（不存在）`);
		continue;
	}
	try {
		const out = execFileSync(process.execPath, [file], { cwd: ROOT, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
		const m = /(\d+\/\d+ 项断言通过)/.exec(out);
		console.log(`  ✓ ${suite.padEnd(42)} ${m === null ? "通过" : m[1]}`);
	} catch (error) {
		failed++;
		const out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
		const m = /(\d+\/\d+ 项断言通过)/.exec(out);
		console.log(`  ✗ ${suite.padEnd(42)} ${m === null ? "失败" : m[1]}`);
	}
}

console.log(`\n=== 结论 ===`);
if (failed === 0) {
	console.log(`  全部通过${skipped > 0 ? `（跳过 ${skipped} 项不存在的检查）` : ""}。可以进入"重启验证"这一步。`);
	console.log("  但请注意：这些检查只能证明**改动生效了**，不能证明**效果是对的**——");
	console.log("  后者仍然需要重启后看画面，或者核对上报记录里的实际值。");
} else {
	console.log(`  ${failed} 项失败——**不要**让用户重启，先修好。`);
	console.log("  历史上多次因为跳过这一步，把一个「从没生效过」的改动当成「规则无罪」的证据。");
	process.exitCode = 1;
}
