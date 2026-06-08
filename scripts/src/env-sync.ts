import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

type ObjectChange =
  | { type: 'published'; packageId: string }
  | { type: 'created'; objectType: string; objectId: string }
  | { type: string; [key: string]: unknown }

interface DeployOutput {
  objectChanges: ObjectChange[]
}

function parseDeployOutput(json: DeployOutput): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const change of json.objectChanges) {
    if (change.type === 'published') {
      vars['SUI_PACKAGE_ID'] = (change as { type: 'published'; packageId: string }).packageId
    }
    if (change.type === 'created') {
      const c = change as { type: 'created'; objectType: string; objectId: string }
      if (c.objectType.includes('::survey_reward::SrTreasury')) vars['SR_TREASURY_ID'] = c.objectId
      if (c.objectType.includes('::stacked_survey_reward::SsrTreasury'))
        vars['SSR_TREASURY_ID'] = c.objectId
      if (c.objectType.includes('amm_pool::Pool')) vars['AMM_POOL_ID'] = c.objectId
      if (c.objectType.includes('::survey_registry::Registry'))
        vars['SURVEY_REGISTRY_ID'] = c.objectId
    }
  }

  return vars
}

function mergeEnvFile(filePath: string, updates: Record<string, string>): void {
  const existing: Record<string, string> = {}

  if (existsSync(filePath)) {
    const lines = readFileSync(filePath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      existing[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
    }
  }

  const merged = { ...existing, ...updates }
  const content = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  writeFileSync(filePath, content + '\n', 'utf8')
}

const inputPath = process.argv[2] ?? resolve(__dirname, '../../scripts/deploy-output.json')
const outputPath = process.argv[3] ?? resolve(__dirname, '../../.env')

const raw = readFileSync(inputPath, 'utf8')
const deployOutput = JSON.parse(raw) as DeployOutput
const extracted = parseDeployOutput(deployOutput)

if (Object.keys(extracted).length === 0) {
  console.warn('Warning: no known object IDs found in deploy output')
} else {
  mergeEnvFile(outputPath, extracted)
  console.log(`✓ Written to ${outputPath}:`)
  for (const [k, v] of Object.entries(extracted)) {
    console.log(`  ${k}=${v}`)
  }
}
