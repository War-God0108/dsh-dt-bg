# dsh-dt-bg 安装指南（给使用者）

给 DSH 界面换上图片壁纸或纯色背景，并让**侧边栏、内容区、输入框一起透出壁纸**。

支持官方 Windows 桌面端（`DeepSeek Harness.exe`，0.2.0-rc.2）与 `dsh web`。

---

## 一、最省事：在 DSH 界面里安装（推荐）

DSH 自带的插件管理器支持从 **npm 包名 / `.tgz` 安装包 / git 仓库 / 本地目录** 安装。

### 情况 A：已经拿到 `.tgz` 文件

### 情况 A：已经拿到 `.tgz` 文件

从 [Releases 页面](https://github.com/War-God0108/dsh-dt-bg/releases/latest) 下载
`dsh-dt-bg-2.0.0.tgz`，然后：

1. 把它放到任意目录，例如 `D:\dsh-plugins\`
2. 打开 DSH →「设置」→「内置插件」→ 找到安装/添加插件的输入框
3. 填入该文件的**绝对路径**（注意是绝对路径）：

   ```
   D:\dsh-plugins\dsh-dt-bg-2.0.0.tgz
   ```

4. 确认安装，然后**重启 DSH**

> 插件包自带 `dsh.bundle.patch`，安装完成后会被**自动挂载**，不需要手工改任何配置。

### 情况 B：插件已发布到 npm

在同一个输入框里直接填包名：

```
dsh-dt-bg
```

### 情况 C：从 git 仓库安装

```
https://github.com/War-God0108/dsh-dt-bg.git
```

---

## 二、命令行安装（适合会敲命令的人）

需要 DSH 自带的 Node（`$DSH_HOME/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node.exe`）
或系统里任意 Node 20+。

```bash
# 在本包解压后的目录里执行
node install.mjs

# 指定 profile（默认 desktop；web 端用 web）
node install.mjs --profile web

# 只想看看会做什么
node install.mjs --dry-run

# 卸载（移除挂载条目 + 删除插件文件）
node install.mjs --uninstall
```

脚本做两件事（幂等，重复执行安全）：

1. 把插件部署到 `$DSH_HOME/profiles/node_modules/dsh-dt-bg`
2. 在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 里写入挂载条目（已存在则跳过，并自动备份原配置）

装完**重启 DSH** 生效。

---

## 三、装好之后怎么用

打开「设置 →通用设置」，会看到「背景」这一组：

| 项 | 说明 |
|---|---|
| **背景** | 开关。关掉即恢复 DSH 原样外观 |
| **类型** | `图片` / `纯色` |
| **图片** | 贴图片地址，或点「选择文件」挑一张本地图（≤4MB），或点「内置默认」 |
| **壁纸浓度** | 壁纸整体不透明度 |
| **压暗** | 压暗层强度，字看不清就调高 |
| **模糊** | 壁纸模糊程度（0~；想弱化背景细节时用） |
| **通透强度** | 面板让出多少底色：越高越透，壁纸越明显 |
| **透出范围** | `全窗口` / `仅内容区`（侧边栏保持实底）/ `不透出`（面板不透，壁纸仍在） |

底部另有「恢复默认」与「上报诊断」（排查问题时用）。

---

## 四、常见问题

**装完没反应？**
必须**完全退出并重启** DSH。客户端插件只在启动时进入模块表。

**壁纸不显示／面板是一块实底？**
先确认「背景」开关是开的；再把「通透强度」调高。若仍不行，点「上报诊断」，报告会写到
`$DSH_HOME/.dsh-web-bg2-diagnostics.jsonl`，把它给作者。

**图片选了没生效？**
图片以 data URL 存进 profile 配置（`cordis.patch.yml`），会明显增大该文件（每 MB 图片约 1.4MB 文本）。
建议先把图片压到 1MB 以内再选。

**想彻底恢复原样？**
设置里关掉「背景」开关即可（面板恢复不透明）；或执行 `node install.mjs --uninstall` 并重启。

---

## 五、卸载

```bash
node install.mjs --uninstall
```

然后重启 DSH。若要连插件文件一起删干净，删掉
`$DSH_HOME/profiles/node_modules/dsh-dt-bg` 目录即可。

---

## 六、给打包者：如何生成分发包

```bash
node tools/build-dist.mjs          # 生成 dist/dsh-dt-bg-<version>.tgz
node tools/verify-dist.mjs         # 在隔离沙箱里验证：安装 → 幂等 → 卸载
```

`build-dist.mjs` 只收运行时需要的文件（`lib/`、`package.json`、`cordis.patch.yml`、`install.mjs`、`README.md`），
不会把 `test/`、`tools/`、快照之类打进去。

要发布到 npm，把 `package.json` 里的 `repository.url` 换成自己的仓库地址，然后：

```bash
cd dist/stage && pnpm publish --access public
```
