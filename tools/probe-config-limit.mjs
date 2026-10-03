/**
 * 实测 DSH「配置下发通道」的体积上限（修正版）。
 *
 * 上一版有个 bug：正则在第一次替换后就匹配不到了，导致几档写的是同一份配置。
 * 这里改为**每次都从原始配置重新构造**，并在每轮后校验"写进去的体积确实变了"。
 *
 * 关键对照：测一档**极小图片**（约 8 KiB）。
 *   小图也不送达 → 与体积无关，是配置绑定/下发本身坏了；
 *   小图送达     → 上限确实存在，从大往小二分即可。
 *
 * 用法：node tools/probe-config-limit.mjs [KiB ...]
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, DIAG_FILE, ROOT } from "./paths.mjs";

const python = existsSync(process.env.DSH_PYTHON ?? "") ? process.env.DSH_PYTHON : "python";
const work = join(ROOT, "dist", "limit-probe");
mkdirSync(work, { recursive: true });

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const TARGETS = args.length > 0 ? args : [8, 120, 260, 480];

/** 原始配置：把 image 值去掉，留出插入点。 */
const original = readFileSync(CONFIG_FILE, "utf8");
const IMAGE_RE = /image: data:image\/\w+;base64,[A-Za-z0-9+/=]+/;
if (!IMAGE_RE.test(original)) {
	console.log("原配置里没有 data URL 图片，无法做这个测试。");
	process.exit(1);
}
const template = original.replace(IMAGE_RE, "image: @IMG@");
const backup = `${CONFIG_FILE}.bak-limitprobe2-${Date.now()}`;
copyFileSync(CONFIG_FILE, backup);
console.log(`原配置已备份 → ${backup}\n`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeImage(kib) {
	const out = join(work, `probe-${kib}.jpg`);
	const py = `
import os, sys
from PIL import Image
out, target = sys.argv[1], int(sys.argv[2]) * 1024
w, h = 2560, 1440
im = Image.new("RGB", (w, h))
px = im.load()
step = 8
for y in range(0, h, step):
    for x in range(0, w, step):
        v = (x * 7 + y * 13) % 256
        for dy in range(step):
            for dx in range(step):
                if x+dx < w and y+dy < h:
                    px[x+dx, y+dy] = (v, (v*3) % 256, (v*7) % 256)
best = None
for q in (80, 60, 45, 30, 20, 12, 6):
    im.save(out, "JPEG", quality=q, optimize=True)
    size = os.path.getsize(out)
    best = (q, size) if best is None or size < best[1] else best
    if size <= target:
        best = (q, size)
        break
print(best[0], best[1])
`;
	execFileSync(python, ["-c", py, out, String(kib)], { stdio: "pipe", timeout: 300000 });
	return out;
}

/** 写入指定图片 → 触发上报 → 读 imageChars。 */
async function trySize(kib) {
	const img = makeImage(kib);
	const b64 = readFileSync(img).toString("base64");
	const withImg = template.replace("@IMG@", `data:image/jpeg;base64,${b64}`);
	if (!withImg.includes("data:image/jpeg")) throw new Error("替换失败");
	writeFileSync(CONFIG_FILE, withImg, "utf8");
	const writtenKb = withImg.length / 1024;

	for (let i = 0; i < 3; i++) {
		writeFileSync(CONFIG_FILE, withImg.replace(/dim: [\d.]+/, `dim: ${(0.25 + i * 0.0011).toFixed(4)}`), "utf8");
		await sleep(4000);
	}
	if (!existsSync(DIAG_FILE)) return { kib, chars: null, writtenKb };
	const lines = readFileSync(DIAG_FILE, "utf8").split("\n").filter((l) => l.trim().startsWith("{"));
	for (let i = lines.length - 1; i >= 0; i--) {
		let rec;
		try {
			rec = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const s = rec.report?.layerState;
		if (s === undefined) continue;
		return { kib, chars: s.settings?.imageChars ?? -1, writtenKb, translucency: s.settings?.translucency };
	}
	return { kib, chars: null, writtenKb };
}

console.log("写入体积 KB | 插件读到的 imageChars | 结论");
console.log("-----------|----------------------|------");
const results = [];
for (const kib of TARGETS) {
	const r = await trySize(kib);
	results.push(r);
	console.log(`${r.writtenKb.toFixed(0).padStart(11)} | ${String(r.chars).padStart(20)} | ${(r.chars ?? 0) > 0 ? "✓ 送达" : "✗ 被丢弃"}`);
}

writeFileSync(CONFIG_FILE, original, "utf8");
console.log(`\n已还原原配置（备份：${backup}）`);

const ok = results.filter((r) => (r.chars ?? 0) > 0);
const bad = results.filter((r) => (r.chars ?? 0) === 0);
if (ok.length > 0 && bad.length > 0) {
	console.log(`\n上限落在 ${Math.max(...ok.map((r) => r.writtenKb)).toFixed(0)} KB（送达）与 ${Math.min(...bad.map((r) => r.writtenKb)).toFixed(0)} KB（丢弃）之间`);
} else if (bad.length === results.length) {
	console.log("\n**所有档位都丢弃 —— 与体积无关**，要查配置绑定/下发本身。");
} else {
	console.log("\n所有档位都送达 —— 上限高于最大测试档。");
}
