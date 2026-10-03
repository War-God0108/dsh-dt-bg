/**
 * 读取最近若干条诊断里 `switchSamples` 的结果，把"官方开关"与"我的开关"并排对比。
 * 用途：改完开关样式后核对是否与官方同规格（尺寸/圆角/底色）。
 * 用法：node tools/compare-switch.mjs [回溯条数]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const file = join(homedir(), ".dsh", ".dsh-web-bg2-diagnostics.jsonl");
const lines = readFileSync(file, "utf8").trim().split("\n");
const lookback = Number(process.argv[2] ?? 8);

let report = null;
for (let i = lines.length - 1; i >= 0 && i > lines.length - 1 - lookback; i--) {
	const r = JSON.parse(lines[i]).report;
	if ((r.switchSamples ?? []).length > 0) {
		report = { at: JSON.parse(lines[i]).at, samples: r.switchSamples };
		break;
	}
}
if (report === null) {
	console.log(`最近 ${lookback} 条诊断里都没有开关采样 —— 请打开「设置」面板后重试。`);
	process.exit(0);
}

console.log(`采样时间 ${report.at}，共 ${report.samples.length} 个元素\n`);
const rows = report.samples.map((x) => ({
	mine: String(x.cls).includes("wbg2"),
	cls: String(x.cls).slice(0, 36),
	role: x.role ?? "-",
	checked: x.checked ?? "-",
	size: x.rect.join("x"),
	radius: String(x.radius),
	bg: String(x.bg),
	border: String(x.border ?? "-")
}));

const width = Math.max(...rows.map((r) => r.cls.length)) + 1;
for (const tag of [false, true]) {
	console.log(tag ? "=== 我的控件 ===" : "=== 官方控件 ===");
	for (const r of rows.filter((x) => x.mine === tag)) {
		console.log(`  ${r.cls.padEnd(width)} ${r.size.padEnd(8)} radius=${r.radius.padEnd(8)} bg=${r.bg}`);
		console.log(`  ${" ".repeat(width)} role=${r.role} checked=${r.checked} border=${r.border}`);
	}
	console.log("");
}
