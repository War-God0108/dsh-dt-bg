# 发布到 npm：你要做的只有注册 + 点一次授权

包已经准备好放在 `dist/stage/`（包名 `dsh-dt-bg`、版本 `2.0.0`）。
因为 `dsh-dt-bg` 这个名字在 npm 上**还没被占用**，谁先发布谁得到 —— 建议尽快注册。

---

## 第一步：注册 npm 账号（约 3 分钟，免费）

1. 打开 https://www.npmjs.com/signup
2. 填写：用户名、邮箱、密码
   - 用户名建议用 `War-God0108`（和你 GitHub 一致，便于别人认）
   - 邮箱要能收信，后面要验证
3. 去邮箱点验证链接
4. （建议）在这个页面开启两步验证：https://www.npmjs.com/settings/~/profile
   - npm 现在对新账号发布有安全要求，开启 2FA 能少踩坑

> 注册时如果提示用户名已被占用，换一个即可 —— npm 用户名和包名是两回事，
> 包名只要是 `dsh-dt-bg` 没被占用就行（已验证未占用）。

---

## 第二步：让命令行登录（二选一）

### 方式 A：网页授权（简单）

在终端执行：

```bat
npm login --auth-type=web
```

它会打印一个 `https://www.npmjs.com/login?next=/login/cli/...` 链接（也可能自动打开浏览器）。
**在浏览器里登录并点 Authorize**，终端会显示 `Logged in as <你的用户名>`。

### 方式 B：用 Access Token（网页授权失败时用）

1. 打开 https://www.npmjs.com/settings/~/tokens
2. 点 **Generate New Token** → 选 **Classic Token** → 类型选 **Automation**（或 Publish）
3. 复制生成的 token（形如 `npm_xxxxxxxx`），然后执行：

```bat
npm config set //registry.npmjs.org/:_authToken=npm_你的token
```

> Token 等于密码，不要发给我、不要提交进 git。

---

## 第三步：发布

```bat
cd "E:\Agent projects\Deepseek Harness\dsh-web-bg-2"
node tools/publish-npm.mjs
```

这个脚本会：核对包名版本 → 检查登录状态 → 打包 → 发布 → 验证线上可查。

---

## 发布成功后

别人就能在 DSH 的「设置 → 内置插件」里**直接填包名**安装：

```
dsh-dt-bg
```

比下载 `.tgz` 方便。同时建议把这个包名同步到 README 的安装说明里
（脚本会提示你哪几行需要改）。
