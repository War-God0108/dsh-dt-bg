/**
 * 连续抓帧：每 1.5 秒抓一次窗口区域，共约 45 秒。
 * 用途：让用户在这段时间里打开设置面板，事后再从帧里挑出"面板开着"的那张 ——
 * 避免"要求用户保持面板打开的同时回复我"这种做不到的流程。
 *
 * 用法：node tools/burst-shots.mjs [帧数]
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const outDir = join(ROOT, "test", "screenshots", "burst");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const frames = Number(process.argv[2] ?? 30);
const ps = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class BW {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  public struct R { public int L, T, Rr, B; }
}
"@
$p = Get-Process -Name "DeepSeek Harness" | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$r = New-Object BW+R
[void][BW]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$w = $r.Rr - $r.L; $ht = $r.B - $r.T
$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size); $g.Dispose()
$bmp.Save("__OUT__", [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Output "$($r.L),$($r.T),$w,$ht"
`;

console.log(`开始连拍 ${frames} 帧（每帧间隔约 1.5 秒，共约 ${Math.round((frames * 1.5) / 1) } 秒）`);
console.log("请在这段时间内打开「设置 → 通用设置」，然后停住不动。\n");
const rects = [];
for (let i = 1; i <= frames; i++) {
	const file = join(outDir, `f${String(i).padStart(2, "0")}.png`);
	const script = ps.replace("__OUT__", file.replace(/\\/g, "\\\\"));
	try {
		const res = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { encoding: "utf8", timeout: 20000 });
		rects.push(res.trim());
		process.stdout.write(`  ${i}/${frames} ${res.trim()}\r`);
	} catch (error) {
		process.stdout.write(`  ${i}/${frames} 抓帧失败\r`);
		void error;
	}
	await new Promise((r) => setTimeout(r, 1500));
}
console.log(`\n完成。帧目录：${outDir}`);
console.log(`窗口矩形样本：${[...new Set(rects)].join(" | ")}`);
void existsSync;
void homedir;
