/**
 * 悬停动画三分支对照实验：依次设置 (fade中和, 淡色叠加) 的开关组合，
 * 供使用者肉眼判断哪一种组合下"侧边栏悬停动画"恢复。
 *
 * 用法：
 *   node tools/hover-ab.mjs 1      # 两个都启用（= 当前默认，动画应消失）
 *   node tools/hover-ab.mjs 2      # 关"淡色叠加"，保留"渐变中和"
 *   node tools/hover-ab.mjs 3      # 关"渐变中和"，保留"淡色叠加"
 *   node tools/hover-ab.mjs reset  # 恢复默认（两个都启用）
 */
import { execFileSync } from "node:child_process";
import { DSH_HOME, homedir, resolveDshModules } from "./paths.mjs";

const YAML = join(resolveDshModules(), "..", "yaml");
const CONFIG = join(DSH_HOME, "profiles", "desktop", "cordis.patch.yml");

/** @type {Record<string, {noFadeNeutralize: boolean, noTint: boolean, label: string}>} */
const MODES = {
	"1": { noFadeNeutralize: false, noTint: false, label: "渐变中和=开，淡色叠加=开（当前默认）" },
	"2": { noFadeNeutralize: false, noTint: true, label: "渐变中和=开，淡色叠加=关" },
	"3": { noFadeNeutralize: true, noTint: false, label: "渐变中和=关，淡色叠加=开" },
	"4": { noFadeNeutralize: false, noTint: false, noBlanket: true, label: "关掉「面板内后代底色透明」（无差别中和）" },
	"5": { noFadeNeutralize: true, noTint: true, noBlanket: true, label: "三条全关（只保留面板自身底色）" },
	"6": { noFadeNeutralize: true, noTint: true, noBlanket: true, noPanelBg: true, label: "四条全关：连面板自身底色也不写" },
	reset: { noFadeNeutralize: false, noTint: false, label: "恢复默认" }
};

const mode = process.argv[2] ?? "1";
const target = MODES[mode];
if (target === undefined) {
	console.error(`未知模式「${mode}」，可用：${Object.keys(MODES).join(" / ")}`);
	process.exit(1);
}

const code = `
const fs=require('fs');const Y=require(${JSON.stringify(YAML)});
const f=${JSON.stringify(CONFIG)};
const d=Y.parse(fs.readFileSync(f,'utf8'));
const e=d.find(x=>x&&x.id==='web-bg-2');
e.config={...e.config, noFadeNeutralize:${target.noFadeNeutralize}, noTint:${target.noTint}, noBlanket:${target.noBlanket === true}, noPanelBg:${target.noPanelBg === true}, enabled:true};
fs.writeFileSync(f,Y.stringify(d,{lineWidth:0}),'utf8');
`;
execFileSync(process.execPath, ["-e", code], { stdio: "pipe", timeout: 30000 });
console.log(`已切换到：${target.label}`);
console.log("请把鼠标移到侧边栏的会话条目上，缓慢上下移动，观察悬停动画是否出现。");


