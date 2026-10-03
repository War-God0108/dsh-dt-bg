/**
 * 从用户截图里自动定位两个开关（我的 / 官方的），量出轨道与圆点颜色，以及标签文字颜色。
 * 不靠手工坐标换算 —— 直接按"亮块尺寸"搜索。
 * 用法：node tools/measure-colors.mjs <截图路径>
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const shot = process.argv[2];
if (shot === undefined) {
	console.log("用法：node tools/measure-colors.mjs <截图路径>");
	process.exit(1);
}
const py = join(homedir(), ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "python", "python.exe");
if (!existsSync(py)) {
	console.log("找不到 python");
	process.exit(1);
}

const script = `
from PIL import Image
im = Image.open(r"${shot}").convert("RGB")
W, H = im.size
px = im.load()
print("截图:", W, H)

# 找"近白"像素组成的块（开关轨道/圆点都是近白或深色；先找近白）
pts = [(x, y) for y in range(200, H - 60, 2) for x in range(int(W*0.6), W - 4, 2) if min(px[x, y]) >= 225]
print("近白像素:", len(pts))
blocks = []
ys = sorted(set(p[1] for p in pts))
if ys:
    groups = []
    cur = [ys[0]]
    for y in ys[1:]:
        if y - cur[-1] <= 10:
            cur.append(y)
        else:
            groups.append(cur); cur = [y]
    groups.append(cur)
    for g in groups:
        gx = [p[0] for p in pts if g[0] <= p[1] <= g[-1]]
        w = max(gx) - min(gx) + 1
        h = g[-1] - g[0] + 1
        if 40 <= w <= 90 and 20 <= h <= 44:
            blocks.append((min(gx), g[0], w, h))

print("\\n候选开关块（宽40~90 高20~44）:")
for b in blocks:
    print("  x=%d..%d y=%d..%d (宽%d 高%d)" % (b[0], b[0]+b[2]-1, b[1], b[1]+b[3]-1, b[2], b[3]))

def avg(x0, y0, x1, y1):
    vals = [px[x, y] for x in range(x0, x1) for y in range(y0, y1)]
    n = len(vals)
    return tuple(round(sum(c[i] for c in vals)/n) for i in range(3))

def lum(c):
    return round(sum(c)/3)

for i, (x, y, w, h) in enumerate(blocks):
    left = avg(x+2, y+2, x+2+int(w*0.22), y+h-2)
    right = avg(x+w-2-int(w*0.22), y+2, x+w-2, y+h-2)
    top = avg(x+int(w*0.35), y+1, x+int(w*0.65), y+3)
    print(f"\\n开关#{i+1} @({x},{y}) {w}x{h}")
    print(f"   左段(轨道)={left}  亮度={lum(left)}")
    print(f"   右段(圆点)={right}  亮度={lum(right)}")
    print(f"   顶部中段={top}  亮度={lum(top)}")

print("\\n=== 文字颜色（在开关左侧的标签区域采样最亮像素）===")
for label, (x0, y0, x1, y1) in {
    "「背景」文字区": (int(W*0.30), int(H*0.40), int(W*0.36), int(H*0.45)),
    "Session Log 文字区": (int(W*0.30), int(H*0.77), int(W*0.40), int(H*0.82)),
}.items():
    vals = [px[x, y] for x in range(x0, x1) for y in range(y0, y1)]
    vals.sort(key=lambda c: -sum(c))
    top5 = vals[:max(1, len(vals)//200)]
    avg_top = tuple(round(sum(c[i] for c in top5)/len(top5)) for i in range(3))
    print(f"  {label:22} 最亮 0.5% 平均={avg_top}")
`;

execFileSync(py, ["-c", script], { stdio: "inherit", timeout: 60000 });
