# dsh-dt-bg deployment + runtime verification.
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 files as ANSI, so a
# UTF-8 file without BOM (with non-ASCII comments) fails to parse. Chinese docs
# live in README.md.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File verify.ps1
#   powershell -ExecutionPolicy Bypass -File verify.ps1 -DiagPath "E:\path\.dsh-web-bg2-diagnostics.jsonl"
#
# Checks three things without needing a token: the browser half reports the real
# DOM structure to the host half, which writes it to disk next to the session cwd.
#   1) static deployment (package + profile mount);
#   2) runtime DOM diagnostics (layout root, panel marks, effective alpha vars,
#      and the frame clearance variable);
#   3) whether "wallpaper across the whole window + panels translucent by token" holds.
param(
    [string]$DiagPath = "",
    [string]$DshHome = ""
)

$ErrorActionPreference = "Continue"
$fail = 0
$warn = 0
function Pass([string]$m) { Write-Host "  [PASS] $m" -ForegroundColor Green }
function Fail([string]$m) { $script:fail += 1; Write-Host "  [FAIL] $m" -ForegroundColor Red }
function Warn([string]$m) { $script:warn += 1; Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Info([string]$m) { Write-Host "  [info] $m" -ForegroundColor DarkGray }

if (-not $DshHome) { $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" } }
Write-Host "== dsh-dt-bg verification ==" -ForegroundColor Cyan
Info "DSH_HOME = $DshHome"

# -- 1) static deployment ----------------------------------------------------
$pkgDir = Join-Path $DshHome "profiles\node_modules\dsh-dt-bg"
if (Test-Path $pkgDir) {
    Pass "plugin package deployed: $pkgDir"
    foreach ($rel in @("package.json", "lib\index.js", "lib\client.js")) {
        if (Test-Path (Join-Path $pkgDir $rel)) { Pass "  contains $rel" } else { Fail "  missing $rel" }
    }
    $manifest = Get-Content (Join-Path $pkgDir "package.json") -Raw | ConvertFrom-Json
    if ($manifest.dsh.client.platform -eq "web") { Pass "  declares dsh.client.platform = web (browser half served)" }
    else { Fail "  dsh.client.platform is not web - the browser half would never load" }
    if ($manifest.exports.'./client') { Pass "  exports ./client (bundle entry present)" } else { Fail "  exports ./client missing" }
} else { Fail "plugin package not deployed: $pkgDir (run: node install.mjs)" }

$profileName = if ($env:DSH_PROFILE) { $env:DSH_PROFILE } else { "desktop" }
$patch = Join-Path $DshHome "profiles\$profileName\cordis.patch.yml"
if (Test-Path $patch) {
    $text = Get-Content -LiteralPath $patch -Raw -Encoding UTF8
    # 名字可能带引号也可能不带（YAML 序列化会去掉引号），两种写法都要认
    if ($text -match "(?m)^\s*name:\s*['""]?dsh-dt-bg['""]?\s*$") { Pass "mounted in $profileName profile (cordis.patch.yml)" } else { Fail "not mounted in $patch - add the insert entry (node install.mjs)" }
    # 注释掉的行不算挂载（行首允许空白但不能是 #）
    if ($text -match "(?m)^\s*name:\s*['""]?dsh-web-bg['""]?\s*$") { Warn "v1 (dsh-web-bg) is also mounted - two wallpaper layers stack; remove one" } else { Pass "v1 (dsh-web-bg) is not mounted (no stacked wallpaper layers)" }
} else { Fail "profile patch not found: $patch" }

# -- 2) runtime diagnostics --------------------------------------------------
$repo = Split-Path -Parent $PSCommandPath
if (-not $DiagPath) {
    $candidates = @(
        (Join-Path $DshHome ".dsh-web-bg2-diagnostics.jsonl"),
        (Join-Path $repo ".dsh-web-bg2-diagnostics.jsonl"),
        (Join-Path (Get-Location) ".dsh-web-bg2-diagnostics.jsonl")
    )
    $DiagPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $DiagPath -or -not (Test-Path $DiagPath)) {
    Warn "no diagnostics file yet - reload the DSH page once, then run this script again"
    Warn "  the browser half POSTs the real DOM structure to the host, which writes it next to the session cwd"
} else {
    $lines = Get-Content -LiteralPath $DiagPath -Encoding UTF8 | Where-Object { $_.Trim() -ne "" }
    $last = $lines[-1] | ConvertFrom-Json
    $r = $last.report
    Pass "diagnostics found: $(Split-Path -Leaf $DiagPath) ($($lines.Count) record(s), latest $($last.at))"
    Info "host cwd = $($last.host.cwd)  profile = $($last.host.env.profile)"

    if ($r.isTopFrame) { Warn "page reports itself as the TOP frame - the shell may have changed how it embeds the UI" }
    else { Pass "page runs inside the shell frame (isTopFrame=false), as expected on the desktop client" }

    $top = [string]$r.frameVars.top
    if ($top) { Pass "frame clearance published: --dsh-frame-top-clearance = $top" }
    else { Warn "--dsh-frame-top-clearance is empty (browser document, or the shell stopped publishing it)" }

    if ($r.frame) {
        Pass "layout root found: $($r.frame.path)  rect=$($r.frame.rect -join 'x')"
        Info "  root bg = $($r.frame.bg)"
        foreach ($child in $r.frameChildren) {
            Info "  child $($child.rect -join 'x')  bg=$($child.bg)  pos=$($child.position)  z=$($child.zIndex)"
        }
    } else { Fail "layout root NOT found - the panel classifier has nothing to mark (send this file back)" }

    $marked = @($r.applied.marked)
    if ($marked.Count -gt 0) {
        Pass "panels marked: $($marked.Count)"
        foreach ($m in $marked) { Info "  $($m.kind)  $($m.rect -join 'x')  bg=$($m.bg)" }
        if (($marked | Where-Object { $_.kind -eq "sidebar" -or $_.kind -eq "divider" }).Count -gt 0) { Pass "a sidebar column was identified (wallpaper can show through it)" } else { Warn "no sidebar identified - the sidebar may keep an opaque background" }
        if (($marked | Where-Object { $_.kind -eq "overlay" }).Count -gt 0) { Pass "overlay(s) correctly excluded from translucency" }
    } else { Fail "nothing marked - translucency cannot apply (send this file back)" }

    if ($r.applied.canvasAttr -eq "1") { Pass "canvas override active (html[data-wbg2-canvas])" }
    else { Fail "canvas override not active - the theme canvas would cover the wallpaper" }
    if ($r.applied.panelsAttr -eq "1") { Pass "panel translucency active (html[data-wbg2-panels])" }
    else { Warn "panel translucency inactive (scope=off, or translucency=0)" }

    foreach ($pair in @(@("sidebar", $r.applied.sidebarVar), @("content", $r.applied.contentVar), @("chrome", $r.applied.chromeVar))) {
        $name = $pair[0]
        $value = [string]$pair[1]
        if ($value -match "^rgba\(") {
            $alpha = [double]([regex]::Match($value, ",\s*([0-9.]+)\)$").Groups[1].Value)
            if ($alpha -gt 0 -and $alpha -lt 1) { Pass "  $name background = $value (translucent, wallpaper shows through)" }
            elseif ($alpha -ge 1) { Warn "  $name background is fully opaque ($value) - this group is excluded by scope" }
            else { Fail "  $name background alpha is 0 ($value) - text would sit directly on the photo" }
        } elseif ($value -match "^#([0-9a-f]{3}|[0-9a-f]{6})$" -or $value -match "^rgb\(") {
            # scope 排除该分组时我们写入的是**不透明主题底色**（不是 transparent），
            # 这样该分组才真正"不透出"——画布已被改成透明，写 transparent 反而会露出壁纸。
            Pass "  $name background = $value (opaque: excluded by scope, stays solid)"
        } elseif ($value -eq "transparent" -or $value -eq "inherit") {
            Fail "  $name background is '$value' - excluded groups must get an OPAQUE theme colour, not transparency"
        } else { Fail "  $name background was not produced: '$value'" }
    }

    $base = [string]$r.tokens.base
    if ($base) { Pass "theme base token read: --dsw-alias-bg-base = $base" } else { Warn "could not read --dsw-alias-bg-base" }
    Info "dark theme = $($r.dark)   dpr = $($r.dpr)   viewport = $($r.viewport -join 'x')"
}

Write-Host ""
if ($fail -eq 0) { Write-Host "STATIC + RUNTIME CHECKS PASSED ($warn warning(s))" -ForegroundColor Green }
else { Write-Host "$fail CHECK(S) FAILED" -ForegroundColor Red }
Write-Host ""
Write-Host "manual checklist:" -ForegroundColor Cyan
Write-Host "  1. wallpaper visible across the WHOLE window (sidebar + content + composer), not just the chat area"
Write-Host "  2. Settings -> General -> Background: switch / image / colour / opacity / dim / blur / translucency / scope all live"
Write-Host "  3. switch light/dark: panels follow the theme, wallpaper stays"
Write-Host "  4. title bar (top 40px): no separate colour block"
Write-Host "  5. reload the page: settings persist (stored in the profile cordis.patch.yml)"
Write-Host ""
