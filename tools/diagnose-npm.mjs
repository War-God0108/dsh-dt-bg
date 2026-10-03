/**
 * npm 可达性诊断：区分"发布接口"与"官网页面"的连通性，
 * 用于判断"注册不了"到底是网络问题还是 npm 风控。
 *
 * 用法：node tools/diagnose-npm.mjs
 */
const PROBES = [
	["registry.npmjs.org（发布与安装走这里）", "https://registry.npmjs.org/"],
	["registry 包信息接口", "https://registry.npmjs.org/dsh-dt-bg"],
	["registry 搜索接口", "https://registry.npmjs.org/-/v1/search?text=dsh"],
	["www.npmjs.com（注册/登录/令牌页面）", "https://www.npmjs.com/"],
	["www.npmjs.com 注册页", "https://www.npmjs.com/signup"]
];

console.log("npm 连通性诊断\n");
for (const [label, url] of PROBES) {
	try {
		const res = await fetch(url, { method: "GET", redirect: "follow" });
		/* registry 对不存在的包返回 404 —— 那是**正常**的，说明接口通 */
		const note = res.status === 404 && url.includes("registry.npmjs.org/") ? "  ← 正常（包名未占用）" : "";
		console.log(`  HTTP ${String(res.status).padEnd(4)} ${label}${note}`);
	} catch (error) {
		console.log(`  失败   ${label}\n         ${String(error.message).split("\n")[0]}`);
	}
}

console.log(`
结论怎么读：
  - registry 可达、官网 403  → 环境能发布，但**无法在网页上注册/登录收令牌**（Cloudflare 风控拦 IP）
  - 两者都不可达             → 纯网络问题，换网络即可
  - 两者都可达               → 那就是浏览器/插件问题，换浏览器再试
`);
