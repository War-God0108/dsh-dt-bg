/**
 * 在两种 scope 下各触发一次上报，便于对比 rowInk（工作区行/会话行的绘制）。
 * 用法：node tools/poke-scopes.mjs
 */
import { execFileSync } from "node:child_process";
import { DSH_HOME, homedir, resolveDshModules } from "./paths.mjs";

const YAML = join(resolveDshModules(), "..", "yaml");
const CONFIG = join(DSH_HOME, "profiles", "desktop", "cordis.patch.yml");
const node = process.execPath;

function setConfig(patch) {
	const code = `
const fs=require('fs');const Y=require(${JSON.stringify(YAML)});
const f=${JSON.stringify(CONFIG)};
const d=Y.parse(fs.readFileSync(f,'utf8'));
const e=d.find(x=>x&&x.id==='web-bg-2');
e.config={...e.config, ...${JSON.stringify(patch)}};
fs.writeFileSync(f,Y.stringify(d,{lineWidth:0}),'utf8');
`;
	execFileSync(node, ["-e", code], { stdio: "pipe", timeout: 30000 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const scope of ["off", "all"]) {
	process.stdout.write(`触发 scope=${scope} …`);
	for (let i = 0; i < 3; i++) {
		setConfig({ scope, enabled: true, dim: 0.25 + i * 0.0009 });
		await sleep(3500);
	}
	console.log(" 完成");
}
/* 复原为使用者原来的设置 */
setConfig({ scope: "all", dim: 0.25 });
console.log("已复原 scope=all");
