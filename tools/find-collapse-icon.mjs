/**
 * 在连拍帧里定位"侧边栏折叠/展开图标"与 logo 的位置关系，
 * 判断图标是否压到 logo 上（用户报的 bug）。
 *
 * 用法：node tools/find-collapse-icon.mjs
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

const py = join(homedir(), ".dsh", "dsh-runtimes", "dsh-primary-runtime", "dependencies", "python", "python.exe");
const script = `
from PIL import Image
import glob, os
files = sorted(glob.glob(r"${dir.replace(/\\/g, "/")}/f*.png"))
print("帧数:", len(files))
# 侧边栏展开时，宽度约 280（窗口坐标）；折叠时约 60。
# 关键观察：logo 区（顶部左）与"侧边栏控件行"（新会话按钮上方/下方）是否重叠。
for f in files:
    im = Image.open(f).convert("RGB"); W, H = im.size; px = im.load()
    # 采样侧边栏顶部 0..340 x 40..200，统计"亮像素"（logo 与图标都是浅色）
    pts = [(x, y) for y in range(40, 210, 2) for x in range(0, 340, 2) if min(px[x, y]) >= 150]
    # 找这些亮像素在 y 方向的分布（logo 约 y=70..100；若是按钮图标应在别处）
    rows = {}
    for (x, y) in pts:
        rows.setdefault(y // 10 * 10, 0)
        rows[y // 10 * 10] += 1
    band = " ".join(f"{k}:{v}" for k, v in sorted(rows.items()) if v > 3)
    print(f"  {os.path.basename(f)}  亮像素 {len(pts):4}  y分布 {band[:150]}")
`;
execFileSync(py, ["-c", script], { stdio: "inherit", timeout: 120000 });
