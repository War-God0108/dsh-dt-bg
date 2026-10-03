/**
 * 共享路径解析 —— 工具脚本统一从这里取路径，**不要在脚本里硬编码本机路径**
 * （曾把 Windows 用户名与工作区绝对路径写进 14 个脚本，公开仓库里属于信息泄露）。
 *
 * 用法：
 *   import { ROOT, CONFIG_FILE, DIAG_FILE, resolveDshModules } from "./paths.mjs";
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 插件仓库根目录（由本文件位置反推，不依赖 cwd）。 */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** DSH 主目录。可用 DSH_HOME 覆盖。 */
export const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), ".dsh");

/** 目标 profile 名（默认 desktop，与插件运行时一致）。 */
export const PROFILE = process.env.DSH_PROFILE ?? "desktop";

/** profile 的配置补丁（插件设置就持久化在这里）。 */
export const CONFIG_FILE = join(DSH_HOME, "profiles", PROFILE, "cordis.patch.yml");

/** 客户端诊断输出（宿主半端写入的 JSONL）。 */
export const DIAG_FILE = join(DSH_HOME, ".dsh-web-bg2-diagnostics.jsonl");

/** 插件在 profile 里的部署位置：目录名 = npm 包名。
    从 package.json 读，别写死 —— 包名改过一次又回退过，写死就会指向不存在的目录。 */
const PKG_NAME = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).name;
export const PACKAGE_NAME = PKG_NAME;
export const DEPLOYED_DIR = join(DSH_HOME, "profiles", "node_modules", PKG_NAME);

/**
 * 解析官方 `@deepseek-ai` 包所在目录。
 *
 * 为什么不写死：桌面端由 npx 缓存启动，缓存目录名是随机哈希
 * （`_npx/<hash>/node_modules`），换台机器就变了；
 * 而且把哈希与本机用户名写进源码会泄露环境信息。
 */
export function resolveDshModules() {
	const cache = join(homedir(), "AppData", "Local", "npm-cache", "_npx");
	if (existsSync(cache)) {
		for (const entry of readdirSync(cache)) {
			const candidate = join(cache, entry, "node_modules", "@deepseek-ai");
			if (existsSync(candidate)) return candidate;
		}
	}
	const viaProfile = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai");
	if (existsSync(viaProfile)) return viaProfile;
	throw new Error("找不到 @deepseek-ai 包目录：npx 缓存与 profile 里都没有");
}

/** 读取诊断文件尾部若干 MB 并解析成记录数组（避免把大文件整体读进内存）。 */
export async function tailDiagnostics(megabytes = 6) {
	const { closeSync, openSync, readSync, statSync } = await import("node:fs");
	if (!existsSync(DIAG_FILE)) return [];
	const size = statSync(DIAG_FILE).size;
	const chunk = Math.min(size, megabytes * 1024 * 1024);
	const fd = openSync(DIAG_FILE, "r");
	const buf = Buffer.alloc(chunk);
	readSync(fd, buf, 0, chunk, size - chunk);
	closeSync(fd);
	const out = [];
	for (const line of buf.toString("utf8").split("\n")) {
		if (!line.trim().startsWith("{")) continue;
		try {
			out.push(JSON.parse(line));
		} catch {
			/* 截断的最后一行忽略 */
		}
	}
	return out;
}
