# dsh-web-bg-2 — DSH 背景替换插件（第二版，面向官方桌面端）

给 DSH Web 界面（`dsh web`、以及官方 Windows 桌面端 `DeepSeek Harness.exe`）替换背景：
图片壁纸 / 纯色 + 壁纸浓度、压暗、模糊，**并且让侧边栏、标题栏、composer 一起透出壁纸**。

这一版是为官方桌面端 **0.2.0-rc.2** 重写的。第一版（`dsh-web-bg` 1.x）在浏览器端看着还行，
在官方桌面端会出现两个具体问题，本版就是针对它们改的架构。

## 维护须知（先读这几条，能省很多时间）

1. **验证界面效果时，不要靠"截图 + 坐标换算"**。窗口会被移动/缩放、DPR 不为 1、
   面板可能宽于窗口被裁切 —— 我为此浪费了大量轮次，还据错误坐标得出过错误结论。
   正确做法：让页面自己把**计算样式**报出来（`switchSamples` / `occluders` / `styleTag`），
   或者用**命中测试**判定几何（如开关圆角：在四角内侧 1px 做 `elementFromPoint`，
   四角落到元素外 = 圆角生效）。
2. **诊断要在"正确的时机"抓**。`sendDiagnostics` 是在设置变化后 800ms 发出的，
   那时设置面板往往已经关闭 —— 于是永远得到"找不到开关"。所以开关形状这类
   **只在面板打开时存在**的信息，必须在 `applyVisual`（用户点击的那一刻）抓取并缓存。
3. **诊断报告里绝不要写大块数据**。我曾把整个 base64 壁纸写进 `imageUrl`，
   把诊断文件撑到 **500MB+**（无法 `readFileSync`）。现在 `imageUrl` 只写"前缀 + 总长 + 类型"。
   读取超大文件用 `tools/tail-diagnostic.mjs`（只读尾部）。
4. **不要用用户截图判断"运行的是哪一版代码"**。截图可能是改动生效**之前**的画面，
   我因此连续多轮误判"改了没效果"（用户重启过、也发过图，但图是旧的）。
   正确做法：自己抓当前画面（`tools/burst-shots.mjs` 连拍 + 自动定位目标区域），
   或让页面就地报 DOM（`__wbg2Verify()` + `sendDiagnostics(true)`）。
5. **批量清理代码不要用正则**。我用 `[regex]::Replace` 清理探针时把整块探针连同
   周围代码一起删掉了（两次）。定点修改只用编辑工具；删除前先 `--check` + 数符号。
6. **这台机器上有一类"CSS 对官方元素不起作用"的现象**（见下节），
   遇到"选择器正确、计算样式却不对"时不要再换选择器，直接改走行内样式或 SVG。

---

## 〇、这台环境的一个硬事实：部分 CSS 对官方元素不生效

以下三件事都是**实测**（不是推测），它们决定了本插件某些部分的实现方式：

| 现象 | 证据 | 最终解法 |
|---|---|---|
| 自绘开关的 `border-radius` 不生效（始终显示方角） | 计算样式 `36×20 / radius:10px / 实心底色` **完全正确**，headless 渲染也正确，真机却是方角；`!important` 齐全、行内样式也试过 | 改用 **SVG 图形**（`<rect rx>` + `<circle>`）绘制，绕开 CSS 圆角 |
| 官方侧边栏行的悬停底在"透出"模式下不再绘制 | `rowInk` 探针：同一个 `hIlkoa_sessionRow.hIlkoa_selected`，`scope=off` 下 `bg=rgba(255,255,255,0.08)`，`scope=on` 下"无绘制"；把插件所有相关规则逐条停用都无法恢复 | 改用**行内样式 + 事件委托**（`style.setProperty(..., "important")` 无法被任何样式表压制） |
| 同上，先试过补 CSS 规则 | `hoverRule` 探针证明：规则在样式表里、选择器拼写正确、类名与标记都匹配，元素的 computed `background-color` 仍是 `rgba(0,0,0,0)` | 同上 |

**结论**：凡是要"给官方元素加视觉"的地方，优先用**行内样式**或 **SVG**，
不要依赖样式表匹配。

### 另一个必须记住的 CSS 陷阱：`filter` 会建立包含块

给面板加 `filter: drop-shadow(...)`（本意是填住圆角缝隙）之后，
官方那个 `position: fixed` 的**侧边栏折叠按钮**从"视口左上角"变成了"侧边栏左上角"，
于是**掉下来压在小胖鲸 logo 上**（用户实测发现）。
`filter` / `transform` / `perspective` / `will-change` 都会建立包含块，
**绝不要给含有官方 fixed 元素的容器加这类属性**。该规则现已默认关闭
（`noCornerFill` 门控）。

---

## 一、为什么重写：v1 在官方桌面端为什么不好看

先看清官方桌面端到底怎么跑页面（这些是实测得到的，不是推测）：

| 事实 | 来源 |
|---|---|
| 桌面端把 DSH 当普通 web 页面加载，页面跑在 `dsh-app://app/` 框架页**内部的 iframe** 里 | 宿主进程命令行 `…\dsh-desktop-host\lib\index.js … \profiles\desktop`；框架页 `assertMainApplication` 只认 `dsh-app://app/` |
| Windows 标题栏是 Electron `titleBarOverlay`（**高 40px、不透明**），页面改不动它 | `createWindow()` 里 `titleBarStyle:"hidden"` + `titleBarOverlay:{height:40,color:chromeFallbackFill()}` |
| 框架页会读页面里一个探测元素的**计算底色**，经 `windowsAppearance` IPC 同步给主进程 → 标题栏颜色跟随页面 | `preload-app.cjs`：`getComputedStyle(probe).backgroundColor` → `ipcRenderer.send(DESKTOP_IPC.windowsAppearance, …)` |
| 主题颜色只由一个样式表提供：`body{--dsw-alias-bg-base:#fff;…}` / `body[data-ds-dark-theme]{…:#151517}`，画布是 `body{background-color:var(--dsw-alias-bg-base)}` | `@deepseek-ai/dsh-client-ui-theme` 的 `design-platform.css` |
| 页面能拿到 `--dsh-frame-top-clearance`（Windows=标题栏高）等框架变量 | `dsh-client-ui-layout` 文档 |

v1 的做法是「把不透明的背景层挂进布局根内部，用负 z-index 躲到内容之下，再把铺满视口的
不透明元素中和成透明」。于是：

1. **壁纸出不了内容区**——侧边栏只有 264px 宽、标题栏只有 40px 高，都不满足 v1
   `isPageBackgroundCandidate` 的「占视口 ≥40%/60%」门槛，永远不会被透明化；
2. **标题栏与页面颜色不连**——标题栏用的是外壳的不透明填充色，和页面底色是两块颜色；
3. **整体发灰**——v1 把壁纸层自己设成 `opacity`（默认 0.35）与主题底色混合，壁纸被底色兑淡。

第 3 点在我们自己的复现页里能直接量出来（同一张内置壁纸、同一套官方令牌）：

| 做法 | 标题栏像素 | 侧边栏像素 | 内容区一行上的颜色数 |
|---|---|---|---|
| v1（层 opacity 0.5 + DOM 中和） | (27,27,28) | (21,21,23) | **1（完全平，壁纸没透出来）** |
| v2（窗口级壁纸 + 令牌 alpha） | (35,47,68) | (25,38,57) | **11（渐变真的透出来了）** |

复现页在 `dsh-web-bg/test/repro.html`（`?mode=old|new&theme=dark|light`），
截图在 `dsh-web-bg/test/screenshots/`。

---

## 二、v2 怎么做

一句话：**壁纸放到窗口级，透明由设计令牌的 alpha 表达。**

1. **壁纸是窗口级固定层**（`position:fixed; inset:0; z-index:-2`），在 body 最前，
   位于所有面板之下 → 侧边栏、标题栏、composer 天然都能透出它，不需要任何"中和"。
2. **画布让位**：`html[data-wbg2-canvas] body, html{background-color:transparent}`，
   把官方画布（`--dsw-alias-bg-base`）让开，否则壁纸会被它盖住。
3. **面板保留主题本色，只把 alpha 让出来**：
   `[data-wbg2=panel]{background-color:var(--dsh-bg-content)!important}`，其中
   `--dsh-bg-content` 由插件算成 `rgba(主题底色, alpha)`。深色面板 alpha 更大、浅色更小，
   `translucency` 控制强度，并留 `MIN_PANEL_FLOOR=0.35` 的地板值——**绝不会到 0**，
   文字不会直接压在照片上。
4. **面板靠几何识别，不写死 class**：官方 class 是构建期哈希（`_panel_1a2b3`），升级就会变。
   这里只依赖可验证事实：铺满视口且悬浮 → 弹层遮罩（**排除，不透明化**）；铺满但不悬浮 →
   画布层（让位）；又宽又矮 → 条；窄而高 → 侧边栏；其余 → 面板。标记写在 `data-wbg2` 上，
   `MutationObserver` 在 React 重渲染后重新贴上；样式表只按标记生效，标记没了规则自然失效。
5. **标题栏**：页面在 iframe 里，够不到 `windowsAppearance` 通道，改不了遮罩色。
   本版不去假装（v1 也没做到），而是让**页面顶部与面板同色**，让接缝在颜色上消失。
   若你在纯浏览器里用（没有外壳遮罩），这一项无影响。

设置项（「设置 → 通用 → 背景」）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | true | 总开关 |
| `kind` / `image` / `color` | image / 空 / `#1e293b` | 图片 URL、本地文件（≤4MB，转 data URL 持久化）或纯色 |
| `opacity` | 1 | **壁纸自身**浓度（1=原图）。注意与 v1 语义不同：v1 是"与底色混合的比例" |
| `dim` | 0.18 | 壁纸压暗：深色叠黑，浅色少量冷灰，保证正文对比度 |
| `blur` | 0 | 壁纸模糊 0–48px |
| `translucency` | 1 | 面板通透强度 0–100%（0=面板完全不透明） |
| `scope` | all | 透出范围：`all` 全窗口 / `content` 仅内容区 / `off` 不透出 |

设置持久化在 `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` 的 `web-bg-2` 条目里，重启不丢。

---

## 三、安装

```bat
node install.mjs                 :: 默认装进 $DSH_HOME/profiles/<DSH_PROFILE|desktop>
node install.mjs --profile web   :: 装到另一个 profile（例如浏览器版）
node install.mjs --dry-run       :: 只报告将要做什么
node install.mjs --uninstall     :: 移除挂载项并删除插件包
```

脚本做两件事：把 `lib/` 与 `package.json` 拷到 `<DSH_HOME>/profiles/node_modules/dsh-web-bg-2`
（先删后拷），并在目标 profile 的 `cordis.patch.yml` 追加一条
`- insert: - id: web-bg-2 / name: 'dsh-web-bg-2'`（已挂则跳过，原文件先备份为 `.bak-dsh-web-bg-2`）。

**重启**：新增客户端插件只在 DSH 启动时进入客户端模块表——

- 官方桌面端：完全退出 `DeepSeek Harness.exe` 再打开；
- 浏览器版：`Ctrl+C` 结束 `dsh web` 后重新运行。

之后改 `lib/` 里的文件走 client-hmr 热重载，不必再重启。

> 与 v1 并存：两版可以同时挂着（条目 id 不同），v1 的层会叠在 v2 壁纸之上。
> 想避免叠加，把 `cordis.patch.yml` 里的 `dsh-web-bg` 那段 `insert` 删掉再重启。

---

## 四、验证

```bat
node test\client-visual.test.mjs        :: 15 项：面板识别、透明化变量、主题、诊断（零依赖自带 DOM 夹具）
node ..\dsh-web-bg\test\panel-transparency.test.mjs   :: 19 项：颜色解析与 alpha 计算（含 #fff 简写坑）
powershell -ExecutionPolicy Bypass -File verify.ps1   :: 部署 + 运行态诊断校验
```

`verify.ps1` 的运行态部分读的是**插件自己落盘的诊断**（不需要 token）：客户端半端在首帧后
把真实 DOM 结构（布局根、每个子级的尺寸/底色/定位、框架变量、生效的 alpha 变量、面板标记）
POST 给 Host 半端，Host 写到会话工作目录下的 `.dsh-web-bg2-diagnostics.jsonl`。
所以只要页面重新加载过一次，`verify.ps1` 就能判断"壁纸是否真的全窗口可见、面板 alpha 是否真的小于 1"。
设置页里也有一个「上报诊断」按钮可随时补一次。

## 五、真机验证结果（0.2.0-rc.2 官方桌面端，2026-10-03）

插件重写后经过多轮真机校验，关键数据（诊断文件 `$DSH_HOME/.dsh-web-bg2-diagnostics.jsonl`）：

| 项 | 首轮（有 bug） | 修复后 |
|---|---|---|
| 布局根识别 | 选中了插件自己的全屏层（判为 `overlay`） | `div#root > div > div.BynINW_frame` ✓ |
| 面板底色 | `rgba(0, 0, 0, 0.147)`（一层黑纱） | **`rgba(21, 21, 23, 0.147)`**（主题本色 + alpha）✓ |
| 画布 | 布局根 `rgb(27,27,28)` 不透明，把壁纸整块盖死 | `rgba(0, 0, 0, 0)` 让位 ✓ |
| 面板识别 | —— | `sidebar` 280×782 / `panel` 1000×782 / `handle` 判为 `divider`（不透明化）✓ |
| 框架变量 | —— | `--dsh-frame-top-clearance: 40px`、`--dsh-window-titlebar-height: 40px` ✓ |

修复过程中被真机数据抓出来的三个真 bug（都已写进单元测试）：

1. **基色被自己的规则污染**：先让画布透明、再去读 `getComputedStyle(body).backgroundColor`，
   读到的是 `rgba(0, 0, 0, 0)`，于是所有面板算成"纯黑 + alpha"。
   现在优先读官方令牌 `--dsw-alias-bg-base`，读不到才退回计算值。
2. **`findFrame` 把自己打的标记当排除条件**：第一轮给布局根打了 `canvas` 标记，
   第二轮就把它跳过，导致透明化时好时坏。现在只按"谁真正装着面板"评分。
3. **布局根自己不透明**：`.BynINW_frame` 是 `rgb(27, 27, 28)` 且铺满视口，
   壁纸挂在它下面会被整块盖死；现在它与 `html`/`body` 一起被标记为 `canvas` 并让位。

> ⚠️ **不要与 v1（`dsh-web-bg`）同时挂载**：v1 的层挂在布局根内部（`z-index:-1`），
> 绘制顺序在本插件的窗口级壁纸（`z-index:-2`）之上，两层会叠加，且 v1 会让侧边栏仍是实底。
> 本仓库部署时已在 `desktop` profile 里停用 v1 的挂载项（原文件备份为 `.bak-keep-v1`，
> 想恢复就把那几行的 `# ` 去掉）。

---

## 六、已知限制与踩过的坑

### 三处显示问题的成因与修法（用户反馈 → 真机命中测试定位）

| 现象 | 成因（命中测试实证） | 修法 |
|---|---|---|
| 内容列左上出现「R 角」、像没盖住 | 官方布局文档写明「内容区仅左上角保留 16px 圆角」，面板没铺满的缺口让壁纸露出来 | 面板与其子级 `border-radius:0`，并把 `--dsh-windows-content-radius` 归零 |
| 底部两处渐变黑 | `RlGAzG_card`（712×98，`r=28px` + `box-shadow`）—— 卡片圆角与投影形成的渐变带 | 面板与其子级 `border-radius:0`；卡片底色改由 `--dsh-bg-*` 承担（不透明叠加，不再漏出渐变） |
| 菜单栏黑色区域与右侧窗口控制区高度不一致 | 外壳的 `titleBarOverlay` 是**透明**的，而页面顶部那条（`[data-windows-menu]` 所在的 40px）自己不画底色 → 窗口透明区直接透出桌面 | 新增窗口级 **chrome 带**：`top:0`、高度取 `--dsh-frame-top-clearance`、与面板同色、`z-index:-1`，压在页面内容之下、外壳遮罩之下 |

> 注：`[data-windows-titlebar]` 是挂在 **`<html>`** 上的无值属性，不是一个可上色的「条」，
> 所以不能用它做选择器去染色。

### 底部渐变黑的真凶（paintProbe 实锤）

用户反馈"窗口底部两处渐变黑不要漏出背景"。前几轮我按"面板底色/圆角/投影"去猜，都没解决；
最后给插件加了 `paintProbe`（把窗口下半部**所有在画东西**的元素的
`background / background-image / box-shadow / mask / radius / overflow` 一次性报出来），一击命中：

| 元素 | 画的东西 |
|---|---|
| `Dc7zOa_composerSeat`（993×128，z=7） | `linear-gradient(color(srgb 0 0 0 / 0) 0px, rgb(21, 21, 23) 36px)` ← **就是那两处渐变黑** |
| `_9lTDKa_fade`（侧边栏滚动渐隐） | `linear-gradient(rgba(0,0,0,0), rgb(27,27,28))` |
| `_emptyTabHost`（576×782） | 不透明 `rgb(21,21,23)`，会整块盖住壁纸 |

三处都不是"面板底色"，而是官方为可读性加的修饰层（让 composer/列表浮起来），在壁纸场景下应当让位：

```css
html[data-wbg2-panels] [class*=composerSeat],
html[data-wbg2-panels] [class*=fade],
html[data-wbg2-panels] [class*=emptyTabHost]{background-image:none!important;background-color:transparent!important}
```

修后实测：窗口底部 200px 逐段采样，会话列 `(28,120,57)` 与侧边栏 `(29,122,57)` **同色**，无暗段。

### 顶栏那 40px：插件无法修复（用换色对照实验定死的）

| 壁纸 | 顶部 40px | 页面内容 |
|---|---|---|
| 绿色 | `(28,29,30)` | `(28,84,45)` |
| 纯白 | `(27,27,28)` | `(161,161,162)` |

**页面从绿变白，顶部 40px 纹丝不动** —— 它是外壳 `titleBarOverlay`（窗口级），不在页面里。
我为此写过一条"顶栏 chrome 带"（`z-index:-1`、高度取 `--dsh-frame-top-clearance`、与面板同色），
三次测量都毫无效果（被遮罩完全覆盖），**已按用户要求撤掉**。要改它只能改官方 `app.asar` 的主进程参数。

> 方法论教训：前几轮我用"屏幕抓取 + 逐像素扫描"判断，而窗口在屏幕上会移动、抓取有偏移，
> 几次读出互相矛盾的数字并据此改错了参数。真正定死问题的两个手段是
> **①换色对照实验**（变量法）和 **②让页面自己把绘制属性报出来**（`paintProbe`/`analyzePoint`）。


### 标题栏遮罩色改不了（机制层确认）

Windows 主窗口用 Electron `titleBarOverlay { height: 40 }` 绘制遮罩；外壳框架页会从自己的
探测元素读底色、经 `windowsAppearance` IPC 调 `setTitleBarOverlay`，但主进程只接受来自
`dsh-app://app/` 主框架的调用，而 preload **没有**把 `electron`/`ipcRenderer` 暴露进页面
（实测 `exposeInMainWorld("electron")` 0 处）。插件能做的是让页面在那一段自己画上底色——
也就是上面那条 chrome 带，这样窗口透明区不再露出桌面。


### 最致命的一刀：**半透明底色绝不能在每一层后代上重复施加**

现象：重启后 `::before` 已中和，壁纸**仍然**完全不显示。
`occluders` 探针给出决定性数据 —— 同一坐标上的 15 层 `div` **每一层**都是
`bg=rgba(21, 21, 23, 0.38)`。半透明色叠 15 层，等效不透明度
`1 - 0.62^15 ≈ 99.9%`，壁纸被彻底盖死。

成因是我一度把「面板内所有后代」的规则从 `transparent` 改成
`background-color: var(--dsh-bg-*, inherit)`（本意是让"被排除的分组恢复原样"），
结果每一层嵌套容器都各自涂了一遍分组色。修法要分清三类：

| 目标 | 规则 |
|---|---|
| 面板自身 | `background-color: var(--dsh-bg-<组>, inherit)`（值由 applyVisual 写） |
| 真正画底色的 `surface` | `background-color: var(--dsh-bg-surface, transparent)` |
| **其余纯容器** | `background-color: transparent` ← 必须是 transparent |

> 半透明色只能施加在「负责画底色的那一层」上。铺到所有后代 → 指数级叠加成实底；
> 一个都不铺 → 面板穿帮。必须在 `surface` 这一层收口。

### 最隐蔽的一个：**伪元素**把壁纸整块盖住

现象：诊断里一切正常（面板变量是半透明、标记齐全、样式表已注入且内容最新、
全窗扫描**找不到任何不透明元素**、`elementsFromPoint` 前 10 个元素底色全是透明），
但截图实测每个取样点都恒定等于主题底色 —— 壁纸完全没有渲染。

根因靠 `occluders` 探针拿到（沿祖先链**逐层**读取，并额外读 `::before` / `::after`）：

```
div  bg=rgba(0,0,0,0)   ::before=rgb(27, 27, 28)   ★   ← 就是它
```

`BynINW_frame` 自身的 `background-color` 已经被中和成透明了，
**但它有一个 `::before` 伪元素在画不透明的 `rgb(27,27,28)`，且铺满整个窗口**
（大概率是官方给窗口圆角/阴影做的底色）。伪元素不是元素，
`[data-wbg2=canvas]` 这类选择器**永远匹配不到它**，所以之前所有规则都放它过去了。

修法：

```css
html[data-wbg2-canvas] [data-wbg2=canvas]::before,
html[data-wbg2-canvas] [data-wbg2=canvas]::after{
	background-color:transparent!important;background-image:none!important
}
```

> 不要顺手清 `content`：有些图标/分隔线是靠伪元素 `content` 画的。

### 顶栏为什么必须由页面自己画一条

壁纸在整窗铺开之后，顶栏一度出现**"左深右亮"的分段**：
放大截图能看到一条明确的分界线，大约在 x≈150（正好是菜单项的宽度）。

实测（横向六段平均色）：

| 菜单区 | 文字区 | 中左 | 中右 | 窗口控制区 | 最右 |
|---|---|---|---|---|---|
| `(36,37,40)` | `(29,29,31)` | `(21,22,24)` | `(21,22,24)` | `(21,22,24)` | `(21,22,24)` |

成因：外壳的 `titleBarOverlay` **只在菜单那一段**叠了一层暗色，其余段不管。
页面改不了外壳遮罩，所以反过来让页面把同一暗色画在这 40px 上，
遮罩叠上去之后整条就均匀了（修后极差 19，最大偏差只在菜单段）。

实现要点：顶部 40px 实际命中的是布局根 `BynINW_frame`，所以用
**"顶部实色、其余透明"的渐变背景**画在布局根上：

```css
html[data-wbg2-canvas] [data-wbg2=canvas]{
	background-image:linear-gradient(to bottom,
		var(--dsh-bg-titlebar) 0,
		var(--dsh-bg-titlebar) var(--dsh-frame-chrome-top,40px),
		transparent var(--dsh-frame-chrome-top,40px))!important;
	background-repeat:no-repeat!important
}
```

> 别用 `[data-windows-titlebar]` 当选择器 —— 它是挂在 `<html>` 上的**无值属性**，
> 不是元素，写了也匹配不到任何东西。
> 教训：**"清背景"必须把伪元素算进去**；只遍历元素是查不出来的。

#### 顶栏色必须**完全不透明**，且等于**外壳按钮底色**（不是主题底色）

用户先后报过两次："顶栏颜色和窗口控制器的颜色不一致" → 修完又说"偏暗，控制按钮有些发灰"。
两次的根因不同，都值得记：

1. **第一次：透明度。** 我写的是 `rgba(21,21,23,0.92)` —— 8% 透明度让底下的照片透出来，
   而外壳按钮那块是纯色 → 可见色差。必须写成不透明色。
2. **第二次：取错了基准色。** 我按主题变量取了 `rgb(21,21,23)`，但**外壳给窗口控制按钮
   画的那块底色是 `rgb(27, 27, 28)`**（比主题底色亮 6 个色阶）。
   于是页面这条比按钮区暗 6 阶 —— 肉眼就是"顶栏偏暗、按钮发灰"。

**`rgb(27,27,28)` 这个值是从用户发来的截图里量出来的**，不是猜的。
定位过程中还有个坑：那三个控制按钮由外壳**单独合成**，它们的图形像素
**根本不在窗口位图里**（我自己的截图在控制区取不到任何按钮像素、背景完全均匀无突变点），
所以"我量出来一致"不等于"用户看着一致" —— **用户截图才是这类问题的权威数据源**。

修后实测（我这边）：

| 顶栏中部 | 顶栏右部 | 窗口控制区 |
|---|---|---|
| `(27,27,28)` | `(27,27,28)` | `(27,27,28)` |

与用户截图里外壳按钮区的 `(27,27,28)` 完全一致。
（左侧菜单/标题文字那两段仍会比这亮一些，来自外壳额外叠的遮罩，**页面无法影响**。）

### 排查这类问题该用什么顺序（避免再走弯路）

1. **先看客户端跑的是不是最新代码**：页面上若残留已删代码写入的标记
   （例如 `data-wbg2-chrome`），说明 HMR 已滞后，后面所有测量都不可信 → 先重启。
2. `styleTag` 自检：确认 `<style data-plugin-css>` 存在且内容与源码一致。
3. `occluders`：沿祖先链读**每个元素**的底色/背景图/混合模式 + **伪元素**底色。
4. 截图取样与"照片同位置颜色"做**相关性**判断（而不是只看亮度阈值）。
5. 用纯色（如亮红）替换壁纸做对照 —— 排除图片解码因素。

### 侧边栏折叠后内容区不再显示背景（几何启发式的边界情况）

现象：把侧边栏折叠起来，内容区立刻变成实底、壁纸不再透出。

诊断数据（折叠瞬间）：

```
BynINW_sidebarCol   0x40x0x782        ← 宽度归零
BynINW_centerCol    0x40x1280x782     ← 内容列吃掉整宽（= 视口宽 1280）
标记结果: centerCol → overlay          ← 错在这里
```

根因：内容列宽度达到视口 92% 以上，命中 `coversAll` 分支 —— 那个分支本来是用来
识别「弹层遮罩」的，判据是"内部有小控件就当遮罩"。内容列的聊天区全是小控件，
于是被判成 `overlay`，拿不到 `panel` 标记 → 透明化规则匹配不到 → 内容区变实底。

**判据修正**：布局列与模态遮罩有可靠区别 —— **布局列在正常文档流里**
（`position: static/relative` 且 `z-index: auto/0`），**模态遮罩一定是浮动定位**
（`fixed`/`absolute`，通常还带 z-index）。

```js
if (looksLikeLayoutColumn(el)) {
	kind = isOpaque(cs.backgroundColor) && (hit === el || onlyPanelLikeDescendants(el, vw, vh)) ? "canvas" : "panel";
} else {
	kind = isOpaque(cs.backgroundColor) && (hit === el || onlyPanelLikeDescendants(el, vw, vh)) ? "canvas" : "overlay";
}
```

修后实测：`BynINW_centerCol` → `panel`，底色 `rgba(21,21,23, 0.38)`，壁纸正常透出。
回归测试同时锁住两个方向：**铺满整宽的静态列必须是 `panel`**，
而**浮动定位 + 小控件的模态仍必须是 `overlay`**（避免修一边坏一边）。

### 两个「门控挂错」造成的 bug（都由用户实测发现）

**① `scope=off` 时 R 角复活**：圆角/投影归零的规则我一开头挂在 `[data-wbg2-panels]`
（=面板是否透明）下，而 `scope=off` 时该标记不设置 → 关掉透出后 R 角又露出来。
但圆角属于**「壁纸是否生效」**，应当挂 `[data-wbg2-canvas]`。现已改正，
并加了回归断言：`scope=off` 时 `panels` 必须为空、`canvas` 必须为 1，
且样式中必须存在挂在 `canvas` 门控下的 `border-radius:0` 规则。

**② `scope=仅内容区` 时侧边栏仍然透出**（用户报的 bug，已修）：我把「被排除的分组」的变量
写成了 `transparent`，再叠加「面板内所有后代 `background-color: transparent !important`」这一刀，
侧边栏就变成**完全透明**——壁纸原样透过，比带 α 底色的内容区还亮。

正确语义是：**被排除的分组要「真正不透出」**。注意光写 `inherit` 也不够——画布已被插件改成
透明了，分组自己也透明就会露出壁纸；必须给一个**不透明的底色**：

```js
/* 系数为 0（被 scope 排除）→ 取不透明主题底色；否则按 alpha 透出 */
style.setProperty(`--dsh-bg-${key}`, factor === 0 ? base : withAlpha(base, alpha));
```

修后实测：`scope=content` → 侧边栏 `#151517` / 标记 `rgb(21,21,23)`（不透明实底）、
内容区 `rgba(21,21,23, 0.382)`（透出壁纸）。
截图可见侧边栏是实底、只有内容区露出照片。

> 这条曾被两次改反（先 `transparent`、后 `inherit`），所以现在由测试用例
> `scope=content 时侧边栏必须「不透出」` 明确锁定：该分组的变量必须是**不透明**颜色，
> 且不得为 `transparent` / `inherit` / 任何 `rgba(...)`。

### 透明化必须是「面板内所有后代」这一刀

由真机命中测试（`analyzePoint`）确定：挡光的实底画在
`sidebarCol > div > div._2H3hWW_root`（alpha=1）与 `centerCol > div > div > div.Dc7zOa_root`（alpha=1）
上，它们是面板的**深层后代**——只透明化「面板自身」或「直接子级」都够不到，壁纸就出不来。

### 但绝不能连 `background-image` 一起清

早期版本在让开底色的同时把 `background-image: none` 也加上，结果**误伤了强调色底图**
（真机表现为会话标签左侧凭空多出一条蓝色竖条）。现在只清 `background-color`。

### 设置行的控件样式必须提权

`ui-theme` 的样式表是运行期**后注入**的，同优先级下后来者胜，会把插件自绘控件的外观盖掉。
真机现象：`aria-pressed=true` 与 `false` 长得一模一样，于是「背景已开启」看起来像关闭。
控件选择器统一加 `button.` 前缀 + `!important` 后正常。

### 壁纸优先用文件路径，而不是 1.4MB 的 data URL

用户原来那张图刚好 1.000 MiB（1398127 字符 base64）。塞进设置值系统能用，但每次设置回写 /
安装都要搬运 1.4MB 文本，profile 也臃肿。现在照片保存在 `$DSH_HOME/web-bg-2/wallpaper.jpg`
（quality=82 重压到 494 KiB，平均像素差 0.18），配置里存 `file:///` 路径——桌面端实测可正常加载。

### `install.mjs` 的幂等判定（曾经写坏过）

早期用 `text.includes("name: 'dsh-web-bg-2'")` 判断「是否已挂载」——**配置条目** `- id: web-bg-2`
那段里也有同样文本，判定与写入不一致，真机被重复追加成三份。现在按行扫描
`- insert:` → `- id: web-bg-2` → `name:`（引号可有可无）三行连续的形状；连跑四次都正确跳过。

### 其余限制

- **面板识别是几何启发式**：官方大改布局时分类可能退化。诊断文件里带 `marked`、`paintedTree`、
  命中测试 `points`（含「壁纸之上第一层实底」）与外侧祖先链，按它调门槛即可。
- `MIN_PANEL_FLOOR = 0.85`：通透强度拉满时面板仍保留 85% 的底色 alpha。
- 出厂默认按选定的 **B 档**：`translucency 0.6` / `dim 0.25` / `scope all`。

### 维护提醒：清理探针代码时千万别用「行区间批量删除」

我为了把排查用的探针删掉，连续三次用"按行区间删除"的脚本改 `lib/client.js`，
每次都**误删了相邻的正常函数**（`sendDiagnostics`、`colorAlpha` 的函数体被切掉一半），
而 `node --check` 与"关键符号清点"都**没能拦住**——语法仍然合法、符号也还在，
只是函数体残缺或消失。最后只能整份回滚到已验证备份重做。

结论：这类清理要么用精确的文本替换（`edit` 工具，逐处、每处都能看 diff），
要么就**别清**。探针留着只多几 KB，删坏了要多花几轮才能恢复。
`tools/` 下留有当时写的一次性脚本（`read-diagnostic.mjs`、`inventory.mjs`、`pick-backup.mjs` 等），
它们只读诊断或备份，不影响运行；`strip-probes.mjs` / `trim-probes.mjs` /
`remove-dead-functions.mjs` 是**失败的那三个**，保留仅作反面参考，不建议再跑。




