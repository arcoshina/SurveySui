/**
 * scripts/src/reset-registry.ts
 *
 * 開發 / 手動測試逃生口：當 `survey_registry::registered_hashes`
 * 累積了重複內容、導致每次發布都觸發 `EDuplicateSurvey` 時,
 * 用這支腳本把整包重發、產生全新的 `SurveyRegistry` shared object。
 *
 * Trade-off：會同步重發整個 package（pool / treasury / registries 全新），
 * 既有鏈上問卷 / vault / pass 都會留作孤兒。**僅供 dev / testnet 使用**。
 *
 * Usage（在 d:\...\SurveySui 根目錄）：
 *   pnpm --filter scripts exec tsx scripts/src/reset-registry.ts
 *
 * 跑完會：
 *   1. 重新 publish package
 *   2. 重新 init_pool
 *   3. set_issuer_pubkey（否則鏈上驗 ticket 簽章 abort 1）
 *   4. 把新 ID 寫進根目錄 `.env`
 *   4. 印出下一步（重啟 BFF / 重啟 vite dev server）
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { requireEnv } from './env.js'
import { deployPackage, initAmmPool, mergeRootEnv } from './init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function mergeEnvFile(filePath: string, updates: Record<string, string>): void {
  const existing: Record<string, string> = {}
  if (existsSync(filePath)) {
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      existing[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
    }
  }
  const merged = { ...existing, ...updates }
  writeFileSync(
    filePath,
    Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    'utf8'
  )
}

async function main() {
  console.log('⚠️  reset-registry：將重發整個 Move package、清除 on-chain SurveyRegistry。')
  console.log('   既有鏈上 Survey / Vault / Pass 物件會變成孤兒。僅供 dev / testnet。\n')

  const network = (process.env.SUI_NETWORK ?? 'testnet') as 'testnet' | 'devnet' | 'localnet'
  const adminPrivKey = requireEnv('SUI_ADMIN_PRIVATE_KEY')
  const adminAddress = requireEnv('SUI_ADMIN_ADDRESS')

  const keypair = adminPrivKey.startsWith('suiprivkey')
    ? Ed25519Keypair.fromSecretKey(adminPrivKey)
    : Ed25519Keypair.fromSecretKey(Buffer.from(adminPrivKey, 'hex'))
  const client = new SuiClient({ url: getFullnodeUrl(network) })

  const {
    packageId,
    srTreasuryId,
    ssrTreasuryId,
    surveyRegistryId,
    nullifierRegistryId,
    issuerConfigId,
  } = await deployPackage(client, keypair, adminAddress)

  const poolId = await initAmmPool(client, keypair, packageId, adminAddress)

  // Set Issuer Pubkey（私鑰來自根目錄 .env 的 SURVEY_PASS_ISSUER_PRIV，缺值則用 dev key）
  let issuerPrivHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!issuerPrivHex) {
    issuerPrivHex = '0101010101010101010101010101010101010101010101010101010101010101'
  }
  const issuerPrivClean = issuerPrivHex.startsWith('0x') ? issuerPrivHex.slice(2) : issuerPrivHex
  const issuerKeypair = Ed25519Keypair.fromSecretKey(
    new Uint8Array(Buffer.from(issuerPrivClean, 'hex')).slice(0, 32)
  )
  const issuerPubkeyBytes = issuerKeypair.getPublicKey().toRawBytes()

  console.log('Setting issuer public key on-chain…')
  const setPubkeyTx = new Transaction()
  setPubkeyTx.moveCall({
    target: `${packageId}::survey_pass::set_issuer_pubkey`,
    arguments: [
      setPubkeyTx.object(issuerConfigId),
      setPubkeyTx.pure.vector('u8', Array.from(issuerPubkeyBytes)),
    ],
  })
  const setPubkeyResult = await client.signAndExecuteTransaction({
    transaction: setPubkeyTx,
    signer: keypair,
  })
  await client.waitForTransaction({ digest: setPubkeyResult.digest })
  console.log(`  Issuer public key set: ${Buffer.from(issuerPubkeyBytes).toString('hex')}`)

  mergeRootEnv({
    SUI_PACKAGE_ID: packageId,
    SR_TREASURY_ID: srTreasuryId,
    SSR_TREASURY_ID: ssrTreasuryId,
    AMM_POOL_ID: poolId,
    SURVEY_REGISTRY_ID: surveyRegistryId,
    PASS_REGISTRY_ID: nullifierRegistryId,
    ISSUER_CONFIG_ID: issuerConfigId,
  })



  console.log('\n✅ Reset 完成。下一步：')
  console.log('   1. 重啟 BFF：在 bff/ 目錄 Ctrl+C 後 `pnpm dev`')
  console.log('   2. 重啟前端：在 frontend/ 目錄 Ctrl+C 後 `pnpm dev`')
  console.log('   3. 清掉瀏覽器 localStorage 裡舊的 draft / survey / pass key')
  console.log('   4. 重新連錢包、重發問卷')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
