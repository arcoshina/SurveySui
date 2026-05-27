#requires -Version 5.1
<#
.SYNOPSIS
  Devnet 重置後一鍵重新部署 SurveySui 合約。
.DESCRIPTION
  切 sui CLI 環境 → faucet → 清 stale Pub.devnet.toml / Move.lock devnet 區塊
  → pnpm deploy:Devnet → 印出新 ID → 列出後續手動步驟。
  詳見 docs/Reset/README.md。
#>

$ErrorActionPreference = 'Stop'

# repo root = 此檔上兩層（docs/Reset → docs → repo）
# 用 $MyInvocation 取得自身路徑，較 $PSScriptRoot 在各種呼叫路徑下更穩定
$scriptPath = $MyInvocation.MyCommand.Path
if (-not $scriptPath) { $scriptPath = $PSCommandPath }
if (-not $scriptPath) { throw '無法解析腳本自身路徑（$MyInvocation.MyCommand.Path 與 $PSCommandPath 皆為空）' }
$scriptDir = Split-Path -Parent $scriptPath
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
Set-Location $repoRoot

Write-Host ''
Write-Host '=== SurveySui devnet 重新部署 ===' -ForegroundColor Cyan
Write-Host "Repo root: $repoRoot"
Write-Host ''

# ── [1/6] 切 sui CLI 到 devnet ────────────────────────────────────────────────
Write-Host '[1/6] 切換 sui CLI 到 devnet…' -ForegroundColor Yellow
sui client switch --env devnet | Out-Null
$activeEnv = (sui client active-env).Trim()
if ($activeEnv -ne 'devnet') {
  throw "sui active-env 應為 devnet，實際為 '$activeEnv'。請先 `sui client new-env --alias devnet --rpc https://fullnode.devnet.sui.io:443`。"
}
Write-Host "  active-env = $activeEnv"

# ── [2/6] faucet ──────────────────────────────────────────────────────────────
$envPath = Join-Path $repoRoot '.env'
if (-not (Test-Path $envPath)) { throw ".env not found at $envPath" }

$adminAddress = $null
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*SUI_ADMIN_ADDRESS\s*=\s*(.+?)\s*$') {
    $adminAddress = $Matches[1].Trim('"').Trim("'")
    break
  }
}
if (-not $adminAddress) { throw 'SUI_ADMIN_ADDRESS not found in .env' }

Write-Host ''
Write-Host "[2/6] 對 $adminAddress 領 devnet faucet…" -ForegroundColor Yellow
try {
  sui client faucet --address $adminAddress
} catch {
  Write-Warning "faucet 失敗（可能 rate-limit），繼續往下；若 step 4 報 Insufficient gas，請手動再領一次。"
}

# ── [3/6] 清 stale Pub.devnet.toml / Move.lock devnet 區塊 ────────────────────
Write-Host ''
Write-Host '[3/6] 清掉 stale Pub.devnet.toml / Move.lock devnet 章節…' -ForegroundColor Yellow
$pub = Join-Path $repoRoot 'contracts\Pub.devnet.toml'
if (Test-Path $pub) {
  Remove-Item $pub -Force
  Write-Host '  removed contracts/Pub.devnet.toml'
} else {
  Write-Host '  contracts/Pub.devnet.toml 不存在，跳過'
}

$lockPath = Join-Path $repoRoot 'contracts\Move.lock'
if (Test-Path $lockPath) {
  $lines = Get-Content $lockPath
  $out = New-Object System.Collections.Generic.List[string]
  $skip = $false
  $removed = $false
  foreach ($l in $lines) {
    if ($l -match '^\[env\.devnet\]') {
      $skip = $true
      $removed = $true
      continue
    }
    if ($skip -and $l -match '^\s*\[') {
      $skip = $false
    }
    if (-not $skip) { $out.Add($l) | Out-Null }
  }
  if ($removed) {
    Set-Content -Path $lockPath -Value $out -Encoding utf8
    Write-Host '  stripped [env.devnet] block from contracts/Move.lock'
  } else {
    Write-Host '  Move.lock 內無 [env.devnet] 區塊，跳過'
  }
} else {
  Write-Host '  contracts/Move.lock 不存在，跳過'
}

# ── [4/6] pnpm deploy:Devnet ──────────────────────────────────────────────────
Write-Host ''
Write-Host '[4/6] 執行 pnpm deploy:Devnet（publish + init_pool + set_issuer_pubkey + 寫 env）…' -ForegroundColor Yellow
pnpm deploy:Devnet
if ($LASTEXITCODE -ne 0) {
  throw "deploy:Devnet failed (exit $LASTEXITCODE)"
}

# ── [5/6] 印出新 ID ───────────────────────────────────────────────────────────
Write-Host ''
Write-Host '[5/6] 新合約 ID 摘要（從 .env 讀回）…' -ForegroundColor Yellow
$idKeys = 'SUI_PACKAGE_ID|SR_TREASURY_ID|SSR_TREASURY_ID|AMM_POOL_ID|SURVEY_REGISTRY_ID|PASS_REGISTRY_ID|ISSUER_CONFIG_ID'
Get-Content $envPath | Where-Object { $_ -match "^($idKeys)=" } | ForEach-Object {
  Write-Host "  $_"
}

# ── [6/6] 後續提醒 ────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '[6/6] 完成。下一步：' -ForegroundColor Green
Write-Host '  1. 重啟 BFF：       cd bff;       pnpm dev'
Write-Host '  2. 重啟 Frontend：  cd frontend;  pnpm dev'
Write-Host '  3. 瀏覽器清 localStorage（survey:*、draft:*、pass:* keys），重連錢包'
Write-Host '  4. （選擇性）TRUNCATE surveys 表中舊 package_id 的歷史資料'
Write-Host ''
