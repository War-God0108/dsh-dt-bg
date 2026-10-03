/**
 * dsh-web-bg-2 客户端半端的可视行为测试（零依赖：自带最小 DOM 夹具）。
 *
 * 运行：node test\client-visual.test.mjs
 *
 * 为什么不用 jsdom：本机 dsh-web-bg\node_modules 里只有 dsh-client 的 jsdom，
 * 路径脆弱；这里只需要元素树、inline style、getComputedStyle 与 dataset，
 * 手写夹具反而更可控，也能在任意机器上跑。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, "..", "lib", "client.js"), "utf8");

/* ============================ 最小 DOM 夹具 ============================ */

const parseStyleText = (text) => {
	const out = {};
	for (const part of String(text).split(";")) {
		const i = part.indexOf(":");
		if (i < 0) continue;
		out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
	}
	return out;
};

class Style {
	constructor() {
		this._props = new Map();
	}
	setProperty(name, value) {
		this._props.set(name, String(value));
	}
	getPropertyValue(name) {
		return this._props.get(name) ?? "";
	}
	removeProperty(name) {
		this._props.delete(name);
	}
	/** 让 el.style.foo = "bar" 与 cssText 都能落到同一张表里 */
	get cssText() {
		return [...this._props.entries()].map(([k, v]) => `${k}:${v}`).join(";");
	}
	set cssText(text) {
		this._props.clear();
		for (const [k, v] of Object.entries(parseStyleText(text))) this._props.set(k, v);
	}
}
for (const prop of ["display", "opacity", "filter", "backgroundImage", "backgroundColor", "background", "position", "inset", "pointerEvents", "backgroundPosition", "backgroundRepeat", "backgroundSize", "zIndex", "color", "borderTopLeftRadius", "borderRadius", "boxShadow"]) {
	Object.defineProperty(Style.prototype, prop, {
		get() {
			return this._props.get(prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)) ?? "";
		},
		set(value) {
			this._props.set(prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(value));
		}
	});
}

class El {
	constructor(tag) {
		this.tagName = String(tag).toUpperCase();
		this.nodeType = 1; /* 真实 DOM 元素恒为 1；缺失会让 nodeType === 1 的边界检查把整条链排除 */
		this.children = [];
		this.parentElement = null;
		this.dataset = {};
		this.style = new Style();
		this.attributes = new Map();
		this.className = "";
		this.id = "";
		this.textContent = "";
		this._rect = { left: 0, top: 0, width: 0, height: 0 };
		this._computed = {
			position: "static",
			zIndex: "auto",
			backgroundColor: "rgba(0, 0, 0, 0)",
			backgroundImage: "none",
			opacity: "1",
			backdropFilter: "none",
			color: "rgb(0, 0, 0)"
		};
	}
	get firstChild() {
		return this.children[0] ?? null;
	}
	appendChild(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}
	insertBefore(child, ref) {
		child.parentElement = this;
		const i = ref === null || ref === void 0 ? -1 : this.children.indexOf(ref);
		if (i < 0) this.children.push(child);
		else this.children.splice(i, 0, child);
		return child;
	}
	remove() {
		if (this.parentElement === null) return;
		const i = this.parentElement.children.indexOf(this);
		if (i >= 0) this.parentElement.children.splice(i, 1);
		this.parentElement = null;
	}
	/** 事件监听：客户端半端会给 document 挂 pointerover/pointerout（悬停反馈兜底）。 */
	addEventListener(type, fn) {
		this._listeners ??= [];
		this._listeners.push([type, fn]);
	}
	removeEventListener(type, fn) {
		if (this._listeners === void 0) return;
		const i = this._listeners.findIndex(([t, f]) => t === type && f === fn);
		if (i >= 0) this._listeners.splice(i, 1);
	}
	removeChild(child) {
		const i = this.children.indexOf(child);
		if (i >= 0) this.children.splice(i, 1);
		return child;
	}
	getBoundingClientRect() {
		return this._rect;
	}
	setAttribute(name, value) {
		this.attributes.set(name, String(value));
		if (name === "id") this.id = String(value);
		if (name === "class") this.className = String(value);
		if (name === "style") this.style.cssText = String(value);
	}
	getAttribute(name) {
		if (name === "style") return this.style.cssText;
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}
	removeAttribute(name) {
		this.attributes.delete(name);
	}
	hasAttribute(name) {
		return this.attributes.has(name);
	}
	querySelector(selector) {
		return this.querySelectorAll(selector)[0] ?? null;
	}
	querySelectorAll(selector) {
		const out = [];
		const match = (el) => {
			if (selector.startsWith("style[")) return el.tagName === "STYLE" && el.dataset.pluginCss !== void 0;
			const attr = /^\[data-([a-z0-9-]+)(?:=([a-z]+))?\]$/i.exec(selector);
			if (attr !== null) {
				const key = attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
				if (el.dataset[key] === void 0) return false;
				return attr[2] === void 0 ? true : String(el.dataset[key]) === attr[2];
			}
			/* 标签选择器：production 的 findFrame 用 root.querySelectorAll("div")，
			   夹具早期漏了这一支，导致所有"面板识别"用例静默失效 */
			return el.tagName === selector.toUpperCase();
		};
		const walk = (el) => {
			for (const child of el.children) {
				if (match(child)) out.push(child);
				walk(child);
			}
		};
		walk(this);
		return out;
	}
	contains(other) {
		let node = other;
		while (node !== null && node !== void 0) {
			if (node === this) return true;
			node = node.parentElement;
		}
		return false;
	}
}

class Doc extends El {
	constructor() {
		super("html");
		this.head = new El("head");
		this.body = new El("body");
		this.appendChild(this.head);
		this.appendChild(this.body);
		this.documentElement = this;
	}
	getElementById(id) {
		let found = null;
		const walk = (el) => {
			for (const child of el.children) {
				if (child.id === id) found = child;
				walk(child);
			}
		};
		walk(this);
		return found;
	}
	createElement(tag) {
		return new El(tag);
	}
	/**
	 * 命中测试：返回坐标处最深的元素（真实浏览器行为）。
	 * 面板分类用它区分"弹层遮罩"（命中的是它的后代）与"画底色的层"（命中的是它自己）。
	 * 零尺寸元素永远不可能被命中——夹具早期漏了这条，导致插在 body 末尾的零尺寸
	 * 覆盖层被误判成命中目标。
	 */
	elementFromPoint(x, y) {
		let hit = null;
		const inside = (el) => {
			const r = el.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) return false;
			if (el.id === "dsh-web-bg-2-layer" || el.id === "dsh-web-bg-2-veil") return false;
			return x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
		};
		const walk = (el, isRoot) => {
			/* body/documentElement 在真实浏览器里总是铺满视口（夹具没设矩形，这里豁免） */
			if (!isRoot && !inside(el)) return;
			hit = el;
			for (const child of el.children) walk(child, false);
		};
		walk(this.body, true);
		return hit;
	}

	/**
	 * 层叠栈：返回该点上从最上层到最下层的元素链。
	 * 真机诊断里的 `stackProbe` 用它回答"谁压在壁纸层上面"；夹具按 DOM 顺序
	 * 自顶向下收集命中元素（真实浏览器还会考虑 z-index，这里够用）。
	 */
	elementsFromPoint(x, y) {
		const stack = [];
		const inside = (el) => {
			const r = el.getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) return false;
			return x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
		};
		const walk = (el, isRoot) => {
			if (!isRoot && !inside(el)) return;
			stack.unshift(el);
			for (const child of el.children) walk(child, false);
		};
		walk(this.body, true);
		return stack;
	}
}const document = new Doc();

/* ============================ 全局环境 ============================ */

const handlers = [];
globalThis.window = {
	innerWidth: 1440,
	innerHeight: 900,
	devicePixelRatio: 1,
	top: null,
	getComputedStyle: (el) => {
		const cs = {
			/* 真实浏览器一定会给这些属性默认值；夹具早期漏了它们，
			   于是 .slice() 之类的调用会炸——是夹具的不真实，不是生产代码的 bug。
			   这里把用到的字段**全部**给上默认值，别再让缺失字段污染排查。 */
			transform: "none",
			filter: "none",
			visibility: "visible",
			isolation: "auto",
			backdropFilter: "none",
			overflow: "visible",
			backgroundImage: "none",
			boxShadow: "none",
			borderRadius: "0px",
			outlineWidth: "0px",
			outlineStyle: "none",
			...el._computed
		};
		/* 内联样式参与级联：让夹具更接近真实浏览器（插件与官方规则都用内联/样式表） */
		const inlineBg = el.style.getPropertyValue("background-color");
		if (inlineBg !== "") cs.backgroundColor = inlineBg;
		const inlinePos = el.style.getPropertyValue("position");
		if (inlinePos !== "") cs.position = inlinePos;
		/* 让 html 上的自定义变量可被 getComputedStyle 读到（applyVisual 会写它们）；
		   body 上返回官方主题令牌，模拟真实页面的 --dsw-alias-bg-base */
		if (el === document.documentElement) {
			const readVar = (name) => el.style.getPropertyValue(name);
			cs.getPropertyValue = readVar;
		} else if (el === document.body) {
			cs.getPropertyValue = (name) => name === "--dsw-alias-bg-base"
				? (el.hasAttribute("data-ds-dark-theme") ? "#151517" : "#fff")
				: "";
		} else {
			cs.getPropertyValue = () => "";
		}
		return cs;
	},
	addEventListener: (type, fn) => handlers.push([type, fn]),
	removeEventListener: () => {}
};
globalThis.window.top = globalThis.window;
globalThis.document = document;
/* Node 26 起 globalThis.navigator 是只读 getter，用 defineProperty 覆盖 */
Object.defineProperty(globalThis, "navigator", { value: { language: "zh-CN" }, configurable: true, writable: true });
globalThis.location = { href: "http://127.0.0.1:19387/?token=stub" };
globalThis.MutationObserver = class {
	observe() {}
	disconnect() {}
};
globalThis.fetch = async () => ({ json: async () => ({ ok: true, value: { file: "stub" } }) });
/* 图片解码探针（startWatcher 用它等 data URL 解码完再补一轮标记）：设 src 立即回调 */
globalThis.Image = class {
	set src(_value) {
		if (typeof this.onload === "function") this.onload();
	}
	get src() {
		return "";
	}
};
globalThis.setTimeout = (fn) => {
	/* 测试里不真的等：定时器回调只做诊断/重扫，由测试显式调用相应函数 */
	void fn;
	return 0;
};
globalThis.clearTimeout = () => {};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.alert = () => {};

/* react 桩件：只需要 useState/useRef/useEffect/createElement */
const react = {
	createElement: (type, props, ...children) => ({ type, props, children }),
	useState: (init) => [typeof init === "function" ? init() : init, () => {}],
	useRef: (init) => ({ current: init ?? null }),
	useEffect: () => {},
	Fragment: "Fragment"
};

/* ============================ 装载 bundle ============================ */

let loaded = null;
globalThis.window.__ModuleLoader__ = {
	load: (definition) => {
		loaded = definition;
	}
};
/* eslint-disable-next-line no-eval */
(0, eval)(SOURCE);
assert.ok(loaded !== null, "bundle 必须调用 __ModuleLoader__.load");
/* 模块 id 用包名：从 package.json 读，避免改包名后测试误判（踩过一次）。 */
const PKG_NAME = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).name;
assert.equal(loaded.id, PKG_NAME);
const api = loaded.factory((name) => {
	if (name === "react") return react;
	throw new Error(`未预期的 require("${name}")`);
});
assert.equal(typeof api.apply, "function");
assert.deepEqual(api.inject, ["slots", "remote", "configForms"]);
const I = api.__internals;

/* ============================ 测试用上下文 ============================ */

function makeCtx(settings) {
	const snapshot = { value: settings, writable: true };
	return {
		applied: [],
		configForms: {
			get: () => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, set: () => {}, unset: () => {} }),
			whileServed: () => () => {}
		},
		slots: { inject: () => () => {}, register: () => () => {} },
		remote: {},
		effect: (fn) => {
			const dispose = typeof fn === "function" ? fn() : void 0;
			return typeof dispose === "function" ? dispose : () => {};
		},
		_set(next) {
			snapshot.value = next;
		}
	};
}

/** 造一棵模拟真机布局根：root(#root) > frame(铺满) > [画布层, 侧边栏列, 主列] */
function buildApp() {
	/* 真正"拆掉"旧树：把父指针置空，否则 isConnected 判断会以为旧节点还在（夹具自身踩过的坑） */
	for (const child of [...document.body.children]) child.parentElement = null;
	document.body.children.length = 0;
	document.head.children.length = 0;
	/* 每个用例都从干净状态起跑：主题标记与插件写在 html 上的变量都要清掉，
	   否则上一个用例的深色/浅色会把下一个用例的期望值带偏。 */
	document.body.removeAttribute("data-ds-dark-theme");
	document.documentElement.attributes.clear();
	document.documentElement.style._props.clear();
	const root = document.createElement("div");
	root.id = "root";
	document.body.appendChild(root);
	const frame = document.createElement("div");
	frame._rect = { left: 0, top: 0, width: 1440, height: 900 };
	frame._computed.backgroundColor = "rgb(21, 21, 23)";
	root.appendChild(frame);
	const canvasLayer = document.createElement("div");
	canvasLayer._rect = { left: 0, top: 0, width: 1440, height: 900 };
	canvasLayer._computed.backgroundColor = "rgb(21, 21, 23)";
	frame.appendChild(canvasLayer);
	const sidebar = document.createElement("div");
	sidebar._rect = { left: 0, top: 0, width: 264, height: 900 };
	sidebar._computed.backgroundColor = "rgb(27, 27, 28)";
	frame.appendChild(sidebar);
	const main = document.createElement("div");
	main._rect = { left: 264, top: 0, width: 1176, height: 900 };
	main._computed.backgroundColor = "rgba(0, 0, 0, 0)";
	frame.appendChild(main);
	return { root, frame, canvasLayer, sidebar, main };
}

/* ================================ 断言 ================================ */

let pass = 0;
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test("模块契约：id、inject、apply 与 __internals", () => {
	assert.equal(loaded.id, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).name);
	assert.equal(typeof I.applyVisual, "function");
	assert.equal(typeof I.classifyFrameChildren, "function");
	assert.equal(typeof I.collectDiagnostics, "function");
	assert.equal(typeof I.findFrame, "function");
});

test("DEFAULTS：出厂即通透（opacity=1、translucency=1、scope=all）", () => {
	assert.equal(I.DEFAULTS.opacity, 1);
	assert.equal(I.DEFAULTS.translucency, 1);
	assert.equal(I.DEFAULTS.scope, "all");
	assert.equal(I.DEFAULTS.enabled, true);
});

test("颜色：三位简写 #fff 必须真的叠上 alpha（历史发白根因）", () => {
	assert.deepEqual(I.parseColor("#fff"), [255, 255, 255]);
	assert.equal(I.withAlpha("#fff", 0.42), "rgba(255, 255, 255, 0.42)");
	assert.equal(I.withAlpha("rgb(21, 21, 23)", 0.34), "rgba(21, 21, 23, 0.34)");
	assert.equal(I.withAlpha("color-mix(in srgb, red, blue)", 0.3), "color-mix(in srgb, red, blue)");
});

test("面板识别：铺满且不透明的「非叶子」层也判 canvas（真机上就是它盖住了壁纸）", () => {
	const { frame, sidebar, main } = buildApp();
	/* 真机形态：布局根里有一个铺满视口、不透明、内部再套着各列面板的底色层。
	   elementFromPoint 命中的是面板而不是它自己，但它显然不是模态遮罩。 */
	const backdrop = document.createElement("div");
	backdrop._rect = { left: 0, top: 0, width: 1440, height: 900 };
	backdrop.style.setProperty("background-color", "rgb(21, 21, 23)");
	frame.appendChild(backdrop);
	backdrop.appendChild(sidebar);
	backdrop.appendChild(main);
	const { marked } = I.classifyFrameChildren();
	assert.equal(backdrop.dataset.wbg2, "canvas", "铺满不透明且内部只有面板的层必须让位给壁纸");
	assert.equal(sidebar.dataset.wbg2, "sidebar");
	assert.equal(main.dataset.wbg2, "panel");
	assert.equal(marked.filter((m) => m.kind === "canvas").length >= 2, true, "布局根自己也要被标成 canvas");
});

test("面板识别：布局根自己不透明时也要标 canvas（真机 .BynINW_frame 就是 rgb(27,27,28)）", () => {
	const { root, frame } = buildApp();
	frame._computed.backgroundColor = "rgb(27, 27, 28)";
	/* 真机里 root 与 frame 之间还有一层 wrapper，一起验证整条链 */
	const wrapper = document.createElement("div");
	wrapper._rect = { left: 0, top: 0, width: 1440, height: 900 };
	wrapper._computed.backgroundColor = "rgb(27, 27, 28)";
	root.appendChild(wrapper);
	wrapper.appendChild(frame);
	I.classifyFrameChildren();
	assert.equal(frame.dataset.wbg2, "canvas");
	assert.equal(wrapper.dataset.wbg2, "canvas");
	assert.equal(root.dataset.wbg2, void 0, "root 不在 frame 的祖先链上（它是 frame 的祖先的祖先）");
});

test("面板识别：铺满 + 命中的是后代 → overlay（模态遮罩保持不透明）", () => {
	const { frame } = buildApp();
	const scrim = document.createElement("div");
	scrim._rect = { left: 0, top: 0, width: 1440, height: 900 };
	scrim._computed.position = "fixed";
	scrim._computed.backgroundColor = "rgba(0, 0, 0, 0.5)";
	frame.appendChild(scrim);
	const dialog = document.createElement("div");
	dialog._rect = { left: 420, top: 250, width: 600, height: 400 };
	dialog._computed.backgroundColor = "rgb(40, 40, 44)";
	scrim.appendChild(dialog);
	I.classifyFrameChildren();
	assert.equal(scrim.dataset.wbg2, "overlay", "遮罩背后有模态内容 → overlay");
	assert.notEqual(dialog.dataset.wbg2, "canvas", "模态内部元素不应被当成画布");
});

test("面板识别：又宽又矮判为 bar（标题栏行）", () => {
	const { frame } = buildApp();
	const bar = document.createElement("div");
	bar._rect = { left: 0, top: 0, width: 1400, height: 40 };
	frame.appendChild(bar);
	I.classifyFrameChildren();
	assert.equal(bar.dataset.wbg2, "bar");
});

test("面板识别：标记是幂等的，且重扫会清掉过期标记", () => {
	const { frame, sidebar } = buildApp();
	I.classifyFrameChildren();
	assert.equal(sidebar.dataset.wbg2, "sidebar", "首轮应把侧边栏标成 sidebar");
	/* 侧边栏缩成 56px 控制栏 → 仍是 sidebar（窄+高） */
	sidebar._rect = { left: 0, top: 0, width: 56, height: 900 };
	I.classifyFrameChildren();
	assert.equal(sidebar.dataset.wbg2, "sidebar");
	/* 变成极小元素 → 不再被标记（过期标记必须被清掉） */
	sidebar._rect = { left: 0, top: 0, width: 1, height: 1 };
	I.classifyFrameChildren();
	assert.equal(sidebar.dataset.wbg2, void 0, "过期标记必须被清除");
	/* 剩下的标记没有重复堆积：画布层(canvas) + 主列(panel) */
	const all = frame.querySelectorAll("[data-wbg2]");
	assert.equal(all.length, 2, `标记数量应为 2，实际 ${all.length}`);
	assert.equal(all.filter((el) => el.dataset.wbg2 === "canvas").length, 1, "布局根应被标成 canvas");
	assert.equal(all.filter((el) => el.dataset.wbg2 === "panel").length, 1);
});

test("applyVisual：层与压暗层插到 body 最前，几何由注入样式表负责", () => {
	buildApp();
	const ctx = makeCtx({ ...I.DEFAULTS });
	api.apply(ctx);
	const layer = document.getElementById("dsh-web-bg-2-layer");
	const veil = document.getElementById("dsh-web-bg-2-veil");
	assert.ok(layer !== null, "壁纸层必须被创建");
	assert.ok(veil !== null, "压暗层必须被创建");
	assert.equal(document.body.children[0], layer, "壁纸层必须在 body 第一个（z-index:-2 之下）");
	assert.equal(document.body.children[1], veil);
	/* 固定铺满几何写在样式表里（比内联更抗 React 重渲染），内联只放随设置变化的值 */
	const css = document.querySelector('style[data-plugin-css]').textContent;
	assert.equal(css.includes("#dsh-web-bg-2-layer{position:fixed;inset:0;z-index:-2"), true, "壁纸层几何必须在样式表里");
	assert.equal(css.includes("#dsh-web-bg-2-veil{position:fixed;inset:0;z-index:-1"), true, "压暗层几何必须在样式表里");
	assert.equal(layer.style.opacity, "1");
	assert.equal(layer.style.backgroundImage.startsWith('url("data:image/svg+xml'), true);
});

test("applyVisual：开启时 html 带 canvas/panels 标记并写入三组 alpha 变量", () => {
	buildApp();
	/* 深色主题：官方令牌 --dsw-alias-bg-base = #151517（简写要去掉，这里是六位） */
	document.body.setAttribute("data-ds-dark-theme", "");
	document.body._computed.backgroundColor = "rgb(21, 21, 23)";
	api.apply(makeCtx({ ...I.DEFAULTS, translucency: 1, scope: "all" }));
	assert.equal(document.documentElement.getAttribute("data-wbg2-canvas"), "1");
	assert.equal(document.documentElement.getAttribute("data-wbg2-panels"), "1");
	const sidebarVar = document.documentElement.style.getPropertyValue("--dsh-bg-sidebar");
	const contentVar = document.documentElement.style.getPropertyValue("--dsh-bg-content");
	assert.match(sidebarVar, /^rgba\(21, 21, 23, 0\.\d+\)$/, sidebarVar);
	assert.match(contentVar, /^rgba\(21, 21, 23, 0\.\d+\)$/, contentVar);
	/* 通透强度 1 → 收敛到地板值，且绝不为 0 */
	const alpha = Number(/,\s*([\d.]+)\)$/.exec(sidebarVar)[1]);
	assert.ok(alpha > 0, "alpha 不能归零，否则文字直接压在照片上");
	assert.ok(alpha < 0.42, "通透后应比默认更透");
});

/** 从 `rgba(r, g, b, a)` 里取 alpha；不是该形式返回 null。 */
const alphaOf = (value) => {
	const m = /^rgba\([^)]*,\s*([0-9.]+)\)$/.exec(String(value));
	return m === null ? null : Number(m[1]);
};

test("applyVisual：scope=content 时侧边栏必须「不透出」（不透明底色），内容区按 alpha 透出", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS, scope: "content" }));
	const sidebar = document.documentElement.style.getPropertyValue("--dsh-bg-sidebar");
	const chrome = document.documentElement.style.getPropertyValue("--dsh-bg-chrome");
	const content = document.documentElement.style.getPropertyValue("--dsh-bg-content");
	/* 契约（用户报的 bug）：选了「仅内容区」就该只有内容区透出。
	   侧边栏与顶栏必须拿到**不透明**底色。
	   回归点：曾被写成 `transparent` —— 画布此时已是透明的，于是侧边栏整块透出壁纸，
	   正是"选了仅内容区、侧边栏却仍透出"的 bug。 */
	for (const [name, value] of [["侧边栏", sidebar], ["顶栏", chrome]]) {
		assert.notEqual(value, "transparent", `${name} 不得为 transparent（那会完全透出壁纸）`);
		assert.notEqual(value, "inherit", `${name} 不得为 inherit`);
		assert.equal(alphaOf(value), null, `${name} 不应是半透明色，实际 ${value}`);
		assert.match(value, /^(#([0-9a-f]{3}|[0-9a-f]{6})|rgb\()/i, `${name} 应为不透明底色，实际 ${value}`);
	}
	/* 内容区仍按 alpha 透出 */
	const aContent = alphaOf(content);
	assert.ok(aContent !== null && aContent > 0 && aContent < 1, `内容区应为半透明 rgba，实际 ${content}`);
	assert.equal(document.documentElement.getAttribute("data-wbg2-panels"), "1");

	/* 深色主题下同一契约成立 */
	buildApp();
	document.body.setAttribute("data-ds-dark-theme", "");
	document.body._computed.backgroundColor = "rgb(21, 21, 23)";
	api.apply(makeCtx({ ...I.DEFAULTS, scope: "content" }));
	const darkSidebar = document.documentElement.style.getPropertyValue("--dsh-bg-sidebar");
	assert.notEqual(darkSidebar, "transparent", "深色下侧边栏同样不得透明");
	assert.equal(alphaOf(darkSidebar), null, `深色下侧边栏应为不透明底色，实际 ${darkSidebar}`);
	assert.ok(alphaOf(document.documentElement.style.getPropertyValue("--dsh-bg-content")) !== null);
});

test("applyVisual：scope=off 时所有分组都必须是不透明主题底色（绝不透明）", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS, scope: "off" }));
	for (const key of ["sidebar", "content", "composer", "chrome"]) {
		const value = document.documentElement.style.getPropertyValue(`--dsh-bg-${key}`);
		assert.notEqual(value, "transparent", `${key} 在 scope=off 时不得透明`);
		assert.notEqual(value, "inherit", `${key} 在 scope=off 时不得用 inherit`);
		assert.ok(/^(#([0-9a-f]{3}|[0-9a-f]{6})|rgb\()/i.test(value), `${key} 应为不透明底色，实际 ${value}`);
	}
	/* 不透出 → 不应有 panels 标记（但 canvas 标记必须在，直角规则依赖它） */
	assert.equal(document.documentElement.getAttribute("data-wbg2-panels"), null);
	assert.equal(document.documentElement.getAttribute("data-wbg2-canvas"), "1");
});

test("applyVisual：scope=off 或 enabled=false 时不留任何透明化标记", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS, scope: "off" }));
	assert.equal(document.documentElement.getAttribute("data-wbg2-panels"), null);
	assert.equal(document.documentElement.getAttribute("data-wbg2-canvas"), "1", "壁纸仍在，只是面板不透出");
	api.apply(makeCtx({ ...I.DEFAULTS, enabled: false }));
	assert.equal(document.documentElement.getAttribute("data-wbg2-canvas"), null, "关闭背景后画布必须恢复主题底色");
	assert.equal(document.getElementById("dsh-web-bg-2-layer").style.display, "none");
});

test("applyVisual：纯色模式不设 backgroundImage，并写入 color", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS, kind: "color", color: "#123456" }));
	const layer = document.getElementById("dsh-web-bg-2-layer");
	assert.equal(layer.style.backgroundImage, "none");
	assert.equal(layer.style.backgroundColor, "#123456");
});

test("applyVisual：blur 落到壁纸层，压暗层按主题取色", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS, blur: 12, dim: 0.4 }));
	const layer = document.getElementById("dsh-web-bg-2-layer");
	const veil = document.getElementById("dsh-web-bg-2-veil");
	assert.equal(layer.style.filter, "blur(12px)");
	assert.equal(veil.style.background, "rgba(15, 17, 21, 0.3)", "浅色主题：冷灰且更克制");
	/* 切到深色主题：纯黑叠压暗值，且 blur=0 时不留 filter */
	document.body.setAttribute("data-ds-dark-theme", "");
	api.apply(makeCtx({ ...I.DEFAULTS, blur: 0, dim: 0.4 }));
	assert.equal(document.getElementById("dsh-web-bg-2-layer").style.filter, "none");
	assert.equal(document.getElementById("dsh-web-bg-2-veil").style.background, "rgba(0, 0, 0, 0.4)", "深色主题：纯黑叠压暗值");
	document.body.removeAttribute("data-ds-dark-theme");
});

test("样式表：注入一次且带插件标记（HMR 可清理）", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS }));
	api.apply(makeCtx({ ...I.DEFAULTS }));
	const tags = document.querySelectorAll('style[data-plugin-css]');
	assert.equal(tags.length, 1, "重复 apply 不应重复注入样式");
	assert.equal(tags[0].textContent.includes("--dsh-bg-content"), true);
	assert.equal(tags[0].textContent.includes("!important"), true, "透明化必须能压过官方令牌规则");
});

test("诊断：collectDiagnostics 产出结构、令牌与已生效值", () => {
	buildApp();
	document.body._computed.backgroundColor = "rgb(21, 21, 23)";
	api.apply(makeCtx({ ...I.DEFAULTS }));
	I.rescan();
	const report = I.collectDiagnostics();
	const rootEl = document.getElementById("root");
	for (const d of rootEl.querySelectorAll("div")) {
		const r = d.getBoundingClientRect();
	}
	assert.equal(Array.isArray(report.viewport), true);
	assert.equal(report.viewport[0], 1440);
	assert.equal(report.applied.canvasAttr, "1");
	assert.equal(report.applied.panelsAttr, "1");
	assert.equal(report.applied.sidebarVar.startsWith("rgba("), true);
	assert.ok(report.applied.marked.length >= 3, "应标记画布层/侧边栏/主列");
	assert.equal(report.frame !== null, true, "应识别到布局根");
	assert.equal(report.isTopFrame, true);
	assert.equal(Array.isArray(report.frameChildren), true);
	assert.equal(report.frameChildren.length, 3, "布局根应有 3 个子级（画布层/侧边栏/主列）");
	/* 命中测试：有 elementFromPoint 时应能定位"壁纸之上第一层实底"；
	   夹具没有该 API 时链为空也是合法形态（真机与浏览器夹具里已单独覆盖） */
	assert.equal(Array.isArray(report.points), true);
	assert.equal(report.points.length, 9, "命中测试点位应覆盖侧边栏/内容区/标题栏/内容列左上角/底部渐变等 9 处");
	assert.ok(Array.isArray(report.points[0].chain), "chain 必须是数组");
	if (report.points[0].chain.length > 0) {
		assert.ok(report.points[0].firstSolidAbove !== null, "有祖先链时必须能定位实底层");
	}
	/* 外侧祖先链：从 #root 走到 html，不能抛异常 */
	assert.ok(Array.isArray(report.outerChain) && report.outerChain.length >= 1, `outerChain 长度 ${report.outerChain?.length}`);
	assert.equal(report.outerChain[0].id, "root");
});

test("采纳宿主送来的设置：写入本地权威层并渲染（configForms 读不到时的唯一来源）", async () => {
	buildApp();
	const snapshot = { value: { ...I.DEFAULTS }, writable: true };
	const ctx = makeCtx({ ...I.DEFAULTS });
	ctx.configForms.get = () => ({
		getSnapshot: () => snapshot,
		subscribe: () => () => {},
		set: () => {},
		unset: () => {}
	});
	api.apply(ctx);
	/* 宿主从配置文件读到的真实值（含图片与视觉参数），随诊断响应送回 */
	const adopted = await I.adoptSeed({
		image: "data:image/jpeg;base64,AAAA",
		kind: "image",
		translucency: 0.6,
		scope: "all",
		dim: 0.25
	});
	for (const k of ["image", "kind", "translucency", "scope", "dim"]) {
		assert.ok(adopted.includes(k), `应采纳 ${k}`);
	}
	/* 关键：这些值必须进入 applyVisual 的最终覆盖层 ——
	   否则订阅回调拿默认值再跑一次就把用户的设置冲掉了 */
	const settings = I.lastSettings ?? (typeof I.getLastSettings === "function" ? I.getLastSettings() : null);
	if (settings !== null && settings !== void 0) {
		assert.equal(settings.image, "data:image/jpeg;base64,AAAA");
		assert.equal(settings.translucency, 0.6);
	}
	/* 第二次调用必须被忽略（一次会话只补一次） */
	assert.deepEqual(await I.adoptSeed({ image: "data:image/jpeg;base64,BBBB" }), []);
});

test("首次运行种子：用户已有自定义壁纸时绝不覆盖", async () => {
	buildApp();
	const setCalls = [];
	const existing = { ...I.DEFAULTS, image: "https://example.com/mine.jpg" };
	const ctx = makeCtx(existing);
	ctx.configForms.get = () => ({
		getSnapshot: () => ({ value: existing, writable: true }),
		subscribe: () => () => {},
		set: (key, value) => setCalls.push([key, value]),
		unset: () => {}
	});
	api.apply(ctx);
	assert.deepEqual(await I.adoptSeed({ image: "data:image/jpeg;base64,SEED" }), []);
	assert.equal(setCalls.length, 0, "不应写入任何设置");
});

test("首次运行种子：无种子或只读部署时不写入", async () => {
	buildApp();
	const setCalls = [];
	const ctx = makeCtx({ ...I.DEFAULTS });
	ctx.configForms.get = () => ({
		getSnapshot: () => ({ value: { ...I.DEFAULTS }, writable: false }),
		subscribe: () => () => {},
		set: (key, value) => setCalls.push([key, value]),
		unset: () => {}
	});
	api.apply(ctx);
	assert.deepEqual(await I.adoptSeed(null), []);
	assert.deepEqual(await I.adoptSeed({}), []);
	assert.deepEqual(await I.adoptSeed({ image: "data:image/png;base64,CCCC" }), [], "只读部署不得写入");
	assert.equal(setCalls.length, 0);
});

test("样式表：不得清零官方的圆角与投影（设计语言必须保留）", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS, scope: "all" }));
	const css = document.querySelector('style[data-plugin-css]').textContent;
	/* 用户明确要求：不启用背景时官方设计里卡片/按钮/输入框都是 R 角，
	   启用背景后也必须保持 —— 早期版本为了让壁纸"全部被遮挡"把圆角全清零，
	   那是改掉设计语言，已废弃。这里锁死：插件不得出现清零圆角/去投影的规则。 */
	const zeroRadius = css.split("\n").filter((line) => line.includes("border-radius:0!important"));
	assert.equal(zeroRadius.length, 1, `只允许"顶栏菜单"那一条直角规则，实际 ${zeroRadius.length} 条`);
	assert.ok(
		zeroRadius[0].includes("[data-windows-menu]"),
		`唯一允许的直角规则应只作用于顶栏菜单，实际：${zeroRadius[0].slice(0, 120)}`
	);
	assert.ok(
		!css.includes("box-shadow:none!important"),
		"不应有去投影规则：投影是卡片层次感的一部分"
	);
	assert.ok(
		!css.includes("--dsh-windows-content-radius:0px"),
		"不应再把官方的内容区圆角变量归零"
	);
});

test("面板识别：侧边栏折叠后，铺满整宽的内容列仍必须标 panel（不能标 overlay）", () => {
	/* 真机 bug：侧边栏一折叠，内容列 `BynINW_centerCol` 就变成整宽（1280 = 视口宽），
	   于是命中 `coversAll` 分支；又因为它内部有小控件（`onlyPanelLikeDescendants` 为假）
	   被判成 `overlay` —— 内容列拿不到 panel 标记、透明化规则匹配不到，
	   表现为"折叠侧边栏后内容区不再显示背景"。
	   判据修正：布局列在正常文档流里（static/relative），模态遮罩才是浮动定位。 */
	const { sidebar, main } = buildApp();
	/* 折叠：侧边栏宽度归零，内容列吃掉整宽 */
	sidebar._rect = { left: 0, top: 0, width: 0, height: 900 };
	main._rect = { left: 0, top: 0, width: 1440, height: 900 };
	main._computed.backgroundColor = "rgb(21, 21, 23)";
	/* 放一个小控件进内容列，模拟"后代里有小元素"（正是旧判据误判的原因） */
	const button = document.createElement("button");
	button._rect = { left: 20, top: 20, width: 40, height: 24 };
	button._computed.backgroundColor = "rgba(0, 0, 0, 0)";
	main.appendChild(button);

	const { marked } = I.classifyFrameChildren();
	const mainMark = main.dataset.wbg2;
	assert.equal(mainMark, "panel", `铺满整宽的内容列应标 panel，实际 ${mainMark}`);
	/* 反例保护：真正的模态遮罩（浮动定位 + 小控件）仍必须标 overlay */
	const modal = document.createElement("div");
	modal._rect = { left: 0, top: 0, width: 1440, height: 900 };
	modal._computed.backgroundColor = "rgb(0, 0, 0)";
	modal._computed.position = "fixed";
	modal._computed.zIndex = "1000";
	const modalBtn = document.createElement("button");
	modalBtn._rect = { left: 700, top: 400, width: 60, height: 30 };
	modalBtn._computed.backgroundColor = "rgba(0, 0, 0, 0)";
	modal.appendChild(modalBtn);
	main.parentElement.appendChild(modal);
	const again = I.classifyFrameChildren();
	assert.equal(modal.dataset.wbg2, "overlay", "浮动定位的模态遮罩仍应标 overlay");
	assert.equal(main.dataset.wbg2, "panel", "内容列在模态出现后仍应保持 panel");
	void marked;
	void again;
});

test("样式表：面板内的无差别中和规则仍须排除插件自身控件", () => {
	buildApp();
	api.apply(makeCtx({ ...I.DEFAULTS }));
	const css = document.querySelector('style[data-plugin-css]').textContent;
	/* 面板内"所有后代"这类规则会把插件自己的控件也一并中和（曾经把开关的胶囊圆角压平）。
	   凡是这类规则都必须带 :not([class*=wbg2]) 跳过自身控件。 */
	const blanket = css.split("\n").filter((line) => {
		const sel = line.slice(0, line.indexOf("{"));
		if (sel === "") return false;
		if (!/\[data-wbg2=(panel|sidebar|bar)\][^,{]*\*/.test(sel)) return false;
		return /background-color:transparent!important/.test(line);
	});
	assert.ok(blanket.length >= 1, `应存在面板内的无差别中和规则，实际 ${blanket.length}`);
	for (const line of blanket) {
		const sel = line.slice(0, line.indexOf("{"));
		assert.ok(
			sel.includes(":not([class*=wbg2])"),
			`无差别中和规则必须排除插件控件：${sel.slice(0, 120)}`
		);
	}
});

test("面板识别：只压平内容列的左上角，其余圆角必须保留", () => {
	buildApp();
	const { main } = buildApp();
	main._computed.borderTopLeftRadius = "16px";
	I.classifyFrameChildren();
	/* 官方只给内容列左上角留 16px 圆角（真机实测 radius = "16px 0px 0px"）。
	   那一个角在壁纸下会露亮边，所以只清它；其余圆角必须原样保留
	   （早期把面板所有圆角一起清零，等于改掉整个设计语言）。 */
	assert.equal(main.style.getPropertyValue("border-top-left-radius"), "0px", "内容列左上角应被压平");
	const touched = [...main.style._props.keys()].filter((k) => k.includes("radius"));
	assert.deepEqual(touched, ["border-top-left-radius"], `只应改动左上角，实际改了：${touched.join(", ")}`);
});

for (const [name, fn] of cases) {
	try {
		await fn();
		pass++;
		console.log(`  ok   ${name}`);
	} catch (error) {
		console.error(`  FAIL ${name}\n       ${error.message}`);
		process.exitCode = 1;
	}
}
console.log(`\n${pass}/${cases.length} 项断言通过`);















