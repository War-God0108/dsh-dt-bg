import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";

/**
 * dsh-web-bg-2 —— Host 半端。
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
 * @module dsh-web-bg-2
 */

/** 稳定插件名（与 cordis.patch.yml 条目 id 对应）。 */
const name = "web-bg-2";

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

/** 从 profile 配置里读回**我们自己条目**的设置值。
 *
 * 为什么需要：这台机器上 `configForms` 的读永远返回出厂默认值，客户端因此
 * 既显示不出正确值、改完还会被旧值冲掉。诊断通道是确认可用的，所以宿主
 * 直接把配置里的真实值随诊断响应送给客户端，由它作为"当前设置"的权威来源。
 *
 * 按行解析（`image` 可能是几百 KB 的 data URL，不值得为它引入 YAML 依赖）。
 */
function readOwnSettings() {
	const file = configFile();
	if (file === null) return {};
	const out = {};
	try {
		const lines = readFileSync(file, "utf8").split("\n");
		let inside = false;
		let config = false;
		for (const line of lines) {
			const t = line.trim();
			if (t === `- id: ${name}`) {
				inside = true;
				config = false;
				continue;
			}
			if (!inside) continue;
			if (/^- /.test(line) && !t.startsWith("- id:")) break;
			if (t === "config:") {
				config = true;
				continue;
			}
			if (!config) continue;
			const m = /^([A-Za-z][\w-]*):\s*(.+)$/.exec(t);
			if (m === null) continue;
			const key = m[1];
			const value = m[2].replace(/^["']|["']$/g, "");
			if (key === "enabled") out[key] = value === "true";
			else if (["opacity", "dim", "blur", "translucency"].includes(key)) {
				const n = Number(value);
				if (Number.isFinite(n)) out[key] = n;
			} else out[key] = value;
		}
	} catch { /* 尽力而为 */ }
	return out;
}

/** 找到我们条目所在的 profile 配置文件。 */
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
		   只看 `- id:` 会误选"包内自带的 bundle 补丁"（只有 insert 声明，没有 config 块）。 */
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
 * 为什么需要它：真机上 `configForms` 的**写入不落盘** —— 设置面板里点控件毫无反应
 * （读方向正常、渲染也正常，只有写坏）。诊断通道确认可用，所以客户端把改动发过来，
 * 宿主直接改文件。这是"设置能用"的唯一可靠途径。
 *
 * 实现刻意保持最小改动面：
 *   - 只在 `- id: <name>` 段落的 `config:` 块内替换/追加字段；
 *   - 已有键 → 替换该行；没有 → 追加到该块最后一个字段之后；
 *   - 块的结束**按缩进判断**（不能用「行首 - 加空格」：`image:` 那行历史上缺过缩进，
 *     会被误判成新条目、导致扫描提前中断）；
 *   - 不动文件其它任何内容（不做 YAML 重新序列化）。
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
		let configAt = -1;
		let inside = false;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === `- id: ${name}`) {
				inside = true;
				continue;
			}
			if (!inside) continue;
			if (/^- /.test(lines[i])) break;
			if (lines[i].trim() === "config:") {
				configAt = i;
				break;
			}
		}
		if (configAt < 0) return { ok: false, reason: "配置里没有我们的条目或 config 块" };

		const configIndent = lines[configAt].length - lines[configAt].trimStart().length;
		const indent = " ".repeat(configIndent + 2);
		let end = lines.length;
		for (let i = configAt + 1; i < lines.length; i++) {
			const raw = lines[i];
			if (raw.trim() === "") continue;
			if (raw.length - raw.trimStart().length <= configIndent) {
				end = i;
				break;
			}
		}
		let lastField = configAt;
		for (let i = configAt + 1; i < end; i++) {
			if (/^\s*[A-Za-z][\w-]*:/.test(lines[i])) lastField = i;
		}

		/* 含 YAML 特殊字符的字符串必须加引号，否则 `#abcdef` 会被当注释解析成 null。 */
		const format = (v) => {
			if (typeof v === "boolean" || typeof v === "number") return String(v);
			const s = String(v);
			return /^[\s]|[\s]$|[#:{}[\]&*!|>'"%@`,]/.test(s) ? JSON.stringify(s) : s;
		};

		let changed = 0;
		const pending = new Set(keys);
		for (let i = configAt + 1; i < end; i++) {
			const m = /^(\s*)([A-Za-z][\w-]*):(.*)$/.exec(lines[i]);
			if (m === null || !pending.has(m[2])) continue;
			lines[i] = `${indent}${m[2]}: ${format(patch[m[2]])}`;
			pending.delete(m[2]);
			changed++;
		}
		if (pending.size > 0) {
			const extra = [...pending].map((k) => `${indent}${k}: ${format(patch[k])}`);
			lines.splice(lastField + 1, 0, ...extra);
			changed += extra.length;
		}
		if (changed > 0) writeFileSync(file, lines.join("\n"), "utf8");
		return { ok: true, file, changed };
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
					/* ---------- 写设置入口 ----------
					   `configForms` 的写入在这台机器上不落盘（面板点了没反应），
					   而本诊断通道确认可用，所以客户端把改动发到这里，宿主直写配置文件。
					   请求体形如 `{ patch: { translucency: 0.6 } }`。 */
					if (body !== null && typeof body === "object" && body.patch !== void 0 && body.report === void 0) {
						const result = writeOwnSettings(body.patch);
						return Response.json({ ok: result.ok === true, value: result });
					}
					const record = {
						at: new Date().toISOString(),
						plugin: "dsh-web-bg-2",
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
					/* 把配置里的**真实设置**送回客户端（`configForms` 读不到，只能由宿主给）。
					   客户端用它作为"当前设置"的权威来源：既让面板显示正确，
					   也避免刚改完又被旧值冲掉。
					   没有自己的条目时退回 v1 的壁纸迁移（只补 image）。 */
					const own = readOwnSettings();
					const legacy = readLegacyImage();
					const seed = {};
					for (const k of ["enabled", "kind", "color", "opacity", "dim", "blur", "translucency", "scope"]) {
						if (own[k] !== void 0) seed[k] = own[k];
					}
					if (typeof own.image === "string" && own.image !== "") seed.image = own.image;
					else if (legacy.image !== "") seed.image = legacy.image;
					record.seed = {
						keys: Object.keys(seed),
						imageChars: typeof seed.image === "string" ? seed.image.length : 0,
						source: configFile() ?? legacy.source ?? "(未读到)"
					};
					return Response.json({
						ok: true,
						value: { files: written, seed: Object.keys(seed).length === 0 ? null : seed }
					});
				} catch (error) {
					return Response.json({
						ok: false,
						error: { code: "diag-failed", message: String(error?.message ?? error), details: {} }
					});
				}
			}
		}), "dsh-web-bg-2: diagnostics channel");
	});
}

export { Config, DIAG_FILE, DIAG_PATH, apply, name, readLegacyImage, writeOwnSettings };







