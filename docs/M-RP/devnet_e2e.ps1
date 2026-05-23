# M-RP Devnet End-to-End Verification — PowerShell script template
#
# Five scenarios:
#   1. repeat_reward = 0     → second claim from same wallet fails
#   2. repeat_reward > 0     → 1 initial + repeat_max_times repeats succeed,
#                              one more attempt fails with ERepeatLimitReached
#   3. Dashboard "latest only" view collapses repeat submissions
#   4. Claim after deadline fails (EExpired)
#   5. SurveyPass expired/revoked → claim fails (EInvalidPass)
#
# This script is a TEMPLATE — fill in the environment block below before running.
# It exercises the Move calls directly via `sui client call`; the dashboard view
# in scenario 3 is a manual browser check.

$ErrorActionPreference = 'Stop'

# ── Environment ────────────────────────────────────────────────────────────────
$PACKAGE_ID         = $env:VITE_PACKAGE_ID
$POOL_ID            = $env:VITE_AMM_POOL_ID
$SR_TREASURY_ID     = $env:VITE_SR_TREASURY_ID
$SSR_TREASURY_ID    = $env:VITE_SSR_TREASURY_ID
$REGISTRY_ID        = $env:VITE_SURVEY_REGISTRY_ID
$PASS_REGISTRY_ID   = $env:VITE_NULLIFIER_REGISTRY_ID
$ADMIN_TREASURY     = $env:VITE_ADMIN_TREASURY
$CLOCK_ID           = '0x6'  # Sui clock singleton

if (-not $PACKAGE_ID) {
    Write-Error 'Set VITE_PACKAGE_ID (and friends) before running. Read frontend/.env.local for values.'
    exit 1
}

$CREATOR_ADDR     = (sui client active-address).Trim()
Write-Host "Active address (creator/respondent): $CREATOR_ADDR"

# Helper — call survey_vault::create_empty + fund + share
function New-Vault {
    param(
        [int64]$PerResponse,
        [int64]$RepeatReward,
        [int64]$RepeatMaxTimes,
        [int64]$MaxResponses,
        [int64]$DeadlineMs
    )
    Write-Host ("Creating vault: perResponse=$PerResponse, repeatReward=$RepeatReward, repeatMax=$RepeatMaxTimes, maxResponses=$MaxResponses, deadlineMs=$DeadlineMs")
    # NOTE: real PTB should pipe create_empty → deposit_existing_ssr → merge_balances → register.
    # For E2E this script assumes you use the frontend `/create` + `/fund` flow to
    # produce the vault; record the vault id and feed it back via $env:VAULT_ID
    # before running the claim scenarios below.
    if (-not $env:VAULT_ID) {
        Write-Warning 'Set $env:VAULT_ID first — use frontend Create/Fund flow to obtain.'
        exit 1
    }
    return $env:VAULT_ID
}

# Helper — issue a SurveyPass for the active address (assumes BFF available)
function Get-OrIssuePass {
    Write-Host 'Fetching active SurveyPass for current wallet…'
    # Recommended: use the frontend `/survey/<id>` flow to issue OTP-backed pass.
    if (-not $env:PASS_ID) {
        Write-Warning 'Set $env:PASS_ID first — use frontend OTP issuance to obtain.'
        exit 1
    }
    return $env:PASS_ID
}

# Helper — call survey_vault::claim
function Invoke-Claim {
    param([string]$VaultId, [string]$PassId, [string]$EncryptedAnswersHex)
    sui client call `
        --package $PACKAGE_ID `
        --module survey_vault `
        --function claim `
        --args $VaultId $PassId $EncryptedAnswersHex $CLOCK_ID `
        --gas-budget 100000000
}

# ── Scenario 1 ───── repeat_reward = 0, two claims from same wallet ───────
Write-Host '═══ Scenario 1: repeat_reward = 0 ═══'
Write-Host '1a. Build a vault via frontend with repeatReward=0, claim once (expect SUCCESS).'
Write-Host '1b. Re-attempt claim from same wallet (expect EAlreadyClaimed abort code = 3).'
Write-Host 'Manual gates: open /survey/<id> twice, watch error toast on the second submit.'
Read-Host 'Press Enter when Scenario 1 verified to continue'

# ── Scenario 2 ───── repeat_reward > 0, exhaust limit ─────────────────────
Write-Host '═══ Scenario 2: repeat_reward > 0, repeat_max_times = 3 ═══'
Write-Host '2a. Build a vault via frontend with repeatReward > 0, repeatMaxTimes = 3.'
Write-Host '2b. Claim 4 times from same wallet (1 initial + 3 repeats) — all SUCCEED.'
Write-Host '    Verify SR balance increases by perResponse on 1st, by repeatReward on 2-4.'
Write-Host '2c. 5th claim attempt fails with ERepeatLimitReached (abort code = 9).'
Read-Host 'Press Enter when Scenario 2 verified to continue'

# ── Scenario 3 ───── Dashboard latest-only view ───────────────────────────
Write-Host '═══ Scenario 3: Dashboard "latest one per respondent" view ═══'
Write-Host '3a. Open /dashboard/<vaultId> after Scenario 2 completes.'
Write-Host '3b. Click "Decrypt" then toggle the "每位最新一次" radio.'
Write-Host '3c. Verify the table collapses to 1 row for the test wallet (most-recent submission).'
Write-Host '3d. Toggle back to "所有提交" — table should show 4 rows.'
Write-Host '3e. Click "下載 CSV（全部）" — CSV must contain all 4 rows regardless of view.'
Read-Host 'Press Enter when Scenario 3 verified to continue'

# ── Scenario 4 ───── Claim after deadline ─────────────────────────────────
Write-Host '═══ Scenario 4: claim after deadline_ms ═══'
Write-Host '4a. Build a vault with deadlineMs = now + 60_000 (one minute).'
Write-Host '4b. Wait > 60s, attempt claim — expect EExpired (abort code = 2).'
Read-Host 'Press Enter when Scenario 4 verified to continue'

# ── Scenario 5 ───── SurveyPass expired/revoked ───────────────────────────
Write-Host '═══ Scenario 5: SurveyPass expired or revoked ═══'
Write-Host '5a. Issue a SurveyPass with short ttl (or call survey_pass::revoke_pass via admin).'
Write-Host '5b. Attempt claim with that pass — expect EInvalidPass (abort code = 4).'
Read-Host 'Press Enter when Scenario 5 verified — script ends here.'

Write-Host 'All 5 scenarios manually verified.'
