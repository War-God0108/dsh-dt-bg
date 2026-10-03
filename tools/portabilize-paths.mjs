/**
 * 把工具脚本里硬编码的本机路径，改写为从 ./paths.mjs 导入。
 *
 * 背景：这些脚本是我排查时一个个写的，里面写死了 Windows 用户名、工作区绝对路径、
 * npx 缓存哈希目录。功能没问题，但公开仓库不该带这些环境信息。
 *
 * 本脚本只做**保守替换**：
 *   1. 含本机用户名的路径 → 导入 ROOT / CONFIG_FILE / DIAG_FILE / DEPLOYED_DIR / resolveDshModules()
 *   2. 顺带去掉多余的空转导入
 * 替换后立即对每个文件做 `node --check`，任一处失败就整批回滚（--apply 时才写盘）。
 *
 * 用法：
 *   node tools/portabilize-paths.mjs          # 预演，只报告
 *   node tools/portabilize-paths.mjs --apply  # 实际写入
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const TOOLS = join(ROOT, "tools");

/** 需要引入哪些符号：按替换结果决定。 */
const REPLACEMENTS = [
	// npx 缓存里的 @deepseek-ai 目录（含哈希与用户名）
	{
		re: /"C:\/Users\/[^"]*\/AppData\/Local\/npm-cache\/_npx\/[^"]*\/node_modules\/@deepseek-ai"/g,
		to: "resolveDshModules()",
		symbol: "resolveDshModules"
	},
	/* 同一目录、但用 join() 逐段拼出来（含写死的哈希目录名）：
	   join(homedir(), "AppData", "Local", "npm-cache", "_npx", "<hash>", "node_modules", "@deepseek-ai") */
	{
		re: /join\(homedir\(\),\s*"AppData",\s*"Local",\s*"npm-cache",\s*"_npx",\s*"[^"]*",\s*"node_modules",\s*"@deepseek-ai"\)/g,
		to: "resolveDshModules()",
		symbol: "resolveDshModules"
	},
	/* npx 缓存里其它包（例如 yaml）：只留包名，目录运行时解析 */
	{
		re: /"C:\/Users\/[^"]*\/AppData\/Local\/npm-cache\/_npx\/[^"]*\/node_modules\/([a-z0-9@/._-]+)"/gi,
		to: (_m, pkg) => `join(resolveDshModules(), "..", ${JSON.stringify(pkg)})`,
		symbol: "resolveDshModules"
	},
	/* 通用兜底：整条路径都在引号里、且带本机用户名。
	   放在上面几条之后 —— 更具体的写法先匹配掉，剩下的走这里。 */
	{
		re: /"C:\/Users\/[^"/]+\/([^"]*)"/g,
		to: (_m, rest) => {
			const parts = String(rest).split("/").filter((s) => s !== "");
			/* `.dsh/...` 走 DSH_HOME，其余（AppData 等）走 homedir() */
			if (parts[0] === ".dsh") {
				const tail = parts.slice(1);
				return tail.length === 0
					? "DSH_HOME"
					: `join(DSH_HOME${tail.map((p) => `, ${JSON.stringify(p)}`).join("")})`;
			}
			return `join(homedir()${parts.map((p) => `, ${JSON.stringify(p)}`).join("")})`;
		},
		symbol: "DSH_HOME",
		extraSymbol: "homedir"
	},
	// .dsh 下的具体文件/目录
	{
		re: /"C:\/Users\/[^"]*\/\.dsh\/\.dsh-web-bg2-diagnostics\.jsonl"/g,
		to: "DIAG_FILE",
		symbol: "DIAG_FILE"
	},
	{
		re: /"C:\/Users\/[^"]*\/\.dsh\/profiles\/desktop\/cordis\.patch\.yml"/g,
		to: "CONFIG_FILE",
		symbol: "CONFIG_FILE"
	},
	{
		re: /"C:\/Users\/[^"]*\/\.dsh\/profiles\/node_modules\/dsh-web-bg-2\/lib\/client\.js"/g,
		to: "join(DEPLOYED_DIR, \"lib\", \"client.js\")",
		symbol: "DEPLOYED_DIR"
	},
	{
		re: /"C:\/Users\/[^"]*\/\.dsh\/dsh-runtimes\/dsh-primary-runtime\/dependencies\/python\/python\.exe"/g,
		to: "process.env.DSH_PYTHON ?? \"python\"",
		symbol: null
	},
	// 工作区绝对路径
	{
		re: /"E:\/Agent projects\/Deepseek Harness\/dsh-web-bg-2\/lib\/client\.js"/g,
		to: "join(ROOT, \"lib\", \"client.js\")",
		symbol: "ROOT"
	},
	{
		re: /"E:\/Agent projects\/Deepseek Harness\/dsh-web-bg-2\/test\/screenshots(\/[^"]*)?"/g,
		to: "join(ROOT, \"test\", \"screenshots\")",
		symbol: "ROOT"
	},
	{
		re: /"E:\/Agent projects\/Deepseek Harness\/dsh-web-bg-2\/dist(\/[^"]*)?"/g,
		to: "join(ROOT, \"dist\")",
		symbol: "ROOT"
	},
	{
		re: /"E:\/Agent projects\/Deepseek Harness\/dsh-web-bg-2([^"]*)"/g,
		to: (_m, rest) => {
			const parts = String(rest).split("/").filter((s) => s !== "");
			return `join(ROOT${parts.map((p) => `, ${JSON.stringify(p)}`).join("")})`;
		},
		symbol: "ROOT"
	},
	// 写死的 node 可执行文件
	{ re: /"C:\\\\Program Files\\\\nodejs\\\\node\.exe"/g, to: "process.execPath", symbol: null },
	{ re: /"C:\\Program Files\\nodejs\\node\.exe"/g, to: "process.execPath", symbol: null }
];

const files = readdirSync(TOOLS).filter((f) => f.endsWith(".mjs") && f !== "paths.mjs" && f !== "portabilize-paths.mjs");
const report = [];
const planned = new Map();

for (const name of files) {
	const file = join(TOOLS, name);
	if (!statSync(file).isFile()) continue;
	let text = readFileSync(file, "utf8");
	const before = text;
	const needed = new Set();

	for (const { re, to, symbol, extraSymbol } of REPLACEMENTS) {
		text = text.replace(re, (...args) => {
			if (symbol !== null) needed.add(symbol);
			if (extraSymbol !== void 0) needed.add(extraSymbol);
			return typeof to === "function" ? to(...args) : to;
		});
	}
	if (text === before) continue;

	/* 本机用户名若还散落在别处（注释等），一并替换掉 */
	const user = process.env.USERNAME ?? "";
	if (user !== "" && text.includes(user)) text = text.split(user).join("<用户>");

	/* 插入导入（放在最后一个 import 之后；没有 import 就放最前） */
	if (needed.size > 0) {
		const symbols = [...needed].sort().join(", ");
		const importLine = `import { ${symbols} } from "./paths.mjs";\n`;
		if (text.includes('from "./paths.mjs"')) {
			text = text.replace(/import \{[^}]*\} from "\.\/paths\.mjs";\n/, importLine);
		} else {
			const lastImport = text.lastIndexOf("\nimport ");
			if (lastImport >= 0) {
				const end = text.indexOf("\n", lastImport + 1);
				text = `${text.slice(0, end + 1)}${importLine}${text.slice(end + 1)}`;
			} else {
				text = `${importLine}${text}`;
			}
		}
	}
	planned.set(file, text);
	report.push({ name, symbols: [...needed] });
}

console.log(`${apply ? "已写入" : "[预演] 将修改"} ${report.length} 个文件：`);
for (const r of report) console.log(`  ${r.name.padEnd(34)} 引入: ${r.symbols.join(", ") || "(无)"}`);

/* 写入后逐个做语法检查；任一处失败就回滚该文件 */
if (!apply) {
	console.log("\n加 --apply 才会写入。");
	process.exit(0);
}

const backups = new Map();
let failed = 0;
for (const [file, text] of planned) {
	backups.set(file, readFileSync(file, "utf8"));
	writeFileSync(file, text, "utf8");
	try {
		execFileSync(process.execPath, ["--check", file], { stdio: "pipe", timeout: 20000 });
	} catch (error) {
		failed++;
		writeFileSync(file, backups.get(file), "utf8");
		console.log(`  ✗ ${file}（语法检查失败，已回滚）`);
		void error;
	}
}
console.log(failed === 0 ? "\n全部通过语法检查。" : `\n${failed} 个文件已回滚。`);

