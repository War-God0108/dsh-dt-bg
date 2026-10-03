/**
 * 包重命名：`dsh-web-bg-2` → `dsh-dt-bg`（npm 包名 + 仓库名 + 部署目录名）。
 *
 * 刻意**不**改的东西（改了会连带破坏运行态或内部标识）：
 *   - cordis 挂载条目 id：仍是 `web-bg-2`（改了要动用户已有配置）
 *   - 客户端内部标识：`MARK = "wbg2"`、`STYLE_ID = "dsh-web-bg-2"`
 *     （前者是 DOM 标记前缀与诊断 API 路径 `/api/wbg2/diag`，
 *      后者是 `<style data-plugin-css>` 的值 —— 都属于内部实现，与包名无关）
 *   - README 里回滚历史快照的说明文字（那描述的是过去的状态）
 *
 * 用法：
 *   node tools/rename-package.mjs --dry     # 预演
 *   node tools/rename-package.mjs --apply    # 写入
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const OLD = "dsh-web-bg-2";
const NEW = "dsh-dt-bg";
const apply = process.argv.includes("--apply");

/** 需要改的文件（其余不碰；tools/ 下的历史脚本无所谓，一并改掉保持一致）。 */
const TARGETS = [
	"package.json",
	"cordis.patch.yml",
	"install.mjs",
	"README.md",
	"INSTALL.md",
	"verify.ps1",
	"lib/index.js",
	"test/client-visual.test.mjs",
	"test/browser.test.mjs",
	"test/fixture.html",
	"test/switch-shape.html"
];

/** 这些行即使含旧名也要保留（内部标识 / 历史说明）。 */
const KEEP_PATTERNS = [
	/STYLE_ID/,
	/data-plugin-css/,
	/data-plugin=/,
	/宿主半端写/,
	/历史/,
	/回滚/,
	/snapshot/,
	/restore/
];

const report = [];
for (const rel of TARGETS) {
	const file = join(ROOT, rel);
	let text;
	try {
		text = readFileSync(file, "utf8");
	} catch {
		continue;
	}
	const lines = text.split("\n");
	let changedLines = 0;
	const out = lines.map((line) => {
		if (!line.includes(OLD)) return line;
		if (KEEP_PATTERNS.some((re) => re.test(line))) return line;
		changedLines++;
		return line.split(OLD).join(NEW);
	});
	if (changedLines === 0) continue;
	report.push({ rel, changedLines });
	if (apply) writeFileSync(file, out.join("\n"), "utf8");
}

console.log(`${apply ? "已修改" : "[预演] 将修改"}：`);
for (const r of report) console.log(`  ${r.rel.padEnd(30)} ${r.changedLines} 行`);

/* 改完做语法检查 */
if (apply) {
	console.log("\n语法检查：");
	for (const rel of ["lib/index.js", "lib/client.js", "install.mjs", "test/client-visual.test.mjs"]) {
		try {
			execFileSync(process.execPath, ["--check", join(ROOT, rel)], { stdio: "pipe", timeout: 20000 });
			console.log(`  ✓ ${rel}`);
		} catch (error) {
			console.log(`  ✗ ${rel}`);
			void error;
		}
	}
} else {
	console.log("\n加 --apply 才会写入。");
}
