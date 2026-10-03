/**
 * dsh-dt-bg 安装脚本（幂等）。
 *
 * 做两件事：
 *   1. 把插件包部署到 `<DSH_HOME>/profiles/node_modules/dsh-dt-bg`
 *      （先删后拷，避免旧文件残留）；
 *   2. 在目标 profile 的 `cordis.patch.yml` 里挂上 `web-bg-2` 条目（已挂则跳过）。
 *
 * 用法：
 *   node install.mjs                     # 默认装进 $DSH_HOME/profiles/<DSH_PROFILE|desktop>
 *   node install.mjs --profile web       # 指定 profile
 *   node install.mjs --uninstall         # 反向操作（移除挂载项 + 删除包）
 *   node install.mjs --dry-run           # 只报告将要做什么
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_NAME = "dsh-dt-bg";
const ENTRY_ID = "web-bg-2";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name, fallback) => {
	const i = argv.indexOf(name);
	return i === -1 ? fallback : argv[i + 1];
};

const dshHome = resolve(option("--dsh-home", process.env.DSH_HOME ?? join(homedir(), ".dsh")));
const profileName = option("--profile", process.env.DSH_PROFILE ?? "desktop");
const profilesDir = join(dshHome, "profiles");
const moduleTarget = join(profilesDir, "node_modules", PLUGIN_NAME);
const patchFile = join(profilesDir, profileName, "cordis.patch.yml");
const dryRun = flag("--dry-run");
const uninstall = flag("--uninstall");

const log = (message) => console.log(`dsh-dt-bg: ${message}`);
const fail = (message) => {
	console.error(`dsh-dt-bg: ${message}`);
	process.exitCode = 1;
};

/** 挂载条目（与其它插件脚本保持同样的 YAML 形状）。 */
const MOUNT_BLOCK = [
	`# ${PLUGIN_NAME}: 背景替换插件 v2（由 install.mjs 写入，删除该条目即可卸载）`,
	"- insert:",
	`    - id: ${ENTRY_ID}`,
	`      name: '${PLUGIN_NAME}'`,
	""
].join("\n");

function deployPackage() {
	/* 保护：如果这个脚本本身就跑在目标位置上（例如包已被 pnpm 装到
	   profiles/node_modules 下，用户又执行了包内的 install.mjs），
	   就没什么可"部署"的 —— 直接跳过拷贝，否则 cpSync 会自己拷自己并报 ENOENT。 */
	const same = resolve(SELF_DIR) === resolve(moduleTarget);
	if (same) {
		log(`脚本就在目标位置，跳过拷贝：${moduleTarget}`);
		return;
	}
	if (dryRun) {
		log(`[dry-run] 会部署 ${SELF_DIR} -> ${moduleTarget}`);
		return;
	}
	mkdirSync(dirname(moduleTarget), { recursive: true });
	if (existsSync(moduleTarget)) rmSync(moduleTarget, { recursive: true, force: true });
	/* 只拷运行时需要的部分：lib 与 package.json（跳过 test/tools/快照之类）。
	   `cordis.patch.yml` 也一起拷 —— 它是包自带的 bundle 补丁，官方插件管理器
	   在"从 npm/tarball 安装"时靠它自动挂载；本地安装时保持同样的包结构，
	   两条安装路径就不会有差异。 */
	mkdirSync(moduleTarget, { recursive: true });
	cpSync(join(SELF_DIR, "package.json"), join(moduleTarget, "package.json"));
	cpSync(join(SELF_DIR, "lib"), join(moduleTarget, "lib"), { recursive: true });
	const bundlePatch = join(SELF_DIR, "cordis.patch.yml");
	if (existsSync(bundlePatch)) cpSync(bundlePatch, join(moduleTarget, "cordis.patch.yml"));
	log(`插件已部署 -> ${moduleTarget}`);
}

function removePackage() {
	if (!existsSync(moduleTarget)) {
		log(`插件目录不存在，跳过：${moduleTarget}`);
		return;
	}
	if (dryRun) {
		log(`[dry-run] 会删除 ${moduleTarget}`);
		return;
	}
	rmSync(moduleTarget, { recursive: true, force: true });
	log(`插件已删除：${moduleTarget}`);
}

/**
 * 是否已经有我们写的 insert 挂载块。
 *
 * 不能用 `text.includes("name: 'dsh-dt-bg'")` 判断——配置条目（`- id: web-bg-2`
 * 那段）里也会出现同样的文本，早期就是这么误判并**重复追加**的（真机被追加成三份）。
 *
 * 这里按行扫描 `- insert:` → `- id: web-bg-2` → `name: …dsh-dt-bg…` 三行连续的形状；
 * 注释行可有可无（YAML 序列化可能去掉引号，也可能没有注释行）。
 */
function hasMountBlock(text) {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length - 2; i++) {
		if (!lines[i].trimStart().startsWith("- insert:")) continue;
		if (!lines[i + 1].includes(`- id: ${ENTRY_ID}`)) continue;
		if (!/^\s*name:\s*['"]?dsh-dt-bg['"]?\s*$/.test(lines[i + 2])) continue;
		return true;
	}
	return false;
}

function mount() {
	if (!existsSync(patchFile)) {
		fail(`找不到 profile 的 cordis.patch.yml：${patchFile}（profile "${profileName}" 还没被 DSH 创建过？）`);
		return;
	}
	const text = readFileSync(patchFile, "utf8");
	if (hasMountBlock(text)) {
		log(`已挂载，跳过：${patchFile}`);
		return;
	}
	if (dryRun) {
		log(`[dry-run] 会在 ${patchFile} 追加挂载条目 ${ENTRY_ID}`);
		return;
	}
	const backup = `${patchFile}.bak-${PLUGIN_NAME}`;
	if (!existsSync(backup)) {
		writeFileSync(backup, text, "utf8");
		log(`已备份原配置 -> ${backup}`);
	}
	const separator = text.endsWith("\n") ? "\n" : "\n\n";
	writeFileSync(patchFile, `${text}${separator}${MOUNT_BLOCK}`, "utf8");
	log(`已挂载 ${ENTRY_ID} -> ${patchFile}`);
}

function unmount() {
	if (!existsSync(patchFile)) {
		log(`profile 配置不存在，跳过：${patchFile}`);
		return;
	}
	const text = readFileSync(patchFile, "utf8");
	if (!hasMountBlock(text)) {
		log(`未挂载，跳过：${patchFile}`);
		return;
	}
	if (dryRun) {
		log(`[dry-run] 会从 ${patchFile} 移除挂载条目`);
		return;
	}
	/* 删掉"注释行 + insert 块"这一整段；只动我们自己写的那四行 */
	const lines = text.split("\n");
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(`${PLUGIN_NAME}:`) && lines[i].trimStart().startsWith("#")) {
			/* 跳过注释行与其后的 - insert: / - id / name 三行 */
			const rest = lines.slice(i + 1, i + 4).join("\n");
			if (rest.includes("- insert:") && rest.includes(`name: '${PLUGIN_NAME}'`)) {
				i += 3;
				continue;
			}
		}
		out.push(lines[i]);
	}
	writeFileSync(patchFile, out.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
	log(`已移除挂载条目：${patchFile}`);
}

log(`DSH_HOME=${dshHome}  profile=${profileName}`);
if (uninstall) {
	unmount();
	removePackage();
} else {
	deployPackage();
	mount();
}
if (process.exitCode === void 0) {
	log("完成。新增客户端插件需要重启 DSH 才会进入客户端模块表（重启后改动走 client-hmr）。");
}


