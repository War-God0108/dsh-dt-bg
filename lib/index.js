import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
 * 直接读 profile 的 `cordis.patch.yml`，取回**我们自己的**设置。
 *
 * 为什么要绕过设置通道：真机上出现过"配置文件里字段齐全、schema 也通过，
 * 但客户端 `configForms` 读到的一直是出厂默认值"（配置行没绑到实例）。
 * 诊断通道是确认可用的，所以这里把设置随诊断响应一起送回去，
 * 客户端在发现自己的设置为空时采纳 —— 比让用户重选一次图靠谱。
 *
 * 只解析 `- id: <name>` 这一段的 `key: value`；`image` 可能是几百 KB 的 data URL，
 * 按行取值即可（不做 YAML 解析，避免为一张图引入依赖）。
 *
 * @returns 设置对象（只含读到的键）；读不到时为空对象。
 */
function readOwnSettings() {
	const out = {};
	try {
		const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
		const candidates = [join(process.cwd(), "cordis.patch.yml"), join(home, "profiles", "desktop", "cordis.patch.yml")];
		for (const file of candidates) {
			if (!existsSync(file)) continue;
			const lines = readFileSync(file, "utf8").split("\n");
			let inside = false;
			let seenConfig = false;
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed === `- id: ${name}`) {
					inside = true;
					seenConfig = false;
					continue;
				}
				if (!inside) continue;
				/* 顶层新条目（无缩进且以 "- " 开头）→ 本段结束 */
				if (/^- /.test(line) && !trimmed.startsWith("- id:")) break;
				if (trimmed === "config:") {
					seenConfig = true;
					continue;
				}
				if (!seenConfig) continue;
				const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(trimmed);
				if (m === null) continue;
				const key = m[1];
				let value = m[2].replace(/^["']|["']$/g, "");
				if (value === "") continue;
				if (key === "enabled") out[key] = value === "true";
				else if (["opacity", "dim", "blur", "translucency"].includes(key)) {
					const n = Number(value);
					if (Number.isFinite(n)) out[key] = n;
				} else out[key] = value;
			}
			if (Object.keys(out).length > 0) {
				out.__source = file;
				return out;
			}
		}
	} catch { /* 尽力而为 */ }
	return out;
}

/** 找到我们条目所在的配置文件路径（与 readOwnSettings 同一套候选）。 */
function configFile() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const profile = process.env.DSH_PROFILE ?? "desktop";
	const candidates = [
		join(process.cwd(), "cordis.patch.yml"),
		join(home, "profiles", profile, "cordis.patch.yml"),
		join(home, "profiles", "desktop", "cordis.patch.yml"),
		join(home, "profiles", "web", "cordis.patch.yml")
	];
	for (const file of candidates) {
		if (!existsSync(file)) continue;
		/* 判据要**同时**满足：含我们的条目、且该条目下有 `config:` 块。
		   只看 `- id: <name>` 会误选"包内自带的 bundle 补丁"（那里面只有
		   `- insert:` 挂载声明，没有 config 块），写进去等于什么都没写。 */
		try {
			const text = readFileSync(file, "utf8");
			if (text.includes(`- id: ${name}`) && /^\s*config:\s*$/m.test(text)) return file;
		} catch { /* 读不了就跳过 */ }
	}
	return null;
}

/**
 * 把一份设置写回 profile 配置里**我们自己条目**的 config 块。
 *
 * 为什么需要它：真机上 `configForms` 的写入不落盘（设置面板点了没反应）。
 * 诊断通道可用，所以客户端把改动发过来，宿主直接改文件。
 *
 * 实现刻意保持"最小改动面"：
 *   - 只在 `- id: <name>` 段落的 `config:` 块内替换/追加字段；
 *   - 已有键 → 替换该行；没有 → 追加到该块末尾；
 *   - 不动文件其它任何内容（不做 YAML 重新序列化，避免整份重写带来的风险）。
 *
 * @param patch - 要写入的键值对。
 * @returns `{ ok, file, changed }`。
 */
function writeOwnSettings(patch) {
	const file = configFile();
	if (file === null) return { ok: false, reason: "找不到 profile 配置文件" };
	const keys = Object.keys(patch ?? {});
	if (keys.length === 0) return { ok: false, reason: "patch 为空" };

	try {
		const lines = readFileSync(file, "utf8").split("\n");
		/* 定位我们条目里 `config:` 那一行 */
		let start = -1;
		let configAt = -1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === `- id: ${name}`) {
				start = i;
				continue;
			}
			if (start < 0) continue;
			if (i > start && /^- /.test(lines[i])) break; /* 新条目开始 */
			if (lines[i].trim() === "config:") {
				configAt = i;
				break;
			}
		}
		if (start < 0 || configAt < 0) return { ok: false, reason: "配置里没有我们的条目或 config 块" };

		const configIndent = lines[configAt].length - lines[configAt].trimStart().length;
		const indent = " ".repeat(configIndent + 2);
		/* 块的结束用**缩进**判断：遇到非空行且缩进 <= config 的缩进就结束。
		   不能用 `^- ` —— `image:` 那行历史上缺过缩进（顶格），会被误判成新条目，
		   导致块扫描提前中断（这就是"写不进去"的直接原因）。 */
		let end = lines.length;
		for (let i = configAt + 1; i < lines.length; i++) {
			const raw = lines[i];
			if (raw.trim() === "") continue; /* 空行跳过，不算结束 */
			const ind = raw.length - raw.trimStart().length;
			if (ind <= configIndent) {
				end = i;
				break;
			}
		}
		/* 追加位置：块内**最后一个字段**之后。
		   不能用 end —— 块的末尾可能紧跟注释行，插在注释前会把注释挤到插入行下面，
		   看着像是注释换了归属。 */
		let lastField = configAt;
		for (let i = configAt + 1; i < end; i++) {
			if (/^\s*[A-Za-z][\w-]*:/.test(lines[i])) lastField = i;
		}

		/* 值的序列化：含 YAML 特殊字符（`#`、`:`、引号、前后空格）的字符串必须加引号，
		   否则 `#abcdef` 会被解析成 null（`#` 后面当注释）。 */
		const format = (value) => {
			if (typeof value === "boolean" || typeof value === "number") return String(value);
			const s = String(value);
			return /^[\s]|[\s]$|[#:{}[\]&*!|>'"%@`,]/.test(s) ? JSON.stringify(s) : s;
		};

		let changed = 0;
		const pending = new Set(keys);
		for (let i = configAt + 1; i < end; i++) {
			const m = /^(\s*)([A-Za-z][\w-]*):(.*)$/.exec(lines[i]);
			if (m === null) continue;
			const key = m[2];
			if (!pending.has(key)) continue;
			lines[i] = `${indent}${key}: ${format(patch[key])}`;
			pending.delete(key);
			changed++;
		}
		if (pending.size > 0) {
			const extra = [...pending].map((k) => `${indent}${k}: ${format(patch[k])}`);
			lines.splice(lastField + 1, 0, ...extra);
			changed += extra.length;
		}
		if (changed > 0) writeFileSync(file, lines.join("\n"), "utf8");
		return { ok: true, file, changed, restartedNeeded: changed > 0 };
	} catch (error) {
		return { ok: false, reason: String(error?.message ?? error) };
	}
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
					/* ---------- 写设置通道（绕过 configForms） ----------
					   真机上出现过"设置面板点了没反应"：`configForms` 既不返回配置、
					   `host.set()` 也不落盘（配置行没绑到实例）。
					   而诊断通道确认可用，所以这里顺带提供一个写入入口：
					   客户端把 `{ patch: {...} }` 发过来，宿主直接改写 profile 配置里
					   我们自己条目的字段。纯文本行替换，不用 YAML 库，避免改动别处。 */
					if (body !== null && typeof body === "object" && body.patch !== void 0 && body.report === void 0) {
						const result = writeOwnSettings(body.patch);
						return Response.json({ ok: result.ok, value: result });
					}
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
						/* 版本标记：用来判定"实际运行的到底是哪一份代码"。
						   排查时吃过亏 —— 改了代码、部署了、也重启了，但行为像旧代码，
						   只能靠猜。有这个字段就能一次定性。 */
						build: "2026-10-03T23:45-seed-order",
						report: body?.report ?? body
					};

					/* ---------- 先把 seed 算好，再落盘 ----------
					   曾经把 `record.seed = …` 写在写盘**之后**，于是磁盘上的记录永远
					   没有 seed 字段 —— 而我正是靠这个文件判断状态的，白白绕了好几轮。
					   顺序：先补齐 record 的所有字段，再序列化、再写文件。 */
					const own = readOwnSettings();
					const legacy = readLegacyImage();
					const seed = {};
					const KEYS = ["enabled", "kind", "color", "opacity", "dim", "blur", "translucency", "scope"];
					for (const k of KEYS) if (own[k] !== void 0) seed[k] = own[k];
					if (typeof own.image === "string" && own.image !== "") seed.image = own.image;
					else if (legacy.image !== "") seed.image = legacy.image;
					record.seed = {
						keys: Object.keys(seed),
						imageChars: typeof seed.image === "string" ? seed.image.length : 0,
						source: own.__source ?? legacy.source ?? "(未读到)"
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
					return Response.json({
						ok: true,
						value: {
							files: written,
							seed: Object.keys(seed).length === 0 ? null : seed
						}
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

export { Config, DIAG_FILE, DIAG_PATH, apply, name, readLegacyImage, readOwnSettings, writeOwnSettings };







