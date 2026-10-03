/**
 * 真实浏览器验证：在 headless Chrome/Edge 里加载插件真实 bundle，
 * 用官方令牌样式表计算层叠、透明化与还原行为，并把断言结果 POST 回来。
 *
 * 页面由本进程自己托管（http://127.0.0.1:<port>），与回传端点同源——
 * file:// 页面向 127.0.0.1 发请求会被 Chrome 的私网访问策略拦掉。
 *
 * 运行：node test\browser.test.mjs
 * 退出码：0 = 全部通过，1 = 有断言失败或浏览器没回报。
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(here); // dsh-dt-bg/
const REPO = dirname(ROOT); // 工作区根（官方令牌样式表在 dsh-web-bg/test 下）

const BROWSERS = [
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];
const browser = BROWSERS.find((p) => existsSync(p));
if (browser === void 0) {
	console.error("找不到 Chrome/Edge，跳过真实浏览器验证");
	process.exit(0);
}

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8"
};

const received = [];
const server = createServer((req, res) => {
	if (req.method === "POST" && req.url === "/report") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			try {
				received.push(JSON.parse(body));
			} catch { /* 忽略坏包 */ }
			res.writeHead(204).end();
		});
		return;
	}
	/* 静态托管：/fixture/... 指向插件目录，/repo/... 指向工作区根，避免暴露整个工作区 */
	const url = new URL(req.url, "http://127.0.0.1");
	let file;
	if (url.pathname.startsWith("/fixture/")) file = join(ROOT, normalize(url.pathname.slice("/fixture/".length)));
	else if (url.pathname.startsWith("/repo/")) file = join(REPO, normalize(url.pathname.slice("/repo/".length)));
	if (file === void 0 || !existsSync(file)) {
		res.writeHead(404).end("not found");
		return;
	}
	res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
	res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
console.log(`真实浏览器验证 @ ${browser}`);
console.log(`夹具地址: ${base}/fixture/test/fixture.html\n`);

const url = `${base}/fixture/test/fixture.html?auto=1&report=${port}`;
const child = spawn(browser, [
	"--headless=new",
	"--disable-gpu",
	"--hide-scrollbars",
	"--no-first-run",
	"--no-default-browser-check",
	"--window-size=1440,900",
	url
], { stdio: "ignore" });

const deadline = Date.now() + 45_000;
let report = null;
while (Date.now() < deadline && received.length === 0) {
	await new Promise((resolve) => setTimeout(resolve, 400));
}
if (received.length > 0) report = received[0];
child.kill();

if (report === null) {
	console.error("浏览器没有回报结果（页面可能报错）。可手动打开 fixture 看控制台：");
	console.error(`  ${pathToFileURL(FIXTURE).href}?auto=1`);
	server.close();
	process.exit(1);
}

let failed = 0;
for (const item of report.results) {
	const line = `  ${item.ok ? "ok  " : "FAIL"} ${item.name}${item.detail ? `   [${item.detail}]` : ""}`;
	if (item.ok) console.log(line);
	else {
		failed++;
		console.error(line);
	}
}
console.log(`\n真实浏览器：${report.passed}/${report.total} 项断言通过`);
server.close();
process.exit(failed === 0 ? 0 : 1);
