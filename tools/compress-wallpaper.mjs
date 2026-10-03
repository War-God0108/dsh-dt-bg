/**
 * 把 profile 配置里的内嵌壁纸（base64 data URL）压到通道限额内。
 *
 * 背景：DSH 下发配置的通道对超大 payload 会截断/丢弃 ——
 * 1 MiB 的 JPEG 转 base64 是 1.4 MB，整份 config 因此被丢，
 * 插件只拿到出厂默认值（表现为"壁纸变内置兜底图、其他设置也回到默认"）。
 *
 * 做法：**保分辨率**，只降 JPEG 质量；从高到低试，选第一个进目标体积的档。
 *
 * 用法：
 *   node tools/compress-wallpaper.mjs                  # 预演（默认目标 320 KiB）
 *   node tools/compress-wallpaper.mjs --apply
 *   node tools/compress-wallpaper.mjs --apply --target 480
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, ROOT } from "./paths.mjs";

const apply = process.argv.includes("--apply");
const ti = process.argv.indexOf("--target");
const targetKb = ti >= 0 ? Number(process.argv[ti + 1]) : 320;

/** 本机 Python（Pillow 由 DSH 运行时提供）。 */
const python = existsSync(process.env.DSH_PYTHON ?? "")
	? process.env.DSH_PYTHON
	: "python";

const work = join(ROOT, "dist", "wallpaper-work");
mkdirSync(work, { recursive: true });

/* ---------- 1. 从配置里取出 data URL ---------- */
const raw = readFileSync(CONFIG_FILE, "utf8");
const m = /image: (data:image\/(\w+);base64,([A-Za-z0-9+/=]+))/.exec(raw);
if (m === null) {
	console.log("配置里没有内嵌图片（data URL），无需处理。");
	process.exit(0);
}
const original = Buffer.from(m[3], "base64");
const srcFile = join(work, `original.${m[2]}`);
writeFileSync(srcFile, original);
console.log(`原始图片：${(original.length / 1024).toFixed(0)} KiB（${m[2]}）`);
console.log(`目标上限：${targetKb} KiB（base64 后约 ${Math.round((targetKb * 4) / 3)} KB）\n`);

/* ---------- 2. 逐档压缩，结果写 JSON ---------- */
const py = `
import json, os, sys
from PIL import Image
src, outdir, target = sys.argv[1], sys.argv[2], int(sys.argv[3]) * 1024
im = Image.open(src)
if im.mode not in ("RGB", "L"):
    im = im.convert("RGB")
info = {"width": im.size[0], "height": im.size[1], "tries": []}
best = None
for q in (90, 86, 82, 78, 74, 70, 66, 62, 58, 54, 50, 44, 38, 32):
    p = os.path.join(outdir, "candidate.jpg")
    im.save(p, "JPEG", quality=q, optimize=True, progressive=True)
    size = os.path.getsize(p)
    info["tries"].append({"q": q, "size": size})
    if best is None or size < best[1]:
        best = (q, size, p)
    if size <= target:
        best = (q, size, p)
        break
info["best"] = {"q": best[0], "size": best[1], "path": best[2]}
open(os.path.join(outdir, "result.json"), "w", encoding="utf-8").write(json.dumps(info))
print(f"尺寸 {info['width']}x{info['height']}")
for t in info["tries"]:
    print(f"  q{t['q']:<3} → {t['size']/1024:.0f} KiB")
`;
execFileSync(python, ["-c", py, srcFile, work, String(targetKb)], { stdio: "inherit", timeout: 300000 });

const result = JSON.parse(readFileSync(join(work, "result.json"), "utf8"));
const best = result.best;
const b64 = readFileSync(best.path).toString("base64");
const dataUrl = `data:image/jpeg;base64,${b64}`;
const newSize = raw.length - m[1].length + dataUrl.length;

console.log(`\n选定：q${best.q} → ${(best.size / 1024).toFixed(0)} KiB（base64 ${(dataUrl.length / 1024).toFixed(0)} KB）`);
console.log(`整份配置：${(raw.length / 1024).toFixed(0)} KB → ${(newSize / 1024).toFixed(0)} KB`);

if (!apply) {
	console.log("\n[预演] 未写入。加 --apply 生效。");
	process.exit(0);
}
const backup = `${CONFIG_FILE}.bak-wallpaper-${Date.now()}`;
copyFileSync(CONFIG_FILE, backup);
writeFileSync(CONFIG_FILE, raw.replace(m[1], dataUrl), "utf8");
console.log(`\n已写入配置（备份 → ${backup}）`);
console.log("**重启 DSH** 后生效。");
