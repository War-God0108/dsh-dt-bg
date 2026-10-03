/**
 * dsh-web-bg-2 —— 浏览器半端。
 *
 * 与 v1 的根本差异（针对官方桌面端 0.2.0-rc.2）：
 *
 * 1. **壁纸是窗口级的**：一个 position:fixed 的层放在所有面板之下（而不是塞进布局根内部），
 *    因此侧边栏、标题栏、composer 都能透出它。v1 把层挂在布局根内、再用负 z-index 躲，
 *    结构上就决定了它出不了内容区。
 * 2. **透明由令牌的 alpha 表达**：面板保留主题本色，只把 alpha 让出来。
 *    v1 是把不透明背景"中和"成 transparent（铺不满视口的侧边栏根本中和不到）。
 * 3. **面板靠几何识别，不写死 class 名**：官方 class 是构建期哈希，任何版本升级都会变；
 *    这里只依据「铺满视口 → 背景层」「排除自身后是命中点最上层 → 面板」这类可验证事实。
 * 4. **标题栏**：Windows 上 40px 遮罩由 Electron titleBarOverlay 绘制，页面改不动它；
 *    框架页会读页面探测元素的计算底色再经 IPC 同步给主进程，所以这里只在页面顶部
 *    留出同色带，让接缝在颜色上消失（不做假色块）。
 *
 * 诊断：首次挂载后把真实 DOM 结构 POST 给 Host 半端落盘，便于按真机结构校准。
 */

window.__ModuleLoader__.load({
	id: "dsh-web-bg-2",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		/* ============================ 常量与默认值 ============================ */

		const STYLE_ID = "dsh-web-bg-2/main";
		const NAMESPACE = "web-bg-2";
		const LAYER_ID = "dsh-web-bg-2-layer";
		const VEIL_ID = "dsh-web-bg-2-veil";
		const MARK = "wbg2";
		const DIAG_PATH = "/api/wbg2/diag";

		/** 内置默认壁纸（深蓝靛 → 青绿渐变，与 v1 保持一致，便于对比）。 */
		const DEFAULT_IMAGE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#1b2a5a'/><stop offset='0.55' stop-color='#284b6b'/><stop offset='1' stop-color='#0e7c66'/></linearGradient><radialGradient id='h' cx='0.82' cy='0.12' r='0.85'><stop offset='0' stop-color='rgba(255,255,255,0.16)'/><stop offset='1' stop-color='rgba(255,255,255,0)'/></radialGradient></defs><rect width='1600' height='900' fill='url(#g)'/><rect width='1600' height='900' fill='url(#h)'/></svg>";
		const DEFAULT_IMAGE = "data:image/svg+xml," + encodeURIComponent(DEFAULT_IMAGE_SVG);

		/** 与 Host schema 完全一致（字段名、默认值、范围）。 */
		/* `noCornerFill`：内部调试开关，用于 A/B 对照"角上填充滤镜是否影响官方 fixed 元素定位"。
	   它不暴露在设置界面，仅在排查时写入配置。 */
	const DEFAULTS = {
		noCornerFill: true,
		/* 内部调试开关：分别停用"底部渐变中和"与"面板淡色叠加"两条规则，
		   用于定位"悬停动画在透出模式下消失"的原因。同样不暴露在设置界面。 */
		noFadeNeutralize: false,
		noTint: false,
		/* 内部调试开关：停用"面板内所有后代底色透明"这条无差别中和规则。
		   嫌疑：悬停气泡若用 background-color 绘制，会被它一并清掉。 */
		noBlanket: false,
		/* 内部调试开关：停用"面板自身底色"与"surface 上色"两条规则。 */
		noPanelBg: false,
		/* 内部调试开关：停用插件自己给官方行/按钮画的"行内悬停反馈"。
		   嫌疑：它用行内 `!important` 写 background-color，会压过官方那段
		   "跟随鼠标位置"的悬停动画（ROW_SELECTOR 里含 [class*=newSession]）。 */
		noRowHover: false,
			enabled: true,
			kind: "image",
			image: "",
			color: "#1e293b",
			opacity: 1,
			dim: 0.22,
			blur: 0,
			translucency: 1,
			scope: "all"
		};

		/** 面板分组 → 默认 alpha（与 lib/panel-transparency.js 保持同步）。 */
		const PANEL_ALPHA = {
			sidebar: { dark: 0.4, light: 0.5 },
			content: { dark: 0.42, light: 0.5 },
			composer: { dark: 0.55, light: 0.6 },
			chrome: { dark: 0.3, light: 0.4 }
		};
		/**
		 * 透出范围 → 各分组的"透明化系数"。
		 *   1 = 按 PANEL_ALPHA 正常透出（壁纸明显）
		 *   0 = 不透出（该分组拿不透明的主题底色）
		 * 中间值 = 只透出一部分（`content` 档里侧边栏用 0.45：看得到壁纸但不刺眼，
		 * 与 `all` 档的满强度、`off` 档的实底都能区分开）。 */
		const PANEL_SHAPES = {
			all: { sidebar: 1, content: 1, composer: 1, chrome: 1 },
			/* content 档：只有内容区与 composer 参与透明化；侧边栏与顶栏置 0，
			   按用户明确要求写 `transparent`（完全透出壁纸）——这是他最初报的行为，
			   我曾按"语义应更严谨"改成不透明实底，用户不接受并要求回退，故锁定为 0。
			   注意 `off` 档的 0 走的是另一条分支（写不透明主题底色），见 applyVisual。 */
			content: { sidebar: 0, content: 1, composer: 1, chrome: 0 },
			off: { sidebar: 0, content: 0, composer: 0, chrome: 0 }
		};
		const MIN_PANEL_FLOOR = 0.85;
		const MAX_FILE_BYTES = 4 * 1024 * 1024;

		/* ============================== 颜色工具 ============================== */

		/** 解析 CSS 颜色为 [r,g,b]；必须支持 #fff 三位简写（官方浅色底色就是它）。 */
		function parseColor(value) {
			const text = String(value ?? "").trim();
			if (text === "") return null;
			const fn = /^rgba?\(([^)]+)\)$/i.exec(text);
			if (fn !== null) {
				const parts = fn[1].split(/[\s,/]+/).filter((p) => p !== "").map(Number);
				if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
					return parts.slice(0, 3).map((n) => Math.max(0, Math.min(255, Math.round(n))));
				}
			}
			const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
			if (hex !== null) {
				let h = hex[1];
				if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
				if (h.length !== 6 && h.length !== 8) return null;
				const n = Number.parseInt(h.slice(0, 6), 16);
				return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
			}
			return null;
		}

		function withAlpha(color, alpha) {
			const rgb = parseColor(color);
			if (rgb === null) return String(color);
			const a = Math.max(0, Math.min(1, Number(alpha)));
			return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(a.toFixed(3))})`;
		}

		/**
		 * 把 `top` 以 alpha 叠在 `bottom` 之上，返回**不透明**的结果色。
		 * 用于算出"面板色叠在主题底色上"的最终实色——顶栏需要它，因为顶栏下面
		 * 还压着外壳的窗口遮罩，半透明色会被再压暗一档。
		 * @param top - 上层颜色（可含 alpha，但这里只取 RGB）。
		 * @param bottom - 下层颜色。
		 * @param alpha - 上层不透明度 0..1。
		 * @returns `rgb(r, g, b)`。
		 */
		function mixOver(top, bottom, alpha) {
			const a = Math.max(0, Math.min(1, Number(alpha)));
			const t = parseColor(top);
			const b = parseColor(bottom);
			if (t === null || b === null) return String(bottom);
			const mix = [0, 1, 2].map((i) => Math.round(t[i] * a + b[i] * (1 - a)));
			return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
		}

		function merged(section) {
			const value = section ?? {};
			const out = {};
			for (const key of Object.keys(DEFAULTS)) out[key] = value[key] === void 0 ? DEFAULTS[key] : value[key];
			return out;
		}

		const isDark = () => document.body.hasAttribute("data-ds-dark-theme");

		/* ======================== 面板几何识别与标记 ========================
		 * 官方样式是不可读的构建期哈希（例：_panel_1a2b3），任何版本都可能变。
		 * 这里只依赖两条可验证事实：
		 *   ① 铺满视口、且不是靠定位悬浮的层，一定是"画背景的层"，不是面板；
		 *   ② 一个候选面板元素，如果它的几何中心处 elementFromPoint 命中它自己或它的
		 *      后代，说明它确实在"前面"，值得透明化；否则它被别的东西盖住了，跳过。
		 * 标记写在 data-wbg2 上，MutationObserver 保证 React 重渲染后重新贴上。
		 * ================================================================== */

		/**
		 * 面板几何识别与标记。
		 *
		 * 官方样式是不可读的构建期哈希（例：`_panel_1a2b3`），任何版本都可能变，
		 * 所以这里不写死任何 class 名，只依赖可验证事实：
		 *   ① 铺满视口且不悬浮 → 那是"画整页底色的层"，应当让位给壁纸（skip）；
		 *   ② 铺满视口且悬浮/高 z-index → 弹层遮罩，绝不能透明化（overlay）；
		 *   ③ 又宽又矮 → 条（标题栏行）；窄而高 → 侧边栏列；其余 → 普通面板。
		 * 标记写在 data-wbg2 上，MutationObserver 保证 React 重渲染后重新贴上；
		 * 样式表只按标记生效，标记没了规则自然失效，不会残留脏样式。
		 */
		function classifyFrameChildren() {
			const frame = findFrame();
			if (frame === void 0) return { frame: null, marked: [] };
			const vw = window.innerWidth || 1;
			const vh = window.innerHeight || 1;
			const marked = [];
			/* 先清掉上一轮的标记，且要用**上一轮的布局根**来清：
			   布局可能整体被换掉（frame 本身变化），只按新 frame 清会留下孤儿标记。 */
			for (const holder of new Set([lastFrame, frame])) {
				if (holder === null || holder === void 0) continue;
				for (const stale of [...holder.querySelectorAll(`[data-${MARK}]`)]) delete stale.dataset[MARK];
			}
			lastFrame = frame;
			for (const el of [...frame.children]) {
				if (el.id === LAYER_ID || el.id === VEIL_ID) continue;
				const rect = el.getBoundingClientRect();
				if (rect.width < 2 || rect.height < 2) continue;
				const cs = window.getComputedStyle(el);
				const coversAll = rect.width >= vw * 0.92 && rect.height >= vh * 0.92;
				let kind;
				if (coversAll) {
					/* 铺满视口的层只有两种：弹层遮罩，或"画整页底色的层"。
					   判据：① 层中心点命中它自己（背后没有可见内容）→ 画底色；
					   ② 命中它的后代，但后代都长得像面板（又高又窄 / 大块）→ 也是画底色；
					   否则（后代里有小控件、像真正的模态内容）→ 遮罩。
					   例外（真机 bug）：**布局列**铺满视口是正常形态 —— 侧边栏一折叠，
					   内容列就变成整宽。它在正常文档流里，不是遮罩，必须按面板处理，
					   否则内容列拿不到标记、透明化失效，表现为"折叠侧边栏后内容区不再显示背景"。 */
					const cx = Math.round(Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2)));
					const cy = Math.round(Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2)));
					const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(cx, cy) : null;
					if (looksLikeLayoutColumn(el)) {
						kind = isOpaque(cs.backgroundColor) && (hit === el || onlyPanelLikeDescendants(el, vw, vh)) ? "canvas" : "panel";
					} else {
						kind = isOpaque(cs.backgroundColor) && (hit === el || onlyPanelLikeDescendants(el, vw, vh)) ? "canvas" : "overlay";
					}
				} else if (rect.width >= vw * 0.8 && rect.height <= vh * 0.25) kind = "bar";
				else if (rect.width >= 48 && rect.width <= vw * 0.5 && rect.height >= vh * 0.5) kind = "sidebar";
				else if (rect.width < 48 || rect.height < 48) kind = "divider";
				else kind = "panel";
				el.dataset[MARK] = kind;
				/* 官方只给"内容列"的**左上角**留了 16px 圆角（真机实测
				   `BynINW_centerCol` 的 radius 是 `16px 0px 0px`）。
				   那一个角在壁纸场景下会露出一块亮边（用户圈出来过），所以**只清零左上角**，
				   其余圆角一律保留 —— 早期是把所有圆角都清零，那会改掉整个设计语言。 */
				if (kind === "panel") {
					el.style.borderTopLeftRadius = "0px";
				}
				marked.push({ kind, path: pathOf(el), rect: [Math.round(rect.width), Math.round(rect.height)], bg: cs.backgroundColor });
				/* 面板内部往往还有一层"表面"在画底色（真机上侧边栏就是这样：列元素透明，
				   实底画在它内部的 surface 上）。所以要把面积够大、又不透明/带背景图的
				   后代也标记出来一起透明化，否则侧边栏依然是一块实底。 */
				if (kind === "panel" || kind === "sidebar" || kind === "bar") {
					for (const nested of markNestedSurfaces(el, el, rect, vw, vh, cs)) marked.push(nested);
				}
			}
			/* 布局根与它的祖先如果"铺满视口"，打 canvas 标记（保持原有语义不变）。
			   真机实测 `.BynINW_frame` 是不透明的 rgb(27,27,28) 铺满视口，壁纸会被它盖死；
			   透明度未知时一律标记——它们都是纯布局容器，被中和不会影响观感或交互。 */
			for (let node = frame; node !== null && node !== document.body; node = node.parentElement) {
				const rect = node.getBoundingClientRect();
				if (rect.width < vw * 0.92 || rect.height < vh * 0.92) continue;
				node.dataset[MARK] = "canvas";
				marked.push({ kind: "canvas", path: pathOf(node), rect: [Math.round(rect.width), Math.round(rect.height)], bg: window.getComputedStyle(node).backgroundColor });
			}
			return { frame, marked };
		}

		/**
		 * 标记面板内部的"表面"元素（真正在画底色的那些后代）。
		 *
		 * 真机实测：侧边栏列元素自己是透明的，实底画在它内部的 surface 上；
		 * 只透明化列元素的话，侧边栏看起来还是一块实底。
		 *
		 * 只认"面积够大"且"不透明或带背景图"的后代，遇到同样够大的不透明元素就
		 * 不再往下钻——它的内部属于内容，不该被洗背景（图标、按钮、选中态要保留）。
		 *
		 * @param root - 面板元素（用于算相对面积）。
		 * @param node - 当前节点。
		 * @param panelRect - 面板边界。
		 * @param vw - 视口宽。
		 * @param vh - 视口高。
		 * @param panelStyle - 面板自身的计算样式（面板自己透明时，子级表面要按内容组着色）。
		 * @returns 本次新标记的条目数组。
		 */
		function markNestedSurfaces(root, node, panelRect, vw, vh, panelStyle) {
			const out = [];
			for (const child of node.children) {
				if (child.id === LAYER_ID || child.id === VEIL_ID) continue;
				const rect = child.getBoundingClientRect();
				if (rect.width < 2 || rect.height < 2) continue;
				/* 相对面板面积：占面板 30% 以上才算"表面" */
				const areaRatio = (rect.width * rect.height) / Math.max(1, panelRect.width * panelRect.height);
				if (areaRatio < 0.3) continue;
				const cs = window.getComputedStyle(child);
				const painted = isOpaque(cs.backgroundColor) || (cs.backgroundImage !== "none" && cs.backgroundImage !== "");
				if (!painted) {
					/* 自己没画底色，继续往下找 */
					out.push(...markNestedSurfaces(root, child, panelRect, vw, vh, panelStyle));
					continue;
				}
				child.dataset[MARK] = "surface";
				out.push({ kind: "surface", path: pathOf(child), rect: [Math.round(rect.width), Math.round(rect.height)], bg: cs.backgroundColor });
				/* 不再深入：这层已经是不透明表面，里面属于内容 */
			}
			return out;
		}

		/**
		 * 一个元素是否"长得像面板"：大块（占视口 ≥30% 宽或 ≥50% 高）。
		 * 用来区分"画底色的层"（后代全是面板）与"模态遮罩"（后代是小控件组成的对话框）。
		 * @param el - 候选后代。
		 * @param vw - 视口宽。
		 * @param vh - 视口高。
		 */
		function looksLikePanel(el, vw, vh) {
			const rect = el.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return true; /* 不可见元素不参与判断 */
			return rect.width >= vw * 0.3 || rect.height >= vh * 0.5 || (rect.width <= vw * 0.5 && rect.height >= vh * 0.5);
		}

		/**
		 * 该元素是否"只是个布局列"（静态/相对定位、且不在叠加序里）。
		 *
		 * 为什么需要它：布局列铺满视口是**正常形态**，不是遮罩。真机上侧边栏一折叠，
		 * 内容列 `BynINW_centerCol` 就变成 1280px（=整宽）—— 于是命中 `coversAll`
		 * 分支，又因为它内部有小控件（`onlyPanelLikeDescendants` 为假）被判成 `overlay`，
		 * 结果是内容列拿不到 `panel` 标记、透明化规则匹配不到，**内容区不再显示背景**。
		 *
		 * 可靠区别：布局列在**正常文档流**里（`position: static/relative`，`z-index: auto`），
		 * 而模态遮罩一律是**浮动定位**（`fixed/absolute`，通常还带 z-index）。
		 * @returns 是布局列时为 true。
		 */
		function looksLikeLayoutColumn(el) {
			const cs = window.getComputedStyle(el);
			if (cs.position !== "static" && cs.position !== "relative") return false;
			const z = String(cs.zIndex ?? "auto");
			return z === "auto" || z === "0";
		}

		/**
		 * 该元素的后代是否都"长得像面板"（没有任何小控件）。
		 * 真机上的画布层内部只有 sidebarCol / centerCol / rightbarCol 这类列容器；
		 * 模态遮罩内部则是按钮、输入框等小元素。
		 * @returns 全部后代都像面板时为 true（空后代也算 true）。
		 */
		function onlyPanelLikeDescendants(el, vw, vh) {
			for (const child of el.children) {
				if (child.id === LAYER_ID || child.id === VEIL_ID) continue;
				if (!looksLikePanel(child, vw, vh)) return false;
				if (!onlyPanelLikeDescendants(child, vw, vh)) return false;
			}
			return true;
		}

		/** 短路径，供诊断与日志使用（只用 tag + 首个 class + id）；对残缺节点保持健壮。 */
		function pathOf(el) {
			const bits = [];
			let node = el;
			while (node !== null && node !== void 0 && node.nodeType === 1 && bits.length < 5) {
				const tag = typeof node.tagName === "string" && node.tagName !== "" ? node.tagName.toLowerCase() : "?";
				let s = tag;
				if (typeof node.id === "string" && node.id !== "") s += `#${node.id}`;
				else if (typeof node.className === "string" && node.className.trim() !== "") s += `.${node.className.trim().split(/\s+/)[0]}`;
				bits.unshift(s);
				node = node.parentElement;
			}
			return bits.join(" > ");
		}

		/** 找到应用布局根：铺满视口、且是应用内容的祖先。 */
		function findFrame() {
			const root = document.getElementById("root");
			if (root === null) return void 0;
			const vw = window.innerWidth || 0;
			const vh = window.innerHeight || 0;
			if (vw < 10 || vh < 10) return void 0;
			/* 评分而不是"第一个铺满的 div"：真机上 #root 下面既有布局根，
			   也有插件自己的全屏层、弹层容器等等，它们在 DOM 里可能排在布局根前面。
			   判据是"谁真正装着面板"——有 ≥2 个 ≥200px 的子级才是布局根。
			   注意：这里**不能**用自己的 data-wbg2 标记做排除——`rescan()` 里
			   applyVisual 会先打标记再调 findFrame，用标记排除会把布局根自己跳过。 */
			let best;
			let bestScore = -1;
			for (const el of root.querySelectorAll("div")) {
				if (el.id === LAYER_ID || el.id === VEIL_ID) continue;
				const rect = el.getBoundingClientRect();
				if (rect.width < vw * 0.9 || rect.height < vh * 0.9) continue;
				const score = panelChildCount(el) * 4 + (isOpaque(window.getComputedStyle(el).backgroundColor) ? 1 : 0);
				if (score > bestScore) {
					bestScore = score;
					best = el;
				}
				/* 两个以上大子级 = 已经能确定是布局根，不必再找 */
				if (score >= 8) break;
			}
			return best;
		}

		/**
		 * 数一个元素里有几个"面板级"子级（宽高都 ≥200px）。
		 * 插件自己的全屏层、弹层容器都是 0，布局根通常 ≥2。
		 * @param el - 候选布局根。
		 */
		function panelChildCount(el) {
			let count = 0;
			for (const child of el.children) {
				if (child.id === LAYER_ID || child.id === VEIL_ID) continue;
				const rect = child.getBoundingClientRect();
				if (rect.width >= 200 && rect.height >= 200) count++;
			}
			return count;
		}

		function isOpaque(bg) {
			if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") return false;
			const rgb = parseColor(bg);
			if (rgb === null) return true;
			const m = /rgba?\(([^)]+)\)/i.exec(bg);
			if (m === null) return true;
			const parts = m[1].split(/[\s,/]+/).filter((p) => p !== "");
			return parts.length < 4 || Number.parseFloat(parts[3]) >= 1;
		}

		/* ========================= 样式表（唯一权威） =========================
		 * 全部透明化规则集中在这一张表里：用 [data-wbg2=...] 限定作用范围，
		 * 即使 React 把标记删掉，规则也只是停止匹配，不会残留脏样式。
		 * ================================================================== */

		const CSS = [
			/* 画布让位：主题底色画在 html/body 上，壁纸在最底层，必须让开 */
			`html[data-${MARK}-canvas] body,html[data-${MARK}-canvas]{background-color:transparent!important}`,
			/* 布局链上的"画布元素"让位。
			   真机实测（0.2.0-rc.2 官方桌面端）：布局根 `.BynINW_frame` 自己不透明
			   （深色主题 rgb(27,27,28)）且铺满视口——壁纸挂在它下面会被整块盖死。
			   classifyFrameChildren 会把这些"铺满且不透明"的祖先打成 canvas 标记。 */
			`html[data-${MARK}-canvas] [data-${MARK}=canvas]{background-color:transparent!important}`,
			/* 画布元素的**伪元素**必须一起中和。
			   真机实锤（occluders 探针在 (640,450)/(900,600)/(200,450)/(640,120) 四个点全都命中）：
			   `BynINW_frame` 自身的 background-color 已经是 transparent，
			   但它有一个 `::before` 伪元素在画不透明的 `rgb(27,27,28)` 且铺满窗口，
			   壁纸层被它整块盖死 —— 表现就是"背景完全不显示"。
			   伪元素不是元素，`[data-wbg2=canvas]` 这类选择器永远匹配不到它，
			   必须显式写 `::before` / `::after`。
			   注意不要清 content：有些图标/分隔线是靠伪元素 content 画的。 */
			`html[data-${MARK}-canvas] [data-${MARK}=canvas]::before,html[data-${MARK}-canvas] [data-${MARK}=canvas]::after{background-color:transparent!important;background-image:none!important}`,
			/* 壁纸层与压暗层 */
			`#${LAYER_ID}{position:fixed;inset:0;z-index:-2;pointer-events:none;background-position:center;background-repeat:no-repeat;background-size:cover}`,
			`#${VEIL_ID}{position:fixed;inset:0;z-index:-1;pointer-events:none}`,
																		/* 面板透明化：逐组消费客户端算好的 --dsh-bg-* 变量。
			   只改"面板自身"的底色，不再对面板内部所有带 class 的元素洗背景——
			   那会误伤卡片/按钮/选中态，且维护成本高。 */
			`html[data-${MARK}-panels] [data-${MARK}=panel]{--dsh-bg-surface:var(--dsh-bg-content)}`,
			`html[data-${MARK}-panels] [data-${MARK}=sidebar]{--dsh-bg-surface:var(--dsh-bg-sidebar)}`,
			`html[data-${MARK}-panels] [data-${MARK}=bar]{--dsh-bg-surface:var(--dsh-bg-chrome)}`,
			/* 面板内部的"表面"规则统一放在下面（只保留一条，避免两条规则互相覆盖） */
			/* 面板内部的底色：只处理"直接子级"，并且只让开一半。
			   为什么这么绕（都是真机实测逼出来的）：
			   - 一刀切成透明 → 壁纸出来了，但面板 alpha 也叠不起来，正文压在照片上、读不清；
			   - 让所有后代继承同一个半透明色 → alpha 层层叠加，内容区又变回实底、看不出壁纸。
			   折中：面板自己带分组底色，直接子级再让开一半，更深的层级保持原样。
			   `--dsh-bg-half` 由 applyVisual 计算（分组 alpha × 0.5）。 */
			/* 面板**保留官方圆角**（不再清零）。
			   历史：早期为了让壁纸"全部被遮挡"，把面板与其后代的 `border-radius` 一律清零，
			   结果改掉了官方设计语言 —— 默认外观里卡片/按钮/输入框都是 R 角，
			   用户明确要求保留。现在不碰圆角：透出效果不该以牺牲设计为代价。 */
			/* 面板内的**纯容器**一律透明；只有"实底表面"才上色。
			   这一刀是全插件的命门，真机上反复踩过：
			   - 如果给**所有后代**都写上分组色 → 每层嵌套 div 各涂一遍 α=0.38，
			     15 层叠起来等效不透明度 ≈ 1 - 0.62^15 ≈ 99.9%，壁纸被彻底盖死
			     （occluders 探针实测：同一个点上 15 层 div 全部 `rgba(21,21,23,0.38)`）；
			   - 如果给所有后代写 `transparent` → 那个真正在画实底的后代表面也被清掉，
			     面板就完全穿帮（早期版本的毛病）。
			   所以：容器 → transparent，`surface` 标记的元素 → 继承所在分组的颜色，
			   面板自身 → 由下面的规则单独上色。 */
			`html[data-${MARK}-panels][data-${MARK}-blanket] [data-${MARK}=panel] *:not([class*=wbg2]):not([data-${MARK}-keepbg]):not([data-${MARK}-keepbgdescendants]),html[data-${MARK}-panels][data-${MARK}-blanket] [data-${MARK}=sidebar] *:not([class*=wbg2]):not([data-${MARK}-keepbg]):not([data-${MARK}-keepbgdescendants]),html[data-${MARK}-panels][data-${MARK}-blanket] [data-${MARK}=bar] *:not([class*=wbg2]):not([data-${MARK}-keepbg]):not([data-${MARK}-keepbgdescendants]){background-color:transparent!important}`,
			/* 真正画底色的那层：继承所在分组的颜色（`--dsh-bg-surface` 由面板规则设定） */
			`html[data-${MARK}-panels][data-${MARK}-panelbg] [data-${MARK}=surface]{background-color:var(--dsh-bg-surface, transparent)!important}`,
			/* 面板自己上色：被排除的分组由 applyVisual 写入不透明主题底色 */
			`html[data-${MARK}-panels][data-${MARK}-panelbg] [data-${MARK}=panel]{background-color:var(--dsh-bg-content, inherit)!important}`,
			`html[data-${MARK}-panels][data-${MARK}-panelbg] [data-${MARK}=sidebar]{background-color:var(--dsh-bg-sidebar, inherit)!important}`,
			`html[data-${MARK}-panels][data-${MARK}-panelbg] [data-${MARK}=bar]{background-color:var(--dsh-bg-chrome, inherit)!important}`,
			/* 投影也一并关掉：真机上 composer 卡片 `RlGAzG_card`（712×98、r=28px + shadow）
			   的投影就是"底部两处渐变黑"的来源。只去圆角不够，投影必须一起关。 */
			/* 面板保留官方圆角后，圆角外侧那 2~3px 缝隙会露出壁纸（"角上漏光"）。
			   这里用一层 **0 模糊的同色投影** 沿元素形状（含圆角）在外侧画出一圈同色像素，
			   正好填住缝隙，且**不会遮挡面板内部的壁纸** —— 比把布局根做成不透明
			   （会盖死整张壁纸，实测踩过）精确得多。原来的投影照旧保留。 */
			/* 角上填充滤镜。注意：`filter` 会建立**新的包含块**，使面板内 `position: fixed` 的
			   官方元素（如侧边栏折叠按钮 `_2H3hWW_toggle`）改为相对面板定位 ——
			   真机实测该按钮因此从右上角被挪到左下角、压在小胖鲸 logo 上。
			   所以这条规则受 `noCornerFill` 控制，用于 A/B 对照与一键回退。 */
			/* 角上填充滤镜（把圆角外侧的缝隙填成同色，见上）。
			   注意 `filter` 会建立**新的包含块**：面板内 `position: fixed` 的官方元素会改为
			   相对面板定位。侧边栏折叠按钮 `_2H3hWW_toggle` 正是 `fixed`，真机实测它会因此
			   从右上角被挪到左下角、压在小胖鲸 logo 上。所以这里做成**可关**：
			   根元素带 `data-<MARK>-cornerfill` 时才启用（noCornerFill 为真则不设该属性）。 */
			`html[data-${MARK}-canvas][data-${MARK}-cornerfill] [data-${MARK}=panel],html[data-${MARK}-canvas][data-${MARK}-cornerfill] [data-${MARK}=sidebar],html[data-${MARK}-canvas][data-${MARK}-cornerfill] [data-${MARK}=bar]{filter:drop-shadow(0 0 0 var(--dsh-bg-base, transparent))}`,
			/* 没有该属性时显式清掉滤镜（避免残留或与官方投影叠加出乎意料） */
			`html[data-${MARK}-canvas]:not([data-${MARK}-cornerfill]) [data-${MARK}=panel],html[data-${MARK}-canvas]:not([data-${MARK}-cornerfill]) [data-${MARK}=sidebar],html[data-${MARK}-canvas]:not([data-${MARK}-cornerfill]) [data-${MARK}=bar]{filter:none}`,
			/* Windows 顶栏（官方用 data-windows-titlebar 标记、在所有列上方预留高度）：
			   外壳的 titleBarOverlay 是**透明**的，而这一条页面自己通常不画底色，
			   于是窗口透明区直接透出桌面 —— 真机表现为标题栏区域露出桌面壁纸/黑底，
			   并且与右侧窗口控制区的高度看着不一致。这里让它跟着页面底色走，
			   该区域就与面板连成一体，不再给桌面留缝。 */
			`html[data-${MARK}-panels] [data-windows-menu]{background-color:var(--dsh-bg-titlebar, var(--dsh-bg-chrome))!important;border-radius:0!important}`,
			/* 顶栏整条 + **圆角后的实心底**：
			   ① 顶部 40px 用顶栏色铺满（不能用 `[data-windows-titlebar]` 当选择器 ——
			      那是挂在 <html> 上的无值属性，不是元素；该区域实际命中的是布局根）；
			   ② 其余区域铺**实心主题底色**（`--dsh-bg-base`）：
			      面板保留了官方圆角，圆角外侧的缝隙会落到这层实色上，
			      而不是透出壁纸 —— 这样既保住 R 角设计，又不会在角上"漏光"。
			      壁纸仍由顶层图层显示，这里只是给缝隙一个同色底。 */
			`html[data-${MARK}-canvas] [data-${MARK}=canvas]{background-image:linear-gradient(to bottom,var(--dsh-bg-titlebar) 0,var(--dsh-bg-titlebar) var(--dsh-frame-chrome-top,40px),transparent var(--dsh-frame-chrome-top,40px))!important;background-repeat:no-repeat!important}`,
			/* 内容区左上角那个 16px 圆角也**保留**（早期把它和面板圆角一起清零过）。
			   现在不再动官方的圆角变量 —— 圆角是设计的一部分。 */
			/* 这里原本还有一条「面板与后代一律直角 + 去投影」的规则，现已删除：
			   官方默认外观里卡片/按钮/输入框都是 R 角，清零圆角等于改掉设计语言。
			   壁纸透出不该以牺牲圆角为代价 —— 面板之间的细缝改用"缝隙后是同色底"来处理。 */
			/* 底部渐变中和与"面板内底色让开"仍按面板门控：那是透明化行为，scope=off 时不该生效 */
			`html[data-${MARK}-panels][data-${MARK}-fadefix] [class*=composerSeat],html[data-${MARK}-panels][data-${MARK}-fadefix] [class*=fade],html[data-${MARK}-panels][data-${MARK}-fadefix] [class*=emptyTabHost]{background-image:none!important;background-color:transparent!important}`,
			/* 内容列内的强调色/渐变底图必须保留：清了会把选中态、蓝条之类的视觉线索一起抹掉 */
			`html[data-${MARK}-panels] [data-${MARK}=panel] *,html[data-${MARK}-panels] [data-${MARK}=sidebar] *,html[data-${MARK}-panels] [data-${MARK}=bar] *{-webkit-tap-highlight-color:transparent}`,
			/* 底部渐变的真凶（paintProbe 实锤）：
			   ① `Dc7zOa_composerSeat` 上有 `linear-gradient(transparent, rgb(21,21,23) 36px)`
			      —— composer 座为了让输入框浮起来而画的渐隐底，用户看到的就是"两处渐变黑"；
			   ② `_9lTDKa_fade` 是侧边栏滚动渐隐，同样是 gradient → 底色；
			   ③ `_emptyTabHost` 是不透明的 rgb(21,21,23)，会整块盖住壁纸。
			   这三处都不是"面板底色"，而是官方为可读性加的修饰层；在壁纸场景下应当让位。 */
			/* 兜底：万一某个表面没被标记到，至少让它按面板色轻微透出一点。
			   注意用极淡叠加（--dsh-bg-tint）而不是直接涂成面板色——后者会把
			   面板内所有实底抹平，里面的内容会一起消失。 */
			`html[data-${MARK}-panels][data-${MARK}-tint] [data-${MARK}=panel],html[data-${MARK}-panels][data-${MARK}-tint] [data-${MARK}=sidebar],html[data-${MARK}-panels][data-${MARK}-tint] [data-${MARK}=bar]{background-image:linear-gradient(var(--dsh-bg-tint,transparent),var(--dsh-bg-tint,transparent))!important}`,
			/* 悬停/选中反馈 —— 由**行内样式**实现，见下面的 startRowHover()。
			   这里曾经写过两条 CSS 规则（`.hIlkoa_sessionRow:hover` 等），
			   经 hoverRule 探针确认"规则在样式表里、选择器拼写正确、类名与 `panels` 标记都匹配"，
			   元素的 computed background-color 却依然是 rgba(0,0,0,0) ——
			   与"开关 border-radius 不生效"同属一类：**这台机器上部分 CSS 对官方元素不起作用**。
			   所以改走行内样式（`style.setProperty(..., "important")` 无法被任何样式表压制），
			   那两条无效规则已删除，避免留下"看着像生效其实没有"的死代码。 */
			/* 设置行的外观 */
			".wbg2-group{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:6px;padding:10px 0;display:flex}",
			".wbg2-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
			".wbg2-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
			/* 提权说明：ui-theme 的样式表是运行时**后注入**的，同等优先级下后来者胜，
			   会把这里的控件外观盖掉（真机实测：开关 aria-pressed=true 与 false 长得一模一样，
			   于是"背景已开启"看起来像关闭）。因此控件选择器统一加 button./input. 前缀 + !important。 */
			/* 开关：规格 1:1 抄自官方 `_switch_1ik0f_5`（用探针在真机设置面板里量到的计算样式）——
			   尺寸 36×20、圆角 999px（胶囊）、关闭时轨道用 layer-1 底色、打开时轨道变
			   `rgb(249,250,251)` 白底、圆点转为深色。官方用 `<span class="_thumb_…">` 承载圆点，
			   这里用 `::before` 达到同样效果（省一个节点）。
			   属性也照官方：`role="switch"` + `aria-checked`（原来只写 aria-pressed）。 */
			".wbg2-row{display:flex;align-items:center;gap:10px;min-width:0}",
			/* 该行的控件靠右对齐（官方的开关就是贴右边缘的；之前我的开关落在左边缘，
			   用户反馈"位置不在右边了"）。 */
			".wbg2-row[data-align=end]>.wbg2-control{justify-content:flex-end}",
			".wbg2-label{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;flex:none;width:86px}",
			".wbg2-control{flex:1;min-width:0;display:flex;align-items:center;gap:8px}",
			".wbg2-input{box-sizing:border-box;flex:1;min-width:0;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}",
			".wbg2-input:focus{outline:none;border-color:var(--dsw-static-neutral-bluish-400)}",
			/* 背景开关：官方规格（36×20 / radius 999px / padding 2px / 圆点子元素）。
			   注：`button.wbg2-pill` 的基础规则曾被我在一次"清理样式"里误删（只剩 hover/选中态），
			   这里一并补回 —— 那会让按钮失去圆角与内边距，表现为"方角"。 */
			"button.wbg2-pill{box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;height:32px!important;padding:0 14px!important;border:0!important;border-radius:12px!important;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;font-weight:500;line-height:32px;white-space:nowrap;cursor:pointer;transition:background .12s ease!important}",
			"button.wbg2-pill:hover:not([aria-pressed=true]){background:var(--dsw-alias-interactive-bg-hover)}",
			"button.wbg2-pill[aria-pressed=true]{background:rgb(53,54,56)!important;color:var(--dsw-alias-label-primary)!important}",
			"button.wbg2-btn{box-sizing:border-box;height:28px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:26px;cursor:pointer;flex:none}",
			"button.wbg2-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			"button.wbg2-btn:disabled{opacity:.5;cursor:not-allowed}",
			".wbg2-range{flex:1;min-width:0;accent-color:var(--dsw-static-neutral-bluish-400);cursor:pointer}",
			".wbg2-value{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;width:52px;text-align:right;flex:none}",
			".wbg2-color{width:32px;height:32px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;cursor:pointer;flex:none}",
			".wbg2-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".wbg2-group[data-readonly=true]{opacity:.6}",
			".wbg2-group[data-readonly=true] *{pointer-events:none}"
		].join("\n");

		function ensureStyleTag() {
			const existing = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
			if (existing !== null) return existing;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-web-bg-2";
			tag.dataset.pluginCss = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return tag;
		}

		/* ============================ 视觉引擎 ============================ */

		let mountedLayer = null;
		let mountedVeil = null;
		let lastSettings = null;
		let observer = null;
		let safetyTimer = null;
		let scanQueued = false;
		let lastMarked = [];
		/** 上一次解码失败的壁纸地址（避免同一张图反复重试与反复回退）。 */
		let urlFailed = null;
		/** 上一轮识别出的布局根（用于清除过期标记，见 classifyFrameChildren）。 */
		let lastFrame = null;

		/** 创建/复用壁纸层与压暗层（固定定位、放在 body 之下所有面板之后）。 */
		function ensureLayers() {
			if (mountedLayer !== null && mountedLayer.isConnected && mountedVeil !== null && mountedVeil.isConnected) {
				return { layer: mountedLayer, veil: mountedVeil };
			}
			const old = document.getElementById(LAYER_ID);
			if (old !== null) old.remove();
			const oldVeil = document.getElementById(VEIL_ID);
			if (oldVeil !== null) oldVeil.remove();
			const layer = document.createElement("div");
			layer.id = LAYER_ID;
			const veil = document.createElement("div");
			veil.id = VEIL_ID;
			/* 插到 body 最前面：z-index 为负的固定层在所有常规内容之下 */
			document.body.insertBefore(veil, document.body.firstChild);
			document.body.insertBefore(layer, veil);
			mountedLayer = layer;
			mountedVeil = veil;
			return { layer, veil };
		}


		/**
		 * 用户提交过（或已被采纳）的设置值。
		 *
		 * 存在的原因：这台机器上 `configForms` 的**读**永远返回出厂默认值，
		 * 而 `host.set()` 会触发订阅回调、用那份默认值再跑一次 `applyVisual`，
		 * 把用户刚改的东西冲掉（真机实测：改成"不透出"后 1 秒又被恢复）。
		 * `applyVisual` 用它作为最终覆盖层，保证提交过的值不被旧值盖回去。
		 */
		const committedSettings = {};

		/**
		 * 给"靠背景色显形的控件及其内部零件"打上 `keepbg` 标记，使 blanket 规则放过它们。
		 *
		 * 为什么需要（真机两次事故）：
		 *   ① 出厂形态：官方插件列表的开关与"添加插件"按钮**整个消失** ——
		 *      blanket 把面板内所有后代的 background-color 清成 transparent，
		 *      而它们正是靠背景色显形的；
		 *   ② 只给按钮本身打标记后：开关只剩一个很淡的轮廓，**圆形滑块不见了** ——
		 *      滑块是按钮内部的子元素，同样被清了。
		 * 背景色一旦被清掉就再也读不回来，所以必须**事前**把整棵子树都豁免。
		 *
		 * 范围刻意收窄到真正的交互控件：漏标只是少透明一层（几乎看不出），
		 * 误标会让一块实底挡住壁纸（很明显）。宁可漏标。
		 *
		 * @returns 标记的元素个数（供诊断）。
		 */
		function markKeepBackground() {
			let n = 0;
			const attr = `data-${MARK}-keepbg`;
			const kidAttr = `data-${MARK}-keepbgdescendants`;
			let list;
			try {
				list = document.querySelectorAll('button,[role="button"],[role="switch"],[role="checkbox"],input,select,textarea,[aria-pressed],[aria-checked]');
			} catch {
				return 0;
			}
			for (const el of list) {
				/* 自己的控件不需要豁免（样式带 wbg2 前缀，blanket 本来也不匹配） */
				if (typeof el.className === "string" && el.className.includes("wbg2")) continue;
				if (el.getAttribute(attr) !== "1") {
					el.setAttribute(attr, "1");
					n++;
				}
				/* 整棵子树都要豁免：开关的圆形滑块是子元素，只标按钮本身会让滑块
				   被清成透明 —— 真机表现为"开关只剩一个很淡的轮廓、圆钮不见了"。
				   标记名不用 `-keepbg`（blanket 的 `[data-wbg2]` 清除循环会把它删掉）。 */
				let kids;
				try {
					kids = el.querySelectorAll("*");
				} catch {
					continue;
				}
				for (const kid of kids) {
					if (kid.getAttribute(kidAttr) !== "1") {
						kid.setAttribute(kidAttr, "1");
						n++;
					}
				}
			}
			return n;
		}

		/** 应用壁纸与压暗。 */
		function applyVisual(section) {
			/* ---------- 用"我提交过的值"兜底 ----------
			   这台机器上 `configForms` 的**读**是坏的：`getSnapshot().value` 永远是出厂默认值。
			   而 `host.set()` 会触发订阅回调，回调拿着那份默认值再跑一次 applyVisual ——
			   于是用户刚改的设置 1 秒内被冲掉（真机实测：改成"不透出"后 panels 标记
			   先变 null、下一秒又被恢复成 1）。
			   所以这里记住"用户提交过什么"，凡是传入值与该字段的最近提交值不一致时，
			   以提交值为准。这样不论谁在什么时候调用 applyVisual，结果都稳定。 */
			const incoming = merged(section);
			const s = { ...incoming, ...committedSettings };
			lastSettings = s;
			ensureStyleTag();
			const { layer, veil } = ensureLayers();
			const dark = isDark();

			if (!s.enabled) {
				layer.style.display = "none";
				veil.style.display = "none";
				document.documentElement.removeAttribute(`data-${MARK}-canvas`);
				document.documentElement.removeAttribute(`data-${MARK}-panels`);
				/* 还必须清掉内联的 --dsh-bg-* 变量与相关自定义属性。
				   只摘标记是不够的：标记负责让样式表"匹配不到"，但这些变量是内联写在
				   `<html>` 上的，而面板的元素样式（`background-color:var(--dsh-bg-content,…)`）
				   在**其它规则**里也可能消费到它们；更关键的是关闭期间画布仍是透明的，
				   残留的 `rgba(21,21,23,α)` 会变成一层没人负责的黑色遮罩，
				   表现就是"壁纸不显示、整屏发暗"（真机上踩过：关掉插件做对照实验后忘了开，
				   页面停在半破状态）。 */
				for (const key of ["sidebar", "content", "composer", "chrome", "half", "tint", "surface"]) {
					document.documentElement.style.removeProperty(`--dsh-bg-${key}`);
				}
				return;
			}
			layer.style.display = "block";
			veil.style.display = "block";
			layer.style.opacity = String(Math.max(0, Math.min(1, Number(s.opacity))));
			layer.style.filter = Number(s.blur) > 0 ? `blur(${Number(s.blur)}px)` : "none";
			if (s.kind === "image") {
				const url = String(s.image || DEFAULT_IMAGE).replace(/[\\"]/g, (c) => `\\${c}`);
				layer.style.backgroundImage = `url("${url}")`;
				layer.style.backgroundColor = "transparent";
				/* 生效校验：真机踩过坑——图太大或被策略拦住时 CSS 写了 url() 但图不出来，
				   而诊断只显示"已设图"，看着像成功。用 Image() 实测解码，失败回退内置壁纸。 */
				if (urlFailed !== String(s.image || DEFAULT_IMAGE)) {
					const src = String(s.image || DEFAULT_IMAGE);
					const probe = new Image();
					probe.onerror = () => {
						console.warn("[dsh-web-bg-2] 壁纸加载失败，回退内置壁纸:", src.slice(0, 60));
						urlFailed = src;
						if (mountedLayer !== null) mountedLayer.style.backgroundImage = `url("${DEFAULT_IMAGE}")`;
					};
					probe.onload = () => {
						urlFailed = null;
					};
					try {
						probe.src = src;
					} catch { /* 忽略 */ }
				}
			} else {
				layer.style.backgroundImage = "none";
				layer.style.backgroundColor = String(s.color);
			}
			const dim = Math.max(0, Math.min(1, Number(s.dim)));
			veil.style.background = dark
				? `rgba(0, 0, 0, ${Number(dim.toFixed(3))})`
				: `rgba(15, 17, 21, ${Number((dim * 0.75).toFixed(3))})`;

			/* 面板透明化变量。
			   关键顺序：必须在打 canvas 标记**之前**读主题底色——一旦
			   `html[data-wbg2-canvas] body{background-color:transparent}` 生效，
			   getComputedStyle(body).backgroundColor 就变成 rgba(0,0,0,0)，
			   再拿它当 base 会把所有面板算成"纯黑 + alpha"（真机第一次运行就是这样，
			   诊断里记的是 rgba(0, 0, 0, 0.147)）。所以这里先取一次并缓存，主题切换时失效重取。 */
			const base = readBaseColor(dark);
			document.documentElement.setAttribute(`data-${MARK}-canvas`, "1");
			/* 角上填充滤镜的开关（见 CSS 里的说明）：它会给面板建立新的包含块，
			   把官方 `position: fixed` 的折叠按钮挪位压到 logo 上，因此默认关闭；
			   需要时（`noCornerFill: false`）才打开。 */
			if (s.noCornerFill === true) {
				document.documentElement.removeAttribute(`data-${MARK}-cornerfill`);
			} else {
				document.documentElement.setAttribute(`data-${MARK}-cornerfill`, "1");
			}
			/* 排查用门控（默认都启用，见 DEFAULTS）：
			   `noFadeNeutralize` 停用"底部渐变中和"，`noTint` 停用"面板淡色叠加"，
			   `noBlanket` 停用"面板内后代底色透明"，`noPanelBg` 停用"面板自身底色"。 */
			if (s.noFadeNeutralize === true) document.documentElement.removeAttribute(`data-${MARK}-fadefix`);
			else document.documentElement.setAttribute(`data-${MARK}-fadefix`, "1");
			if (s.noTint === true) document.documentElement.removeAttribute(`data-${MARK}-tint`);
			else document.documentElement.setAttribute(`data-${MARK}-tint`, "1");
			if (s.noBlanket === true) document.documentElement.removeAttribute(`data-${MARK}-blanket`);
			else {
				document.documentElement.setAttribute(`data-${MARK}-blanket`, "1");
				/* 把**控件**从 blanket 里排除掉。
				   真机事故：启用插件后官方插件列表里的开关、"添加插件"按钮全部消失 ——
				   blanket 把面板内所有后代的 background-color 清成 transparent，
				   而开关/按钮正是靠背景色显形的。它们永远不会被标成 `surface`
				   （markNestedSurfaces 只标记占面板面积 ≥30% 的大块），所以必须单独豁免。 */
				markKeepBackground();
			}
			if (s.noPanelBg === true) document.documentElement.removeAttribute(`data-${MARK}-panelbg`);
			else document.documentElement.setAttribute(`data-${MARK}-panelbg`, "1");
			const scope = PANEL_SHAPES[s.scope] ?? PANEL_SHAPES.all;
			const strength = Math.max(0, Math.min(1, Number(s.translucency)));
			const floor = s.scope === "off" ? 1 : 1 - strength * (1 - MIN_PANEL_FLOOR);
			const style = document.documentElement.style;
			let any = false;
			for (const key of ["sidebar", "content", "composer", "chrome"]) {
				/* 系数 0~1（见 PANEL_SHAPES）：0 = 该分组不参与透明化，1 = 满强度透出 */
				const factor = Math.max(0, Math.min(1, Number(scope[key] ?? 1)));
				/* 该分组"实际让出多少底色"：系数越小，底色越接近不透明主题底色 */
				const groupFloor = 1 - factor * (1 - floor);
				const alpha = PANEL_ALPHA[key][dark ? "dark" : "light"] * groupFloor;
				/* 系数为 0（该分组被 scope 排除）时必须给**不透明的底色**，让分组恢复实底。
				   绝不能用 `transparent`：画布已经被我们改成透明，分组自己也透明的话
				   壁纸会从该分组整块透出来 —— 那就是"选了仅内容区、侧边栏却仍透出"的 bug。
				   `idle` 取主题底色而非纯黑，这样与面板原本的观感一致。 */
				style.setProperty(`--dsh-bg-${key}`, factor === 0 ? base : withAlpha(base, alpha));
				if (factor > 0) any = true;
			}
			/* 兜底叠加色：很淡的一层，只用于"没被标记到的表面"，不影响正常透明化 */
			style.setProperty("--dsh-bg-tint", withAlpha(base, Math.max(0, Math.min(0.2, PANEL_ALPHA.content[dark ? "dark" : "light"] * floor * 0.35))));
			/* 顶栏统一色。
			   真机实测：外壳的 titleBarOverlay 只在**左侧菜单那一段**叠了一层暗色，
			   于是顶栏被切成"左深右亮"两段（截图放大后能看到明确分界线）。
			   页面改不了外壳遮罩，所以反过来让页面把同样的暗色画在这 40px 上,
			   遮罩叠上去之后整条就是均匀的一段。 */
			/* 顶栏色必须**完全不透明**，且等于主题底色。
			   原因：右侧那三个窗口控制按钮由外壳单独合成（它们的图形根本不在窗口位图里，
			   截图采样取不到），其底色就是主题底色；页面这条若带一点透明度
			   （早先用 0.92），底下会透出照片，于是与按钮区产生可见色差 ——
			   用户实测报过"顶栏颜色和窗口控制器的颜色不一致"。 */
			/* 关键：外壳给窗口控制按钮画的那块底色**不是**主题变量里的 `rgb(21,21,23)`，
			   而是 `rgb(27,27,28)`（比主题底色亮 6 个色阶）。
			   从用户实测截图里量出来的：控制区 `(27,27,28)`，而页面画的那条 `(20,21,24)` —— 
			   差 6 阶，肉眼就是"顶栏偏暗、控制按钮发灰"。所以这里直接用外壳的实际值。 */
			style.setProperty("--dsh-bg-titlebar", dark ? "rgb(27, 27, 28)" : "#ffffff");
			/* 圆角缝隙用的实心底色：必须**不透明**，否则角上会透出壁纸。 */
			style.setProperty("--dsh-bg-base", base);
			/* 顶栏带专用色：比会话列更实（约 2.2 倍 alpha，并封顶 0.75），
			   因为外壳的 titleBarOverlay 是透明的，若这一条不够实，窗口透明区会透出桌面，
			   看起来就是"菜单栏那块偏黑、且与右侧窗口控制区高度对不上"。 */
			/* 面板直接子级的底色：分组 alpha 的一半（既透出壁纸，又不至于让正文失去对比度） */
			style.setProperty("--dsh-bg-half", withAlpha(base, Math.max(0, Math.min(0.6, PANEL_ALPHA.content[dark ? "dark" : "light"] * floor * 0.5))));
			if (any) document.documentElement.setAttribute(`data-${MARK}-panels`, "1");
			else document.documentElement.removeAttribute(`data-${MARK}-panels`);
			/* 抓一份开关形状快照：此刻用户刚点过开关、设置面板通常正开着，
			   而"上报"要 800ms 后才发（那时面板往往已关）。 */
		}

		/**
		 * 读取主题底色（面板 alpha 的基色）。
		 *
		 * 取值顺序（真机踩过两次坑，这里按可靠性排序）：
		 *   1. **主题令牌** `--dsw-alias-bg-base`——官方颜色权威，且在插件把自己的
		 *      画布置透明之后依然可读。真机上 `getComputedStyle(body).backgroundColor`
		 *      可能本来就是 `rgba(0, 0, 0, 0)`（页面把底色画在别的元素上），
		 *      此时若拿它当基色，所有面板会变成"纯黑 + alpha"（一层发闷的黑纱）。
		 *   2. `body` 的计算底色（令牌读不到时的后备）。
		 *   3. 官方深/浅兜底色。
		 *
		 * 刻意不做缓存：读一次的成本可忽略，缓存反而会在
		 * "关闭背景 → 切换主题 → 重新开启"这类序列里留下过期基色。
		 * @param dark - 当前是否深色主题。
		 * @returns 形如 `rgb(21, 21, 23)` 的颜色串。
		 */
		function readBaseColor(dark) {
			const fallback = dark ? "rgb(21, 21, 23)" : "rgb(255, 255, 255)";
			let token = "";
			try {
				token = window.getComputedStyle(document.body).getPropertyValue("--dsw-alias-bg-base").trim();
			} catch { /* 取不到就走后备 */ }
			if (token !== "" && isOpaque(token)) return token;
			const computed = window.getComputedStyle(document.body).backgroundColor;
			if (isOpaque(computed)) return computed;
			return fallback;
		}

		/** 选中态补画函数（由 startRowHover 赋值，rescan 之后调用）。
		    必须声明在 rescan 之前 —— 函数声明会提升，但 `let` 处于暂时性死区，
		    放在后面会让 rescan 首次执行时抛 ReferenceError。 */
		let selectedPainter = null;

		/**
		 * 重新标记布局根与布局链上的画布元素，供样式表消费。
		 * 顺带处理主题切换（深色标记变化时底色缓存必须失效）。
		 */
		function rescan() {
			const { marked } = classifyFrameChildren();
			lastMarked = marked;
			/* React 重渲染会丢掉行内样式，所以每轮重扫后补画一次"选中态"
			   （`selectedPainter` 由 startRowHover 赋值，声明在其上方）。 */
			if (selectedPainter !== null) selectedPainter();
		}

		function scanSoon() {
			if (scanQueued) return;
			scanQueued = true;
			setTimeout(() => {
				scanQueued = false;
				/* 顺序有意义：先分类打标记，再应用样式。
				   反过来在壁纸是大图（1.4MB data URL）时会有一条窄窗口——图还没解码、
				   布局尚未稳定，面板内部"画实底"的表面量到的尺寸是 0，于是漏标，
				   面板看着就是一块实底。先标记再应用可以避开这段时序。 */
				rescan();
				if (lastSettings !== null) applyVisual(lastSettings);
			}, 300);
		}

		/* ===================== 侧边栏悬停反馈（行内样式） =====================
		   背景：在"透出"模式下，官方不再给侧边栏的**工作区行 / 会话行**画悬停与选中底色
		   （rowInk 探针实测：同一个 `hIlkoa_sessionRow.hIlkoa_selected`，
		   `scope=off` 下 bg=rgba(255,255,255,0.08)，`scope=all` 下无绘制）。
		   我先试过补 CSS 规则，经 hoverRule 探针确认"规则在样式表里、选择器正确、
		   类名/标记都匹配"，但元素的 computed background-color 依然透明 ——
		   与"开关圆角不生效"属于同一类环境问题：**这台机器上部分 CSS 对官方元素不起作用**。

		   因此改用**行内样式 + 事件委托**：行内 `!important` 无法被任何样式表压制。
		   只写 `background-color` 一个视觉属性，不碰布局，避免重演
		   "filter 建立包含块把官方 fixed 元素挪位"那类事故。 */
		let rowHoverBound = false;
		const ROW_SELECTOR = ".hIlkoa_sessionRow,.hIlkoa_projectRow,.wCInkW_triggerRow,[class*=newSession]";
		/** 当前被我们着色过的行，离开时精确还原。 */
		const paintedRows = new Set();

		function rowTarget(node) {
			if (node === null || typeof node.closest !== "function") return null;
			const el = node.closest(ROW_SELECTOR);
			if (el !== null) return { el, region: "row" };
			/* 输入框区域：锚定在 `[class*=composerSeat]` 上，并**泛化到区域内所有按钮** ——
			   逐个硬编码类名（`dlU_AG_trigger` 权限、`wq12jW_trigger` 模型…）会随应用更新失效，
			   锚定区域则能自动覆盖以后新增的控件。 */
			const seat = node.closest("[class*=composerSeat]");
			if (seat === null) return null;
			const btn = node.closest("button,[role=button]");
			if (btn === null || !seat.contains(btn)) return null;
			return { el: btn, region: "composer" };
		}

		function paintRow(target, on) {
			const el = target.el ?? target;
			const region = target.region ?? "row";
			if (!(el instanceof HTMLElement)) return;
			if (on) {
				/* 记住原值，便于精确还原 */
				if (!paintedRows.has(el)) {
					el.dataset[`${MARK}PrevBg`] = el.style.getPropertyValue("background-color");
					paintedRows.add(el);
				}
				/* 输入框内的控件本来就没有底色，给淡一点的值，避免压过输入框本身。 */
				const color = region === "composer" ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.08)";
				el.style.setProperty("background-color", color, "important");
			} else {
				const prev = el.dataset[`${MARK}PrevBg`];
				if (prev === void 0 || prev === "") el.style.removeProperty("background-color");
				else el.style.setProperty("background-color", prev);
				delete el.dataset[`${MARK}PrevBg`];
				paintedRows.delete(el);
			}
		}

		function startRowHover() {
			if (rowHoverBound) return;
			rowHoverBound = true;
			/* 只在"面板透出"时接管：不透出模式下官方自己会画，不去插手。 */
			const active = () => document.documentElement.getAttribute(`data-${MARK}-panels`) !== null;
			/* 排查开关：`noRowHover` 为真时完全不接管，让官方自己画悬停
			   （用于判断"跟随鼠标位置的动画消失"是否由本插件造成）。 */
			const allowed = () => lastSettings === null || lastSettings.noRowHover !== true;
			document.addEventListener(
				"pointerover",
				(event) => {
					if (!active() || !allowed()) return;
					const hit = rowTarget(event.target);
					if (hit === null) return;
					paintRow(hit, true);
				},
				true
			);
			document.addEventListener(
				"pointerout",
				(event) => {
					if (!allowed()) return;
					const hit = rowTarget(event.target);
					if (hit === null) return;
					/* 移动到同一目标内部时不算离开（行内的子元素、按钮内的图标） */
					const next = rowTarget(event.relatedTarget);
					if (next !== null && next.el === hit.el) return;
					paintRow(hit, false);
				},
				true
			);
			/* 选中态的行：官方在透出模式下同样不画，这里常驻着色（不做悬停判断） */
			const paintSelected = () => {
				if (!active() || !allowed()) return;
				for (const el of document.querySelectorAll(".hIlkoa_sessionRow.hIlkoa_selected")) paintRow({ el, region: "row" }, true);
			};
			paintSelected();
			/* 交给 rescan 在每轮重扫后补画（React 重渲染会丢掉行内样式） */
			selectedPainter = paintSelected;
		}

		function startWatcher() {
			/* 启动时也按"先标记、后应用"走一遍 */
			rescan();
			if (lastSettings !== null) applyVisual(lastSettings);
			startRowHover();
			if (typeof MutationObserver === "undefined" || observer !== null) return;
			observer = new MutationObserver(scanSoon);
			observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
			safetyTimer = setInterval(scanSoon, 2500);
			window.addEventListener("resize", scanSoon);
			/* 壁纸是 data URL 时，解码完成会晚于首帧；解码后再补一轮标记 */
			const probe = new Image();
			probe.onload = () => scanSoon();
			probe.onerror = () => scanSoon();
			try {
				probe.src = String((lastSettings ?? {}).image || DEFAULT_IMAGE);
			} catch { /* 忽略 */ }
		}

		function stopWatcher() {
			if (safetyTimer !== null) {
				clearInterval(safetyTimer);
				safetyTimer = null;
			}
			if (observer !== null) {
				observer.disconnect();
				observer = null;
			}
			window.removeEventListener("resize", scanSoon);
		}

		/* ============================== 诊断 ============================== */

		/** 采集真实 DOM 结构（只读），交给 Host 落盘，便于按真机校准选择器。 */
		function collectDiagnostics() {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const rootCs = window.getComputedStyle(document.documentElement);
			const bodyCs = window.getComputedStyle(document.body);
			const describe = (el) => {
				if (el === null || el === void 0) return null;
				const cs = window.getComputedStyle(el);
				const r = el.getBoundingClientRect();
				return {
					path: pathOf(el),
					cls: typeof el.className === "string" ? String(el.className).slice(0, 120) : null,
					rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
					bg: cs.backgroundColor,
					img: cs.backgroundImage === "none" ? null : String(cs.backgroundImage ?? "").slice(0, 60),
					position: cs.position,
					zIndex: cs.zIndex,
					opacity: cs.opacity,
					backdropFilter: cs.backdropFilter === "none" ? null : cs.backdropFilter,
					insideFrame: false
				};
			};
			const frame = findFrame();
			const big = [];
			for (const el of document.querySelectorAll("body *")) {
				const r = el.getBoundingClientRect();
				if (r.width < vw * 0.25 || r.height < vh * 0.25) continue;
				big.push({ ...describe(el), areaPct: Math.round((r.width * r.height) / (vw * vh) * 100) });
			}
			big.sort((a, b) => b.areaPct - a.areaPct);
			return {
				url: location.href.replace(/token=[^&]+/, "token=***"),
				isTopFrame: window.top === window,
				viewport: [vw, vh],
				dpr: window.devicePixelRatio,
				dark: isDark(),
				htmlAttrs: [...document.documentElement.attributes].map((a) => `${a.name}=${String(a.value).slice(0, 60)}`),
				bodyAttrs: [...document.body.attributes].map((a) => `${a.name}=${String(a.value).slice(0, 60)}`),
				bodyInlineStyle: (document.body.getAttribute("style") ?? "").slice(0, 400),
				canvas: {
					html: rootCs.backgroundColor,
					body: bodyCs.backgroundColor,
					bodyImage: bodyCs.backgroundImage === "none" ? null : String(bodyCs.backgroundImage ?? "").slice(0, 60)
				},
				frameVars: {
					top: rootCs.getPropertyValue("--dsh-frame-top-clearance").trim(),
					chrome: rootCs.getPropertyValue("--dsh-frame-chrome-top").trim(),
					overlay: rootCs.getPropertyValue("--dsh-frame-overlay-top").trim(),
					leading: rootCs.getPropertyValue("--dsh-frame-leading-clearance").trim()
				},
				tokens: {
					base: bodyCs.getPropertyValue("--dsw-alias-bg-base").trim(),
					layer1: bodyCs.getPropertyValue("--dsw-alias-bg-layer-1").trim(),
					layer2: bodyCs.getPropertyValue("--dsw-alias-bg-layer-2").trim(),
					modulePlatform: bodyCs.getPropertyValue("--dsw-alias-bg-module-platform").trim()
				},
				applied: {
					canvasAttr: document.documentElement.getAttribute(`data-${MARK}-canvas`),
					panelsAttr: document.documentElement.getAttribute(`data-${MARK}-panels`),
					sidebarVar: document.documentElement.style.getPropertyValue("--dsh-bg-sidebar"),
					contentVar: document.documentElement.style.getPropertyValue("--dsh-bg-content"),
					chromeVar: document.documentElement.style.getPropertyValue("--dsh-bg-chrome"),
					marked: lastMarked ?? [],
					layerOpacity: mountedLayer === null ? null : mountedLayer.style.opacity
				},
				frame: frame === void 0 ? null : describe(frame),
				frameChildren: frame === void 0 ? [] : [...frame.children].map(describe),
				/* 递归快照（3 层）：用于定位"面板内部谁在画实底"——
				   只列有底色的元素，避免整棵树把诊断文件撑爆 */
				paintedTree: frame === void 0 ? [] : subtreeOfPainted(frame, 0, 3),
				/* 命中测试：覆盖用户报的三处问题所在位置 ——
				   ① 内容列左上角（R 角/未被遮挡的条）② 底部渐变黑 ③ 标题栏与窗口控制区 */
				points: [
					analyzePoint(Math.round(vw * 0.12), Math.round(vh * 0.5)),
					analyzePoint(Math.round(vw * 0.7), Math.round(vh * 0.6)),
					analyzePoint(Math.round(vw * 0.5), 20),
					analyzePoint(Math.round(vw * 0.225), 44),   /* 内容列左上角内侧（R 角附近） */
					analyzePoint(Math.round(vw * 0.215), 46),   /* 列边界线 */
					analyzePoint(Math.round(vw * 0.5), vh - 120), /* 底部渐变带上沿 */
					analyzePoint(Math.round(vw * 0.5), vh - 40),  /* 底部渐变带下沿 */
					analyzePoint(Math.round(vw * 0.9), 20),     /* 右侧窗口控制区同高度 */
					analyzePoint(Math.round(vw * 0.5), 60)      /* 标题栏下沿（tab 行上方） */
				],
				outerChain: outerChain(),
				/* 容器族样式探针：把底部渐变可能来源的完整绘制属性报出来
				   （背景/底图/阴影/mask/圆角/溢出），避免再靠猜。 */
				paintProbe: (() => {
					const out = [];
					const seen = new Set();
					for (const el of document.querySelectorAll("body *")) {
						const r = el.getBoundingClientRect();
						if (r.height < 20 || r.width < 200) continue;
						/* 只关心窗口下半部 且 与会话列重叠的元素 */
						/* 扫描整窗（原先只扫下半部，导致内容区上半的不透明层漏检） */
						const cs = window.getComputedStyle(el);
						const hasPaint = paintsSurface(cs) && colorAlpha(cs.backgroundColor) >= 0.98;
						if (!hasPaint) continue;
						const key = `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.top)}`;
						if (seen.has(key)) continue;
						seen.add(key);
						out.push({
							path: pathOf(el),
							cls: typeof el.className === "string" ? String(el.className).slice(0, 40) : null,
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							bg: cs.backgroundColor,
							img: String(cs.backgroundImage ?? "none").slice(0, 70),
							shadow: String(cs.boxShadow ?? "none").slice(0, 70),
							mask: String(cs.maskImage ?? "none").slice(0, 50),
							radius: cs.borderRadius,
							overflow: cs.overflow,
							zIndex: cs.zIndex
						});
						if (out.length >= 14) break;
					}
					return out;
				})(),				topBands: topBands(),
				bigElements: big.slice(0, 24),
				/* 我们自己的三个层：直接按 id 报，避免被面积筛选漏掉 */
				/* 内容列子元素探针：排查"内容区被什么盖住"——报出每个直接子元素的
				   绘制属性与位置，避免再靠截图猜。 */
				/* 层叠栈探针：在若干坐标上用 elementsFromPoint 取出**完整**元素栈，
				   直接回答"谁压在壁纸层上面"。这是排查"壁纸看不见"最直接的证据。 */
				/* 样式表自检：回答"插件的 <style> 到底在不在 DOM 里、内容是不是最新"。
				   真机踩过"诊断说面板半透明、画面却是实底"的矛盾，根因就是样式表没生效。 */
				/* 图片解码探针：直接问浏览器"当前壁纸地址到底能不能解码，尺寸多大"。
				   真机踩过"CSS 写了 url() 但图不出来"（加载失败会静默回退内置壁纸）。 */
				imageDecode: (() => {
					const el = document.getElementById(LAYER_ID);
					const inline = el === null ? "" : String(el.style.backgroundImage ?? "");
					const m = /url\(["']?(.*?)["']?\)$/.exec(inline);
					return {
						inlinePrefix: inline.slice(0, 44),
						inlineLength: inline.length,
						parsedLength: m === null ? null : m[1].length,
						urlFailedFlag: urlFailed === null ? null : String(urlFailed).slice(0, 40)
					};
				})(),				/* 官方开关采样：把"看起来像开关"的元素的类名与计算样式报出来，
				   用于让插件开关 1:1 对齐（官方那一套是共享组件，源码里搜不到完整规则）。 */
				/* 开关区域的"自渲染"像素图：用 foreignObject 把开关序列化进 SVG，
				   在离屏 canvas 上放大 8 倍绘制，再 toDataURL 送给宿主保存。
				   这样得到的是浏览器自己的渲染结果，不依赖窗口截图/坐标换算
				   （那两条路在这台机器上反复给出矛盾结论）。 */
				/* 圆角自检（不依赖截图、也不依赖 canvas 的异步绘制）：
				   在"元素四角内侧 1px"与"中心"分别做命中测试。
				   四角若命中的是元素自己 → 那是方角；若四角落到元素之外 → 圆角把角切掉了。
				   （上一版用 canvas + foreignObject，但绘制是异步的，量到的其实是面板底色，结论不可信。） */
				/* 方法自检（对照实验）：把同一套"四角命中测试"同时用在
				   ①我的开关（应圆角）②官方一个已知形状的按钮（iconButton，28x28/radius 8px）。
				   若两者四角都报 outside，说明这个方法本身分不出方角与圆角 —— 那我之前的判定就不可信。 */
				/* 开关的"自渲染"导出：把开关节点连同计算样式序列化成独立 SVG，
				   由宿主存成文件。这样能拿到**页面自己渲染的画面**，
				   不依赖窗口截图与坐标换算（那两条路在这台机器上反复给出矛盾结论）。 */
				switchSvg: (() => {
					try {
						const el = document.querySelector("button.wbg2-switch");
						if (el === null) return { error: "找不到开关（设置面板未打开？）" };
						const r = el.getBoundingClientRect();
						const inline = (node, keys) => {
							const cs = window.getComputedStyle(node);
							return keys
								.map((k) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${cs[k]}`)
								.join(";");
						};
						const clone = el.cloneNode(true);
						clone.setAttribute("style", inline(el, ["width", "height", "padding", "margin", "border", "borderRadius", "backgroundColor", "display", "alignItems", "boxSizing", "overflow", "flex"]));
						const kid = el.querySelector(".wbg2-thumb");
						const kidClone = clone.querySelector(".wbg2-thumb");
						if (kid !== null && kidClone !== null) {
							kidClone.setAttribute("style", inline(kid, ["width", "height", "borderRadius", "backgroundColor", "transform", "display", "flex"]));
						}
						const html = new XMLSerializer().serializeToString(clone);
						const W = Math.round(r.width) + 12;
						const H = Math.round(r.height) + 12;
						const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 10}" height="${H * 10}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#2c2c2e"/><g transform="translate(6,6)">${html}</g></svg>`;
						return {
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							computed: {
								radius: window.getComputedStyle(el).borderRadius,
								bg: window.getComputedStyle(el).backgroundColor,
								display: window.getComputedStyle(el).display,
								padding: window.getComputedStyle(el).padding
							},
							svg
						};
					} catch (error) {
						return { error: String(error).slice(0, 140) };
					}
				})(),				/* 开关的真实 DOM 结构（截断）：直接回答"页面上那个东西到底是什么"。
				   注意只报结构，不报完整行内样式，避免把诊断文件写爆。 */
				/* 圆角来源探针：报告内容列 / 侧边栏列自身的 border-radius 与官方圆角变量，
				   用于只改"那一个角"而不是又把所有圆角清零。 */
				cornerSources: (() => {
					const pick = (sel) => {
						const el = document.querySelector(sel);
						if (el === null) return null;
						const cs = window.getComputedStyle(el);
						const r = el.getBoundingClientRect();
						return {
							cls: String(el.className).slice(0, 40),
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							radius: cs.borderRadius,
							cornerTL: `${cs.borderTopLeftRadius} / ${cs.borderTopLeftRadius}`,
							overflow: cs.overflow,
							filter: String(cs.filter ?? "none").slice(0, 40),
							shadow: String(cs.boxShadow ?? "none").slice(0, 50)
						};
					};
					const rootCs = window.getComputedStyle(document.documentElement);
					const bodyCs = window.getComputedStyle(document.body);
					const vars = {};
					for (const name of ["--dsh-windows-content-radius", "--dsh-frame-content-radius", "--dsh-radius-lg", "--dsh-radius-md"]) {
						vars[name] = rootCs.getPropertyValue(name).trim() || bodyCs.getPropertyValue(name).trim() || "(未设置)";
					}
					return {
						search: [...document.querySelectorAll("[class*=centerCol],[class*=sidebarCol]")].map((el) => {
							const cs = window.getComputedStyle(el);
							return `div.${String(el.className).slice(0, 30)} radius=${cs.borderRadius}`;
						}),
						center: pick("[class*=centerCol]"),
						sidebar: pick("[class*=sidebarCol]"),
						vars
					};
				})(),				/* 侧边栏顶部几何探针：列出侧边栏内 y < 60px 区域的所有元素及其位置，
				   用于定位"折叠/展开图标叠在 logo 上"这个 bug 是谁造成的。
				   只报几何与类名，不报样式全文，避免把诊断文件写爆。 */
				/* 命中测试：问页面"小胖鲸 logo 所在位置上，最上层是谁"。
				   这是判定"谁叠在 logo 上"最直接的办法 —— 比逐元素量坐标可靠。
				   同时报告该位置上是否还有 SVG（正常情况应当命中 logo 的 svg/path）。 */
				/* logo 行几何链：从 brandMark 往上走到 sidebar 根，逐层报矩形与定位方式，
				   用于定位"折叠按钮压到 logo 上"是哪一层的盒模型造成的。 */
				/* 侧边栏"绘制证据"快照：把每个元素的有效背景、边框、伪元素背景、
				   透明度都记下来，用于在两种 scope 之间做差集，定位"悬停反馈消失"的元凶。
				   只报"有可见绘制"的元素，控制体积。 */
				/* 悬停诊断：对侧边栏的会话行派发一次合成 mouseover/mouseenter，
				   记录"派发前后"该行及其祖先/兄弟的背景色变化。
				   目的：确认官方是否用 JS 状态来画悬停底（如果是，纯 CSS 规则救不回来，
				   需要在插件侧补一条 :hover 规则；如果是 CSS 的 :hover，则合成事件无效、
				   结果会显示"无变化"，也能据此区分）。 */
				/* 交互行的绘制细节：对 projectRow（工作区）/ sessionRow（会话）逐层报告
				   "谁在画底色"（自身 / 子元素 / 伪元素），用于照着官方实测值写悬停兜底。
				   真机类名：`hIlkoa_projectRow`、`hIlkoa_sessionRow`（+`hIlkoa_selected`）。 */
				/* 悬停底色的取值来源：列出侧边栏元素上所有以 -- 开头的自定义属性，
				   对比两种 scope 下的差异，找出被"关掉"的那个令牌。 */
				/* 悬停规则的匹配自检：直接看"元素有没有命中我们那条规则"，
				   而不是靠肉眼判断。rowMatches 为 false 说明选择器写错了；
				   cssFound 为 false 说明规则压根没进样式表。 */
				/* 输入框（composer）内的可点击控件：拿到"权限""模型"等按钮的真实类名，
				   用于把行内悬停反馈扩展到它们。 */
				composerRows: (() => {
					const host = document.querySelector("[class*=composer]")?.closest("div") ?? document.body;
					const out = [];
					for (const el of host.querySelectorAll("button,[role=button],[role=combobox],[aria-haspopup]")) {
						const r = el.getBoundingClientRect();
						if (r.width < 24 || r.height < 16) continue;
						const cs = window.getComputedStyle(el);
						out.push({
							cls: String(el.className).slice(0, 60),
							tag: el.tagName.toLowerCase(),
							role: el.getAttribute("role") ?? "",
							popup: el.getAttribute("aria-haspopup") ?? "",
							size: `${Math.round(r.width)}x${Math.round(r.height)}`,
							bg: cs.backgroundColor,
							text: (el.textContent ?? "").trim().slice(0, 18)
						});
					}
					return { found: true, count: out.length, rows: out.slice(0, 24) };
				})(),				hoverRule: (() => {
					const row = document.querySelector(".hIlkoa_sessionRow");
					const col = document.querySelector("[class*=sidebarCol]");
					const sheet = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
					const css = sheet === null ? "" : sheet.textContent;
					const hasRule = css.includes("hIlkoa_sessionRow") && css.includes("wCInkW_triggerRow");
					/* 把规则片段取出来，确认拼出来的选择器长什么样 */
					const i = css.indexOf("hIlkoa_sessionRow");
					const snippet = i < 0 ? "" : css.slice(Math.max(0, i - 200), i + 120);
					return {
						found: row !== null,
						cssFound: hasRule,
						snippet: snippet.replace(/\n/g, " ").slice(0, 300),
						rowCls: row === null ? "" : String(row.className),
						rowBg: row === null ? "" : window.getComputedStyle(row).backgroundColor,
						rowInline: row === null ? "" : row.getAttribute("style"),
						rowMatchesHover: row === null ? false : row.matches(":hover"),
						sidebarPresent: col !== null,
						documentMark: document.documentElement.getAttribute(`data-${MARK}-panels`)
					};
				})(),				rowVars: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const row = col.querySelector("[class*=sessionRow]");
					if (row === null) return { found: false, reason: "no sessionRow" };
					const collect = (el) => {
						const cs = window.getComputedStyle(el);
						const vars = {};
						for (const name of cs) {
							if (!name.startsWith("--")) continue;
							const v = cs.getPropertyValue(name).trim();
							if (v !== "") vars[name] = v.slice(0, 40);
						}
						return vars;
					};
					return {
						found: true,
						scope: document.documentElement.getAttribute(`data-${MARK}-panels`) === null ? "off" : "on",
						rowVars: collect(row),
						sidebarVars: collect(col),
						rootVars: collect(document.documentElement)
					};
				})(),				rowInk: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const pick = (sel) => {
						const el = col.querySelector(sel);
						if (el === null) return null;
						const detail = (node, tag) => {
							const cs = window.getComputedStyle(node);
							const before = window.getComputedStyle(node, "::before");
							const after = window.getComputedStyle(node, "::after");
							return {
								who: tag,
								cls: String(node.className).slice(0, 40),
								bg: cs.backgroundColor,
								img: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 44),
								shadow: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 40),
								before: before.content === "none" ? "" : `${before.backgroundColor}`,
								after: after.content === "none" ? "" : `${after.backgroundColor}`
							};
						};
						const list = [detail(el, "自身")];
						for (const kid of el.children) list.push(detail(kid, `子:${kid.tagName.toLowerCase()}`));
						return {
							cls: String(el.className).slice(0, 44),
							aria: el.getAttribute("aria-selected") ?? el.getAttribute("aria-expanded") ?? "",
							list
						};
					};
					return {
						found: true,
						scope: document.documentElement.getAttribute(`data-${MARK}-panels`) === null ? "off" : "on",
						project: pick("[class*=projectRow]"),
						session: pick("[class*=sessionRow]"),
						trigger: pick("[class*=triggerRow]")
					};
				})(),
				hoverProbe: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const rows = [...col.querySelectorAll("[class*=sessionRow]")];
					if (rows.length === 0) return { found: false, reason: "没有 sessionRow" };
					const snap = (el) => {
						const cs = window.getComputedStyle(el);
						return {
							cls: String(el.className).slice(0, 40),
							bg: cs.backgroundColor,
							img: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 30)
						};
					};
					const target = rows[1] ?? rows[0];
					const around = [target, target.parentElement, target.firstElementChild].filter(Boolean);
					const before = around.map(snap);
					const opts = { bubbles: true, cancelable: true, view: window };
					target.dispatchEvent(new MouseEvent("mouseover", opts));
					target.dispatchEvent(new MouseEvent("mouseenter", opts));
					target.dispatchEvent(new MouseEvent("mousemove", opts));
					const after = around.map(snap);
					return {
						found: true,
						rowCount: rows.length,
						/* 是否命中 :hover（合成事件不会触发 CSS :hover，值为 false 属正常） */
						matchesHover: target.matches(":hover"),
						changed: before.map((b, i) => ({ before: b, after: after[i] })).filter((p) => p.before.bg !== p.after.bg || p.before.img !== p.after.img)
					};
				})(),
				/* 「新会话」按钮的外观全量快照。
				   用户反馈：① 它原来不是灰的（现在像灰的）；② 官方在它上面有"跟随鼠标位置"
				   的悬停动画，现在没了。ROW_SELECTOR 里含 [class*=newSession]，
				   所以它正是插件行内悬停要覆盖的目标 —— 这个探针用来定位到底改坏了什么：
				   本条目的背景/背景图、伪元素、以及官方可能用来做鼠标跟随的自定义属性。 */
				newSessionInk: (() => {
					const el = document.querySelector("[class*=newSession]");
					if (el === null) return { found: false };
					const cs = window.getComputedStyle(el);
					const before = window.getComputedStyle(el, "::before");
					const after = window.getComputedStyle(el, "::after");
					/* 官方若用 CSS 变量做鼠标跟随，变量名通常是 --x/--y/--mouse-* 之类 */
					const own = [];
					for (const name of cs) {
						if (!name.startsWith("--")) continue;
						if (!/x$|y$|mouse|pointer|pos|angle|progress|hover|gradient/i.test(name)) continue;
						own.push(`${name}=${cs.getPropertyValue(name)}`);
					}
					const inline = [];
					for (let i = 0; i < el.style.length; i++) {
						const name = el.style.item(i);
						inline.push(`${name}:${el.style.getPropertyValue(name)}${el.style.getPropertyPriority(name) === "important" ? " !important" : ""}`);
					}
					return {
						found: true,
						cls: String(el.className).slice(0, 90),
						tag: el.tagName,
						inRowSelector: el.closest(ROW_SELECTOR) === el,
						bg: cs.backgroundColor,
						img: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 90),
						blend: cs.backgroundBlendMode,
						opacity: cs.opacity,
						overflow: cs.overflow,
						transition: cs.transitionProperty,
						beforeContent: before.content === "none" ? "" : before.content,
						beforeBg: before.backgroundColor,
						beforeImg: before.backgroundImage === "none" ? "" : before.backgroundImage.slice(0, 90),
						afterContent: after.content === "none" ? "" : after.content,
						afterBg: after.backgroundColor,
						afterImg: after.backgroundImage === "none" ? "" : after.backgroundImage.slice(0, 90),
						/* 插件是否给它写过行内样式（paintRow 的痕迹） */
						inline,
						prevBg: el.dataset[`${MARK}PrevBg`] ?? null,
						/* 官方用来自绘跟随动画的候选变量 */
						customProps: own.slice(0, 12),
						/* 内部零件（快捷键角标等）的可见性 */
						kids: [...el.children].slice(0, 5).map((k) => {
							const kcs = window.getComputedStyle(k);
							return `${String(k.className).slice(0, 30)}|bg=${kcs.backgroundColor}|op=${kcs.opacity}`;
						}),
						/* 官方那个"跟随鼠标位置"的动画最可能的载体：
						   名字里带 Mask 的后代。mask-image / mask-position 常被用来做
						   跟着指针走的渐隐高光。这里把它连同自定义属性一起量出来。 */
						maskKids: [...el.querySelectorAll('[class*="ask"]')].slice(0, 4).map((k) => {
							const kcs = window.getComputedStyle(k);
							const vars = [];
							for (const name of kcs) {
								if (!name.startsWith("--")) continue;
								if (!/x$|y$|mouse|pointer|pos|angle|progress|hover|gradient|mask/i.test(name)) continue;
								vars.push(`${name}=${kcs.getPropertyValue(name)}`);
							}
							return {
								cls: String(k.className).slice(0, 44),
								bg: kcs.backgroundColor,
								img: kcs.backgroundImage === "none" ? "" : kcs.backgroundImage.slice(0, 70),
								maskImage: String(kcs.maskImage ?? kcs.webkitMaskImage ?? "none").slice(0, 70),
								maskPos: String(kcs.maskPosition ?? kcs.webkitMaskPosition ?? ""),
								op: kcs.opacity,
								vars: vars.slice(0, 8)
							};
						})
					};
				})(),				sidebarInk: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const out = [];
					for (const el of col.querySelectorAll("*")) {
						const r = el.getBoundingClientRect();
						if (r.width < 8 || r.height < 8) continue;
						const cs = window.getComputedStyle(el);
						const before = window.getComputedStyle(el, "::before");
						const after = window.getComputedStyle(el, "::after");
						const paint = {
							bg: cs.backgroundColor,
							img: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 40),
							op: cs.opacity,
							border: cs.borderTopWidth === "0px" ? "" : cs.borderTopWidth,
							beforeBg: before.content === "none" ? "" : before.backgroundColor,
							afterBg: after.content === "none" ? "" : after.backgroundColor
						};
						const visible = (paint.bg !== "rgba(0, 0, 0, 0)" && paint.bg !== "transparent")
							|| paint.img !== "" || paint.beforeBg !== "" || paint.afterBg !== "" || paint.op !== "1";
						if (!visible) continue;
						out.push(`${String(el.className).slice(0, 34)}|${Math.round(r.width)}x${Math.round(r.height)}|bg=${paint.bg}|img=${paint.img}|op=${paint.op}|bd=${paint.border}|be=${paint.beforeBg}|af=${paint.afterBg}`);
					}
					return { found: true, scope: document.documentElement.getAttribute(`data-${MARK}-panels`) === null ? "off" : "on", total: out.length, rows: out.slice(0, 90) };
				})(),				logoChain: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const mark = col.querySelector("[class*=brandMark]");
					if (mark === null) return { found: false, reason: "no brandMark" };
					const rows = [];
					let el = mark;
					while (el !== null && el !== col.parentElement) {
						const r = el.getBoundingClientRect();
						const cs = window.getComputedStyle(el);
						rows.push({
							cls: String(el.className).slice(0, 46),
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							pos: cs.position,
							display: cs.display,
							flex: `${cs.flexGrow}/${cs.flexShrink}/${cs.flexBasis}`,
							justify: cs.justifyContent,
							align: cs.alignItems,
							margin: cs.margin,
							overflow: cs.overflow,
							transform: String(cs.transform).slice(0, 24)
						});
						el = el.parentElement;
					}
					/* 同时单独量折叠按钮 */
					const toggle = col.querySelector("[class*=toggle]");
					const toggleInfo = toggle === null ? null : (() => {
						const r = toggle.getBoundingClientRect();
						const cs = window.getComputedStyle(toggle);
						return {
							cls: String(toggle.className).slice(0, 40),
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							pos: cs.position,
							offset: [toggle.offsetLeft, toggle.offsetTop],
							offsetParent: String(toggle.offsetParent?.className ?? "null").slice(0, 40),
							visibility: cs.visibility,
							opacity: cs.opacity,
							display: cs.display,
							zIndex: cs.zIndex,
							background: cs.backgroundColor,
							parentCls: String(toggle.parentElement?.className ?? "").slice(0, 40)
						};
					})();
					const sidebarRect = col.getBoundingClientRect();
					return {
						found: true,
						sidebarRect: [Math.round(sidebarRect.left), Math.round(sidebarRect.top), Math.round(sidebarRect.width)],
						chain: rows,
						toggle: toggleInfo
					};
				})(),				logoHitTest: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const mark = col.querySelector("[class*=brandMark]") ?? col.querySelector("[class*=brand] svg");
					if (mark === null) return { found: false, reason: "找不到 logo 元素" };
					const r = mark.getBoundingClientRect();
					const probe = (x, y) => {
						const el = document.elementFromPoint(x, y);
						if (el === null) return "null";
						return `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
					};
					/* 在 logo 矩形内取 9 个点做命中测试 */
					const xs = [r.left + 1, r.left + r.width / 2, r.right - 1];
					const ys = [r.top + 1, r.top + r.height / 2, r.bottom - 1];
					const grid = [];
					for (const y of ys) for (const x of xs) grid.push(probe(x, y));
					const uniq = [...new Set(grid)];
					/* 谁在 logo 之上？用 elementsFromPoint 列出该点的整个栈 */
					const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
						.slice(0, 8)
						.map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 36)}`);
					return {
						found: true,
						markRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
						hitResults: uniq,
						allSame: uniq.length === 1,
						stack
					};
				})(),				sidebarTop: (() => {
					const col = document.querySelector("[class*=sidebarCol]");
					if (col === null) return { found: false };
					const base = col.getBoundingClientRect();
					const rows = [];
					for (const el of col.querySelectorAll("*")) {
						const r = el.getBoundingClientRect();
						if (r.height === 0 || r.width === 0) continue;
						/* 只看侧边栏顶部 60px 内的元素 */
						if (r.top - base.top > 60) continue;
						const cs = window.getComputedStyle(el);
						rows.push({
							cls: String(el.className).slice(0, 44),
							tag: el.tagName.toLowerCase(),
							rect: [Math.round(r.left - base.left), Math.round(r.top - base.top), Math.round(r.width), Math.round(r.height)],
							pos: cs.position,
							opacity: cs.opacity,
							display: cs.display,
							bg: cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "transparent" : cs.backgroundColor
						});
					}
					return {
						found: true,
						sidebarWidth: Math.round(base.width),
						sidebarRect: [Math.round(base.left), Math.round(base.top), Math.round(base.width), Math.round(base.height)],
						count: rows.length,
						rows: rows.slice(0, 26)
					};
				})(),				switchHtml: (() => {
					const el = document.querySelector("button.wbg2-switch") ?? document.querySelector(".wbg2-switch");
					if (el === null) {
						return {
							found: false,
							switchLike: [...document.querySelectorAll("button")].filter((b) => /switch|thumb/i.test(String(b.className) + b.innerHTML)).map((b) => String(b.className).slice(0, 60))
						};
					}
					return {
						found: true,
						tag: el.tagName.toLowerCase(),
						cls: String(el.className),
						childCount: el.children.length,
						childTags: [...el.children].map((c) => `${c.tagName.toLowerCase()}.${String(c.className)}`),
						inlineCss: el.getAttribute("style"),
						computed: {
							width: window.getComputedStyle(el).width,
							height: window.getComputedStyle(el).height,
							radius: window.getComputedStyle(el).borderRadius,
							bg: window.getComputedStyle(el).backgroundColor,
							overflow: window.getComputedStyle(el).overflow
						},
						inlineStyleKeys: [...el.style].slice(0, 20),
						childInlineStyleKeys: el.children.length > 0 ? [...el.children[0].style].slice(0, 20) : [],
						outerHead: el.outerHTML.slice(0, 240)
					};
				})(),				styleTag: (() => {
					const tag = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
					if (tag === null) return { present: false };
					const css = tag.textContent ?? "";
					return {
						present: true,
						length: css.length,
						expectedLength: CSS.length,
						upToDate: css === CSS,
						/* 抽样几个关键规则是否在表里 */
						hasPanelsRule: css.includes("data-wbg2-panels"),
						hasLayerRule: css.includes("#dsh-web-bg-2-layer"),
						hasCanvasRule: css.includes("data-wbg2-canvas"),
						headPresent: document.head !== null && document.head !== void 0
					};
				})(),				stackProbe: [[640, 450], [900, 600], [200, 450]].map(([x, y]) => ({
					point: [x, y],
					stack: (document.elementsFromPoint(x, y) || []).slice(0, 10).map((el) => {
						const cs = window.getComputedStyle(el);
						const r = el.getBoundingClientRect();
						return {
							tag: el.tagName.toLowerCase(),
							id: el.id || null,
							cls: typeof el.className === "string" ? el.className.slice(0, 40) : null,
							mark: el.getAttribute(`data-${MARK}`) || null,
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							bg: cs.backgroundColor,
							img: String(cs.backgroundImage ?? "none").slice(0, 40),
							z: cs.zIndex,
							opacity: cs.opacity
						};
					})
				})),				/* 覆盖者探针（决定性）：在坐标上遍历**所有**元素（不截断），
				   报出每个元素的底色/背景图/mix-blend/backdrop-filter，
				   并单独检查伪元素 ::before / ::after 的底色。
				   目的：回答"谁把壁纸层盖住了"——之前所有探针都只看前 10 个元素或只看半窗。 */
				occluders: (() => {
					const out = [];
					const seen = new Set();
					for (const [px, py] of [[640, 450], [900, 600], [200, 450], [640, 120]]) {
						const chain = [];
						let el = document.elementFromPoint(px, py);
						/* 沿祖先链往上走，而不是用 elementsFromPoint（它会被截断） */
						while (el !== null && el !== void 0 && el !== document.documentElement) {
							const cs = window.getComputedStyle(el);
							const before = window.getComputedStyle(el, "::before");
							const after = window.getComputedStyle(el, "::after");
							const key = `${px},${py}:${el.tagName}${el.className}`;
							if (!seen.has(key)) {
								seen.add(key);
								chain.push({
									tag: el.tagName.toLowerCase(),
									id: el.id || null,
									cls: typeof el.className === "string" ? el.className.slice(0, 34) : null,
									bg: cs.backgroundColor,
									img: String(cs.backgroundImage ?? "none").slice(0, 34),
									blend: cs.mixBlendMode,
									backdrop: String(cs.backdropFilter ?? "none").slice(0, 24),
									beforeBg: before.backgroundColor,
									afterBg: after.backgroundColor,
									mark: el.getAttribute(`data-${MARK}`) || null
								});
							}
							el = el.parentElement;
						}
						out.push({ point: [px, py], chain });
					}
					return out;
				})(),				contentChildren: (() => {
					const center = document.querySelector("[class*=centerCol]");
					if (center === null) return [];
					return [...center.children].map((el) => {
						const r = el.getBoundingClientRect();
						const cs = window.getComputedStyle(el);
						return {
							cls: String(el.className).slice(0, 46),
							rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
							bg: cs.backgroundColor,
							img: String(cs.backgroundImage ?? "none").slice(0, 56),
							mark: el.getAttribute("data-wbg2") || null,
							opacity: cs.opacity,
							z: cs.zIndex
						};
					});
				})(),				ownLayers: [LAYER_ID, VEIL_ID].map((id) => {
					const el = document.getElementById(id);
					if (el === null) return { id, missing: true };
					const cs = window.getComputedStyle(el);
					const rr = el.getBoundingClientRect();
					return {
						id,
						rect: [Math.round(rr.left), Math.round(rr.top), Math.round(rr.width), Math.round(rr.height)],
						display: cs.display,
						bg: cs.backgroundColor,
						img: String(cs.backgroundImage ?? "none").slice(0, 60),
						inlineImg: String(el.style.backgroundImage ?? "none").slice(0, 60),
						zIndex: cs.zIndex
					};
				}),
				/* 只报"是不是 data URL / 长度"，绝不把 base64 正文写进报告 ——
				   曾因此把诊断文件撑到 500MB+（我的失误，已修）。 */
				imageUrl: (() => {
					const el = document.getElementById(LAYER_ID);
					const inline = el === null ? "" : String(el.style.backgroundImage ?? "");
					const isData = inline.includes("base64");
					const isFile = inline.includes("file://");
					const m = /url\(["']?([^"')]{0,40})/.exec(inline);
					return `${m === null ? "(空)" : m[1]}… [总长 ${inline.length}${isData ? ", data URL" : ""}${isFile ? ", file://" : ""}]`;
				})(),
			};
		}

		/**
		 * 该元素当前是否"在画表面"：不透明底色、半透明底色，或带背景图。
		 * 与 isOpaque 不同——半透明也算（那种表面同样会压住壁纸，只是浅一些）。
		 * @param cs - 计算样式。
		 */
		function paintsSurface(cs) {
			const bg = String(cs.backgroundColor ?? "");
			const hasBg = bg !== "" && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)";
			const hasImg = cs.backgroundImage !== "none" && cs.backgroundImage !== "";
			return (hasBg && parseColor(bg) !== null) || hasImg;
		}

		/**
		 * 递归收集"画了底色/底图"的元素（最多 3 层），用于排查面板内部谁在画实底。
		 * 只收 painted 的元素：整棵树会把诊断文件撑到无法阅读。
		 * @param el - 起点。
		 * @param depth - 当前深度。
		 * @param maxDepth - 最大深度。
		 */
		function subtreeOfPainted(el, depth, maxDepth) {
			if (depth > maxDepth) return [];
			const out = [];
			for (const child of el.children) {
				const r = child.getBoundingClientRect();
				if (r.width < 8 || r.height < 8) continue;
				const cs = window.getComputedStyle(child);
				const painted = paintsSurface(cs);
				if (painted) {
					out.push({
						depth,
						mark: child.dataset[MARK] ?? null,
						cls: typeof child.className === "string" ? String(child.className).slice(0, 60) : null,
						rect: [Math.round(r.width), Math.round(r.height)],
						bg: cs.backgroundColor,
						img: cs.backgroundImage === "none" ? null : String(cs.backgroundImage ?? "").slice(0, 40),
						opacity: cs.opacity,
						visibility: cs.visibility
					});
				}
				out.push(...subtreeOfPainted(child, depth + 1, maxDepth));
			}
			return out;
		}

		/**
		 * 命中测试 + 祖先链分析：回答"某个坐标上，究竟是谁在画实底把壁纸挡住"。
		 *
		 * 这是被真机逼出来的诊断手段：`marked`/`paintedTree` 只能看到我们**标记过**的
		 * 元素，而实际挡光的往往是没被标记的中间层。这里按真实命中点自底向上走
		 * 祖先链，报出壁纸之上的第一层不透明底色，并给出每一层的合成 alpha。
		 * @param x - 视口坐标 X。
		 * @param y - 视口坐标 Y。
		 */
		function analyzePoint(x, y) {
			const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y) : null;
			const chain = [];
			let node = hit;
			while (node !== null && node !== void 0 && node.nodeType === 1) {
				const r = node.getBoundingClientRect();
				const cs = window.getComputedStyle(node);
				const painted = paintsSurface(cs);
				chain.push({
					path: pathOf(node),
					cls: typeof node.className === "string" ? String(node.className).slice(0, 46) : null,
					id: node.id || null,
					mark: node.dataset[MARK] ?? null,
					rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
					bg: painted ? cs.backgroundColor : null,
					img: cs.backgroundImage === "none" ? null : String(cs.backgroundImage ?? "").slice(0, 46),
					alpha: painted ? colorAlpha(cs.backgroundColor) : null,
					radius: cs.borderRadius === "0px" ? null : cs.borderRadius,
					shadow: cs.boxShadow === "none" ? null : String(cs.boxShadow ?? "").slice(0, 46),
					opacity: cs.opacity,
					zIndex: cs.zIndex,
					position: cs.position,
					backdropFilter: cs.backdropFilter === "none" ? null : cs.backdropFilter,
					isLayer: node.id === LAYER_ID || node.id === VEIL_ID
				});
				node = node.parentElement;
			}
			const firstSolid = chain.find((n) => n.alpha !== null && n.alpha >= 0.6) ?? null;
			return { point: [x, y], hit: hit === null ? null : pathOf(hit), chain, firstSolidAbove: firstSolid };
		}

		/**
		 * 解析颜色的 alpha 分量（没有 alpha 视为 1）。
		 * @param color - CSS 颜色。
		 */
		function colorAlpha(color) {
			const text = String(color ?? "");
			if (text === "" || text === "transparent") return 0;
			const m = /rgba?\(([^)]+)\)/i.exec(text);
			if (m === null) return 1;
			const parts = m[1].split(/[\s,/]+/).filter((p) => p !== "");
			return parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
		}

		/**
		 * 外侧祖先链快照：从 `#root` 一直到 `html`。
		 * 真机上外壳可能在自己的一层上画底色，那一层不在 `#root` 内部，必须单独看。
		 */
		function outerChain() {
			const out = [];
			let node = document.getElementById("root");
			while (node !== null && node !== void 0 && node.nodeType === 1) {
				const r = node.getBoundingClientRect();
				const cs = window.getComputedStyle(node);
				out.push({
					tag: node.tagName.toLowerCase(),
					id: node.id || null,
					cls: typeof node.className === "string" ? String(node.className).slice(0, 46) : null,
					rect: [Math.round(r.width), Math.round(r.height)],
					bg: cs.backgroundColor,
					img: cs.backgroundImage === "none" ? null : String(cs.backgroundImage ?? "").slice(0, 34),
					position: cs.position,
					zIndex: cs.zIndex,
					opacity: cs.opacity,
					isolation: cs.isolation,
					transform: cs.transform === "none" ? null : String(cs.transform ?? "").slice(0, 30),
					filter: cs.filter === "none" ? null : String(cs.filter ?? "").slice(0, 30)
				});
				node = node.parentElement;
			}
			return out;
		}

				/**
		 * 顶部横条扫描：找出"贴在窗口最上沿、又宽又矮、并且画了底色"的元素。
		 *
		 * 真机症状（用户反馈）：页面自己的标题行（58px）比外壳遮罩（40px）高，
		 * 底部多出 18px 深色，看起来像"菜单栏与窗口控制区高度不一致"。
		 * 它不在我们标记的面板里，所以要单独找出来才能对症处理。
		 * @returns 命中的元素清单（按 top 升序）。
		 */
		function topBands() {
			const out = [];
			const seen = new Set();
			for (const el of document.querySelectorAll("[data-windows-titlebar],[data-windows-titlebar] *,[data-windows-menu],[data-window-drag]")) {
				if (seen.has(el)) continue;
				seen.add(el);
				const r = el.getBoundingClientRect();
				if (r.width < 4 || r.height < 4 || r.top > 100) continue;
				const cs = window.getComputedStyle(el);
				out.push({
					path: pathOf(el),
					cls: typeof el.className === "string" ? String(el.className).slice(0, 40) : null,
					mark: el.dataset[MARK] ?? null,
					rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
					bg: cs.backgroundColor,
					img: cs.backgroundImage === "none" ? null : String(cs.backgroundImage ?? "").slice(0, 34),
					radius: cs.borderRadius === "0px" ? null : cs.borderRadius,
					dataAttrs: [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name).join(",") || null
				});
			}
			return out.sort((a, b) => a.rect[1] - b.rect[1] || b.rect[2] - a.rect[2]);
		}

		let diagSent = false;
		async function sendDiagnostics(force) {
			if (diagSent && force !== true) return;
			diagSent = true;
			try {
				const report = collectDiagnostics();
				const response = await fetch(DIAG_PATH, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ report })
				});
				const body = await response.json().catch(() => void 0);
				console.log("[dsh-web-bg-2] 诊断已上报:", body?.value?.files ?? body?.value?.file ?? body);
				await adoptSeed(body?.value?.seed);
			} catch (error) {
				console.warn("[dsh-web-bg-2] 诊断上报失败（不影响显示）:", error);
			}
		}

		/** 已采纳过种子的标记：一次会话只补一次，避免覆盖用户随后的选择。 */
		let seedAdopted = false;

		/**
		 * 采纳宿主送来的**当前设置**（配置里的真实值）。
		 *
		 * 这台机器上 `configForms` 的读永远返回出厂默认值：
		 * 面板显示的是默认值、改完还会被旧值冲掉。宿主能读到配置文件，
		 * 所以把它的值同时用于两处：
		 *   ① `committedSettings` —— applyVisual 的最终覆盖层（防止被冲掉）；
		 *   ② 设置行的本地状态 —— 让面板显示正确的值。
		 *
		 * @param seed - `{ image, kind, translucency, scope, … }`；无种子时为 null。
		 * @returns 实际采纳的字段名数组。
		 */
		async function adoptSeed(seed) {
			const adopted = [];
			if (seedAdopted || seed === null || seed === void 0) return adopted;
			seedAdopted = true;
			const patch = {};
			/* 采纳**全部** DEFAULTS 的键，而不是维护一份白名单 ——
			   白名单漏字段的代价很实在：宿主把 `noBlanket` 送来了、这里却不认，
			   于是 A/B 开关"写了没反应"，把排查方向带偏一整轮。
			   image 单独处理：空串不算有效值（否则会把配置里的图清掉）。 */
			for (const k of Object.keys(DEFAULTS)) {
				if (k === "image") continue;
				if (seed[k] !== void 0) patch[k] = seed[k];
			}
			if (typeof seed.image === "string" && seed.image !== "") patch.image = seed.image;
			if (Object.keys(patch).length === 0) return adopted;

			/* 记进兜底层：这是"当前设置"的权威来源 */
			Object.assign(committedSettings, patch);
			for (const k of Object.keys(patch)) adopted.push(k);

			/* 通知已挂载的设置行更新显示（它订阅这个事件重建本地状态） */
			applyVisual({ ...merged(host.getSnapshot().value), ...committedSettings });
			try {
				settingsSeeded(patch);
			} catch { /* 设置行还没挂载也没关系：它挂载时会读 committedSettings */ }
			console.log(`[dsh-web-bg-2] 已采纳宿主送来的设置：${adopted.join(", ")}`);
			return adopted;
		}

		/** 设置行已就绪时由 apply() 填入，用于把采纳的设置推给面板显示。 */
		let settingsSeeded = () => {};

		/* ============================ 设置行 ============================ */

		function pick(zh, en) {
			return typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language.toLowerCase().startsWith("en") ? en : zh;
		}
		const h = React.createElement;
		let host;

		function Row() {
			/* 初始值以**配置里的真实值**为准（`committedSettings` 由宿主送来的 seed 填），
			   而不是 `host.getSnapshot().value` —— 那台机器上它永远是出厂默认值，
			   面板会因此显示错的值（"改不了"的观感一半来自这里）。 */
			const [local, setLocal] = React.useState(() => merged({ ...host.getSnapshot().value, ...committedSettings }));
			const [writable, setWritable] = React.useState(() => host.getSnapshot().writable !== false);
			const timers = React.useRef({});
			/* 宿主送来设置后刷新面板显示 */
			React.useEffect(() => {
				settingsSeeded = (patch) => setLocal((prev) => merged({ ...prev, ...patch }));
				return () => {
					settingsSeeded = () => {};
				};
			}, []);
			React.useEffect(() => host.subscribe(() => {
				const snap = host.getSnapshot();
				/* 订阅回调只用来更新可写状态：它的 value 是默认值，
				   直接 setLocal 会把用户改的设置显示回默认（真机实测过）。 */
				setLocal((prev) => merged({ ...snap.value, ...committedSettings, ...prev, ...committedSettings }));
				setWritable(snap.writable !== false);
			}), []);
			React.useEffect(() => () => {
				for (const key of Object.keys(timers.current)) clearTimeout(timers.current[key]);
			}, []);
			/**
			 * 把设置写回配置。两条路都试：
			 *   ① `host.set()` —— 正规通道（configForms）。这台机器上它**不落盘**；
			 *   ② 诊断通道的写入入口 —— 宿主直写 profile 配置文件。**确认可用**。
			 * 只走 ① 会让"设置面板点了没反应"；两条都写是为了兼容各种情况，
			 * 且写的是同一个值，不会互相干扰。
			 */
			const persist = async (patch) => {
				/* 先记进 committedSettings：这样即便 host.set 触发订阅回调、
				   回调拿默认值再跑 applyVisual，也不会把这次改动冲掉。 */
				for (const [k, v] of Object.entries(patch)) committedSettings[k] = v;
				let viaHost = false;
				let viaFile = false;
				try {
					for (const [k, v] of Object.entries(patch)) await host.set(k, v);
					viaHost = true;
				} catch { /* 正规通道失败不影响文件通道 */ }
				try {
					const res = await fetch(DIAG_PATH, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ patch })
					});
					const body = await res.json().catch(() => void 0);
					viaFile = body?.value?.ok === true;
				} catch { /* 两条都失败时下面会提示 */ }
				if (!viaHost && !viaFile) console.warn("[dsh-web-bg-2] 设置未能写回配置（两条通道都失败）");
				/* 写完之后再按"提交值"渲染一次，确保画面就是用户刚选的那个 */
				applyVisual({ ...local, ...committedSettings });
				return { viaHost, viaFile };
			};

			const commit = (field, value) => {
				const next = { ...local, [field]: value };
				setLocal(next);
				applyVisual(next);
				clearTimeout(timers.current[field]);
				timers.current[field] = setTimeout(() => void persist({ [field]: value }), 250);
			};
			const reset = () => {
				const patch = {};
				for (const key of Object.keys(DEFAULTS)) patch[key] = DEFAULTS[key];
				setLocal({ ...DEFAULTS });
				applyVisual({ ...DEFAULTS });
				void persist(patch);
			};
			const onFile = (event) => {
				const file = event.target.files && event.target.files[0];
				event.target.value = "";
				if (!file) return;
				if (file.size > MAX_FILE_BYTES) {
					alert(pick("图片超过 4MB，请选择更小的图片", "Image exceeds 4MB; pick a smaller one"));
					return;
				}
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = String(reader.result ?? "");
					if (dataUrl !== "") {
						commit("image", dataUrl);
						commit("kind", "image");
					}
				};
				reader.readAsDataURL(file);
			};
			const fileInput = React.useRef(null);
			const s = local;
			const slider = (key, min, max, step, format) => h("div", { className: "wbg2-row", key }, [
				h("div", { className: "wbg2-label", key: "l" }, format.label),
				h("div", { className: "wbg2-control", key: "c" }, [
					h("input", {
						key: "r",
						className: "wbg2-range",
						type: "range",
						min,
						max,
						step,
						value: Math.round(Number(s[key]) * (max === 100 ? 100 : 1)),
						onChange: (e) => commit(key, max === 100 ? Number(e.target.value) / 100 : Number(e.target.value))
					}),
					h("div", { className: "wbg2-value", key: "v" }, format.value(s[key]))
				])
			]);
			return h("div", { className: "wbg2-group", "data-readonly": writable ? void 0 : "true" }, [
				h("div", { className: "wbg2-row", key: "enabled", "data-align": "end" }, [
					/* 「背景」标签：真机量到官方的标签用的是**主文字色** `rgb(249,250,251)`
					   （我的原来是次级色 207,211,214，看着偏暗），字号 14px。
					   这里用行内样式写死 —— 外部样式表在这台机器上不完全生效。 */
					h("div", {
						className: "wbg2-label",
						style: { color: "rgb(249, 250, 251)", fontSize: "14px", lineHeight: "20px", fontWeight: "400" }
					}, pick("背景", "Background")),
					/* 撑开用的弹性占位：把开关推到面板右边缘（与官方一致）。
					   不用 `justify-content: flex-end` —— 那条靠外部样式表，在这台机器上没生效；
					   这里用一个行内 `flex:1` 的空元素承担，纯行内样式，一定起作用。 */
					h("div", { key: "spacer", style: { flex: "1 1 auto", minWidth: "0" } }),
					/* 背景开关：用 **SVG 图形**绘制，不依赖 CSS 的 border-radius。
					   为什么走到这一步：此前所有版本（外部样式表 / !important / 官方 padding 结构 /
					   纯行内样式 / left 替代 transform）都验证"计算样式完全正确"
					   （36×20、border-radius:10px、实心底色），但用户在这台机器上始终看到方角。
					   既然 CSS 圆角在这个环境里不可靠，就改用 SVG 的图形指令：
					   `<rect rx=10>` 与 `<circle>` 由图形层直接绘制，不经过 CSS 圆角。 */
					h("button", {
						key: "sw",
						type: "button",
						className: "wbg2-switch",
						role: "switch",
						"aria-checked": s.enabled,
						"aria-pressed": s.enabled,
						"aria-label": pick("启用背景", "Enable background"),
						style: {
							boxSizing: "border-box",
							display: "block",
							flex: "0 0 auto",
							width: "36px",
							minWidth: "36px",
							height: "20px",
							minHeight: "20px",
							padding: "0",
							margin: "0",
							border: "0",
							background: "transparent",
							cursor: "pointer",
							appearance: "none",
							outline: "none",
							boxShadow: "none",
							lineHeight: "0",
							fontSize: "0"
						},
						onClick: () => commit("enabled", !s.enabled)
					}, [
						/* 用一个 36×20 的 SVG 画整个开关：胶囊轨道 + 圆点。 */
						h("svg", {
							key: "art",
							width: "36",
							height: "20",
							viewBox: "0 0 36 20",
							style: { display: "block", width: "36px", height: "20px" },
							"aria-hidden": "true"
						}, [
							h("rect", {
								key: "track",
								x: "0",
								y: "0",
								width: "36",
								height: "20",
								rx: "10",
								ry: "10",
								fill: s.enabled ? "rgb(249, 250, 251)" : "rgb(53, 54, 56)"
							}),
							h("circle", {
								key: "knob",
								cx: s.enabled ? "26" : "10",
								cy: "10",
								r: "8",
								fill: s.enabled ? "rgb(15, 17, 21)" : "rgb(249, 250, 251)"
							})
						])
					])
				]),
				h("div", { className: "wbg2-row", key: "kind" }, [
					h("div", { className: "wbg2-label" }, pick("类型", "Type")),
					h("div", { className: "wbg2-control" }, [
						h("button", { key: "i", type: "button", className: "wbg2-pill", "aria-pressed": s.kind === "image", onClick: () => commit("kind", "image") }, pick("图片", "Image")),
						h("button", { key: "c", type: "button", className: "wbg2-pill", "aria-pressed": s.kind === "color", onClick: () => commit("kind", "color") }, pick("纯色", "Color"))
					])
				]),
				s.kind === "image" ? h("div", { className: "wbg2-row", key: "image" }, [
					h("div", { className: "wbg2-label" }, pick("图片", "Image")),
					h("div", { className: "wbg2-control" }, [
						h("input", {
							key: "u",
							className: "wbg2-input",
							type: "text",
							placeholder: pick("图片 URL，或选择本地图片", "Image URL, or pick a file"),
							value: s.image === DEFAULT_IMAGE ? "" : s.image,
							onChange: (e) => commit("image", e.target.value)
						}),
						h("button", { key: "f", type: "button", className: "wbg2-btn", onClick: () => fileInput.current && fileInput.current.click() }, pick("选择文件", "File…")),
						h("input", { key: "fi", ref: fileInput, type: "file", accept: "image/*", style: { display: "none" }, onChange: onFile }),
						h("button", {
							key: "d",
							type: "button",
							className: "wbg2-btn",
							disabled: !s.image || s.image === DEFAULT_IMAGE,
							onClick: () => commit("image", "")
						}, pick("内置默认", "Default"))
					])
				]) : h("div", { className: "wbg2-row", key: "color" }, [
					h("div", { className: "wbg2-label" }, pick("颜色", "Color")),
					h("div", { className: "wbg2-control" }, [
						h("input", {
							key: "p",
							className: "wbg2-color",
							type: "color",
							value: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#1e293b",
							onChange: (e) => commit("color", e.target.value)
						}),
						h("input", { key: "x", className: "wbg2-input", type: "text", value: s.color, onChange: (e) => commit("color", e.target.value) })
					])
				]),
				slider("opacity", 0, 100, 1, { label: pick("壁纸浓度", "Wallpaper"), value: (v) => `${Math.round(Number(v) * 100)}%` }),
				slider("dim", 0, 100, 1, { label: pick("压暗", "Dim"), value: (v) => `${Math.round(Number(v) * 100)}%` }),
				slider("blur", 0, 48, 1, { label: pick("模糊", "Blur"), value: (v) => `${Number(v)}px` }),
				slider("translucency", 0, 100, 1, { label: pick("通透强度", "Translucency"), value: (v) => `${Math.round(Number(v) * 100)}%` }),
				h("div", { className: "wbg2-row", key: "scope" }, [
					h("div", { className: "wbg2-label" }, pick("透出范围", "Scope")),
					h("div", { className: "wbg2-control" }, [
						h("button", { key: "a", type: "button", className: "wbg2-pill", "aria-pressed": s.scope === "all", onClick: () => commit("scope", "all") }, pick("全窗口", "Whole window")),
						h("button", { key: "c", type: "button", className: "wbg2-pill", "aria-pressed": s.scope === "content", onClick: () => commit("scope", "content") }, pick("仅内容区", "Content only")),
						h("button", { key: "o", type: "button", className: "wbg2-pill", "aria-pressed": s.scope === "off", onClick: () => commit("scope", "off") }, pick("不透出", "Opaque"))
					])
				]),
				h("div", { className: "wbg2-row", key: "actions" }, [
					h("button", { key: "r", type: "button", className: "wbg2-btn", onClick: reset }, pick("恢复默认", "Reset")),
					h("button", { key: "d", type: "button", className: "wbg2-btn", onClick: () => sendDiagnostics(true) }, pick("上报诊断", "Send diagnostics")),
					h("div", { key: "n", className: "wbg2-note" }, pick("标题栏由桌面外壳绘制，会跟随页面底色", "The title bar is drawn by the shell and follows the page colour"))
				])
			]);
		}

		/* ============================== 插件 ============================== */

		const inject = ["slots", "remote", "configForms"];

		function apply(ctx) {
			host = ctx.configForms.get(NAMESPACE);
			applyVisual(host.getSnapshot().value);
			ctx.effect(() => host.subscribe(() => applyVisual(host.getSnapshot().value)), "dsh-web-bg-2: settings subscription");
			/* 外部改写 profile 配置后，页面内的设置快照不会自动更新（真机踩过：
			   我用脚本改了 image/dim，页面仍显示旧值）。这里在 remote 可用时主动
			   refresh 一次，让"改配置文件"与"改设置"两条路径都能生效。 */
			ctx.effect(() => {
				const remote = ctx.remote;
				if (remote === void 0 || typeof remote.refresh !== "function") return;
				let cancelled = false;
				const timer = setTimeout(() => {
					if (cancelled) return;
					Promise.resolve(remote.refresh()).then(() => applyVisual(host.getSnapshot().value)).catch(() => {});
				}, 1200);
				return () => {
					cancelled = true;
					clearTimeout(timer);
				};
			}, "dsh-web-bg-2: external settings refresh");
			startWatcher();
			ctx.effect(() => stopWatcher, "dsh-web-bg-2: watcher lifecycle");			ctx.effect(() => ctx.configForms.whileServed([NAMESPACE], () => ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "dsh-web-bg-2",
				order: 30
			}, Row))), "dsh-web-bg-2: settings row");
			/* 首帧之后上报一次真实结构（延迟等布局稳定 + 面板标记完成） */
			/* 手动验证钩子：设置面板打开时，在 DevTools Console 执行 __wbg2Verify()
			   即可"就地"上报一次完整报告（含开关的真实 DOM 与行内样式）。
			   这样不依赖"设置变化后 800ms"那个时机 —— 那时面板往往已经关闭。 */
			try {
				window.__wbg2Verify = () => {
					void sendDiagnostics(true);
					return "dsh-web-bg-2：已上报，请查看诊断文件最后一条";
				};
				console.info("[dsh-web-bg-2] 需要就地验证时执行：__wbg2Verify()");
			} catch { /* 忽略 */ }
			const diagTimer = setTimeout(() => void sendDiagnostics(false), 2500);
			/* 设置变化后再补报一次（诊断默认每次加载只发一条，排查"改了配置但页面没跟上"时不够用） */
			ctx.effect(() => host.subscribe(() => {
				setTimeout(() => void sendDiagnostics(true), 800);
			}), "dsh-web-bg-2: re-report on settings change");
			ctx.effect(() => () => clearTimeout(diagTimer), "dsh-web-bg-2: diagnostics timer");
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = {
			DEFAULTS,
			DEFAULT_IMAGE,
			PANEL_ALPHA,
			PANEL_SHAPES,
			Row,
			adoptSeed,
			applyVisual,
			classifyFrameChildren,
			collectDiagnostics,
			ensureLayers,
			findFrame,
			merged,
			parseColor,
			rescan,
			sendDiagnostics,
			withAlpha
		};
		return module.exports;
	}
});








































































































