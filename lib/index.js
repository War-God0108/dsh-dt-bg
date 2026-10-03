import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";

/**
 * dsh-dt-bg —— Host 半端。
 *
 * 与 v1（dsh-web-bg 1.x）的分工差异：
 * - v1 用「布局根内部挂负 z-index 层 + DOM 中和」实现背景，侧边栏/标题栏永远出不来；
 * - v2 只声明设置字段并提供一个诊断落盘通道，视觉实现全部在客户端半端，
 *   用**设计令牌的 alpha**表达透明（`--dsw-alias-bg-base` 等由官方主题唯一提供）。
 *
 * 设置值是本 entry（cordis.patch.yml 里的 `web-bg-2` 条目）的 volatile 配置，
 * dsh-settings 自动投影成可编辑表单并持久化到 profile，重启不丢。
 * 「设置 → 通用」页的背景行由客户端半端注册，因此关闭自动表单页（与官方 ui-theme 一致）。
 *
 * @module dsh-dt-bg
 */

/** 稳定插件名（与 cordis.patch.yml 条目 id 对应）。 */
/**
 * 插件对外声明的名字。
 *
 * **不要跟着 npm 包名改**：这个名字同时是「配置命名空间」——
 * 客户端半端的 `NAMESPACE`、profile 配置里 `- id: web-bg-2` 那一行、
 * 以及用户已保存的设置条目，全都以它为键。
 *
 * 踩过的坑（2026-10-03）：包改名为 `dsh-dt-bg` 时，我把挂载补丁里的
 * `name:` 也改成了新包名，结果 DSH 认为"没有实例与该配置行对应"，
 * 配置不再下发给插件 → 插件读到出厂默认值（壁纸变内置兜底图、
 * 通透回到 100%），用户表现为"插件不能用了"。
 */
const name = "dsh-dt-bg";

/** 诊断通道路径：客户端半端把真实 DOM 结构 POST 到这里，宿主写盘。 */
const DIAG_PATH = "/api/wbg2/diag";

/** 诊断落盘文件名。 */
const DIAG_FILE = ".dsh-web-bg2-diagnostics.jsonl";

/**
 * 诊断落盘位置：会话工作目录 + `$DSH_HOME` 下的固定位置。
 * 固定位置让校验脚本不依赖"当前会话在哪个工作区"，重装或换目录也能找到。
 * @returns 绝对路径数组（去重）。
 */
function diagFiles() {
	const cwd = process.cwd();
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const files = [join(cwd, DIAG_FILE), join(home, DIAG_FILE)];
	return [...new Set(files)];
}

/**
 * 背景设置字段。
 *
 * 注意 `opacity` 的语义与 v1 不同：v1 是"壁纸层与主题底板混合的比例"（所以永远发灰），
 * v2 是"壁纸自身的透明度"（1 = 原图，不动它）。
 */
const Config = z.object({
	/** 总开关。 */
	enabled: z.boolean().default(true).volatile(),
	/** 壁纸类型：image | color。 */
	kind: z.union([z.const("image"), z.const("color")]).default("image").volatile(),
	/** 图片 URL 或 data: URL（本地文件上传后以 data URL 持久化）。 */
	image: z.string().default("").volatile(),
	/** 纯色壁纸色值。 */
	color: z.string().default("#1e293b").volatile(),
	/** 壁纸自身透明度 0..1（1 = 原图；不再与底色混合）。 */
	opacity: z.number().min(0).max(1).default(1).volatile(),
	/** 壁纸压暗 0..1：深色主题叠黑，浅色主题少量冷灰，保证正文对比度。 */
	dim: z.number().min(0).max(1).default(0.25).volatile(),
	/** 壁纸模糊 0..48px。 */
	blur: z.number().min(0).max(48).default(0).volatile(),
	/** 面板通透强度 0..1（0 = 面板保持主题原样，1 = 通透到底）。 */
	translucency: z.number().min(0).max(1).default(1).volatile(),
	/** 透出范围：all（全窗口，含侧边栏/标题栏）| content（仅内容区与 composer）| off（不透出）。 */
	scope: z.union([z.const("all"), z.const("content"), z.const("off")]).default("all").volatile(),

});

/** v1（dsh-web-bg）的设置命名空间：用于把用户已经选好的壁纸迁移过来。 */
const LEGACY_NAMESPACE = "web-bg";

/**
 * 从 profile 的 `cordis.patch.yml` 里读 v1 的 `web-bg` 配置。
 *
 * 为什么要做这个：v1 停用后它的**配置条目还在**，用户那张壁纸（data URL）
 * 就存在里面。让用户为了 v2 重新选一次图没有道理，所以首次运行时把它种子化过来。
 * 只读一个 YAML 文件、按行解析 `- id: web-bg` 段落里的 `image`，失败就返回空。
 * @returns `{ image }`，读不到或没有图片时 image 为空串。
 */
function readLegacyImage() {
	try {
		const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
		/* 宿主的工作目录就是当前 profile 目录（真机实测 cwd = <DSH_HOME>/profiles/desktop） */
		const candidates = [join(process.cwd(), "cordis.patch.yml"), join(home, "profiles", "desktop", "cordis.patch.yml")];
		for (const file of candidates) {
			if (!existsSync(file)) continue;
			const lines = readFileSync(file, "utf8").split("\n");
			let inEntry = false;
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed === `- id: ${LEGACY_NAMESPACE}`) {
					inEntry = true;
					continue;
				}
				if (inEntry && trimmed.startsWith("- ") && !trimmed.startsWith("- id:")) break; /* 下一个条目 */
				if (inEntry && /^image:\s*/.test(trimmed)) {
					const value = trimmed.replace(/^image:\s*/, "").trim().replace(/^["']|["']$/g, "");
					if (value.startsWith("data:image/") || /^https?:/.test(value)) {
						return { image: value, source: file };
					}
				}
			}
		}
	} catch { /* 迁移是尽力而为，失败不影响插件 */ }
	return { image: "", source: "" };
}

/**
 * Host 侧注册。
 * @param ctx - Host 插件上下文。
 */
function apply(ctx) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
	/* 诊断通道：只在 Host 提供 connection 时挂上；失败不影响视觉功能。
	   同一个通道顺带返回"首次运行种子"（v1 已选好的壁纸），客户端半端只会补空字段。 */
	ctx.inject(["connection"], (child) => {
		child.effect(() => child.connection.fetch.register({
			path: DIAG_PATH,
			methods: ["POST"],
			requestBody: "buffered",
			fetch: async (request) => {
				try {
					const body = await request.json();
					const record = {
						at: new Date().toISOString(),
						plugin: "dsh-dt-bg",
						host: {
							cwd: process.cwd(),
							platform: process.platform,
							node: process.version,
							env: {
								profile: process.env.DSH_PROFILE ?? null,
								profileDir: process.env.DSH_PROFILE_DIR ?? null,
								home: process.env.DSH_HOME ?? null
							}
						},
						report: body?.report ?? body
					};
					const line = `${JSON.stringify(record)}\n`;
					const written = [];
					for (const file of diagFiles()) {
						try {
							await appendFile(file, line, "utf8");
							written.push(file);
						} catch { /* 某一路径不可写不影响另一路 */ }
					}
					if (written.length === 0) throw new Error("诊断文件写入失败（所有候选路径都不可写）");
					/* 自渲染快照：客户端会把开关区域序列化成 SVG 送过来。
					   存成文件，人可以直接打开看浏览器自己渲染的形状 ——
					   用来绕开"窗口截图 + 坐标换算"那套不可靠的测量方式。 */
					const svg = typeof body?.report?.switchSvg?.svg === "string" ? body.report.switchSvg.svg : null;
					if (svg !== null && svg.length < 200000 && svg.startsWith("<svg")) {
						try {
							const dir = join(homedir(), ".dsh", "wbg2-shots");
							await mkdir(dir, { recursive: true });
							await writeFile(join(dir, "switch-latest.svg"), svg, "utf8");
							/* 同时去重留档，便于对比不同版本 */
							const stampName = `switch-${Date.now()}.svg`;
							await writeFile(join(dir, stampName), svg, "utf8");
						} catch { /* 快照写失败不影响诊断 */ }
					}
					/* 首次运行种子：把 v1 里已经选好的壁纸交回客户端。
					   record 里同时记一份，便于排查"迁移是否发生"。 */
					const legacy = readLegacyImage();
					record.seed = legacy.image === "" ? { image: "" } : { image: `data URL ${legacy.image.length} 字符`, source: legacy.source };
					return Response.json({
						ok: true,
						value: { files: written, seed: legacy.image === "" ? null : { image: legacy.image } }
					});
				} catch (error) {
					return Response.json({
						ok: false,
						error: { code: "diag-failed", message: String(error?.message ?? error), details: {} }
					});
				}
			}
		}), "dsh-dt-bg: diagnostics channel");
	});
}

export { Config, DIAG_FILE, DIAG_PATH, apply, name, readLegacyImage };






