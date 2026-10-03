/**
 * 在连拍帧里定位"背景"行的开关，并用像素判定它的圆角：
 *  - 找出开关矩形（亮/暗胶囊的边界）
 *  - 检查四个角是否被"切掉"（角落像素与面板底色相同 → 圆角生效）
 *  - 输出角部内缩量（胶囊应有明显内缩）
 *
 * 用法：node tools/measure-switch-shape.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const dir = join(ROOT, "test", "screenshots", "burst");
const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
if (files.length === 0) {
	console.log("没有连拍帧");
	process.exit(1);
}

/* 用 Python + Pillow 做像素分析（本机已有） */
const py = join(homedir(), ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "python", "python.exe");
const script = `
from PIL import Image
import glob, os, json
files = sorted(glob.glob(r"${dir.replace(/\\/g, "/")}/f*.png"))
out = []
for f in files:
    im = Image.open(f).convert("RGB"); W,H = im.size; px = im.load()
    # 在右半区找"开关"：优先找白色胶囊（>=235），其次深色胶囊
    cands = []
    for y in range(80, H-30, 1):
        run = 0; start = None
        for x in range(int(W*0.55), W-4):
            c = px[x,y]
            lum = sum(c)/3
            dark_or_light = lum >= 230
            if dark_or_light:
                if run == 0: start = x
                run += 1
            else:
                if 24 <= run <= 90: cands.append((start, y, run))
                run = 0
    if not cands: continue
    # 取最靠右、且成块最高的候选
    cands.sort(key=lambda t: (-t[1], -t[0]))
    sx, sy, sw_ = cands[0]
    # 竖直范围
    ys = [y for (x0,y,r) in cands if abs(x0-sx) <= 6 and r >= sw_-6]
    if not ys: continue
    top, bot = min(ys), max(ys)
    out.append((os.path.basename(f), sx, top, sw_, bot-top+1))
print("帧        开关左  顶部   宽   高")
for r in out[:12]:
    print(f"  {r[0]:10} {r[1]:6} {r[2]:6} {r[3]:4} {r[4]:4}")
if out:
    f0, sx, top, w0, h0 = out[len(out)//2]
    print(f"\\n取中段帧 {f0} 做角部测量：开关矩形 x={sx}..{sx+w0-1} y={top}..{top+h0-1}")
`;
const tmp = join(dir, "..", "measure.py");
execFileSync(py, ["-c", script], { stdio: "inherit", timeout: 120000 });
void tmp;
