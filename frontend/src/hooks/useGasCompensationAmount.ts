import { useMemo } from 'react'
import { useSuiClientQuery } from '@mysten/dapp-kit'
import type { GasHealth } from '../lib/sponsoredTx'

const PROTOCOL_CONFIG_ID = import.meta.env.VITE_PROTOCOL_CONFIG_ID ?? ''

export interface GasCompensationResult {
  /** 送進合約 create_empty 的 per-response gas 補償；floor 未知前為 0n。 */
  gasCompensationAmount: bigint
  /** 鏈上 ProtocolConfig.min_gas_compensation_mist；尚未載入為 null。 */
  minGasComp: bigint | null
  /** floor 已自鏈上載入；false 時呼叫端應禁止送出（避免帶 0 進合約）。 */
  ready: boolean
}

/**
 * 問卷建立的 per-response gas 補償計算。
 *
 * 以鏈上 `ProtocolConfig.min_gas_compensation_mist` 為權威下限（floor）：
 *   - health 可用且動態值高於下限 → 採動態值；
 *   - health 不可用或低於下限 → 回退到下限。
 * 確保送進 `survey_vault::create_empty` 的 `gas_compensation_amount` 永遠 ≥ 鏈上 min，
 * 杜絕 health 未就緒/BFF 不可用時帶 0n 導致的 `EGasCompTooLow`（abort 31）。
 * floor 取自鏈上而非 .env/BFF，避免設定漂移；ready=false（floor 尚未載入）時呼叫端須禁止送出。
 */
export function useGasCompensationAmount(gasHealth: GasHealth | null): GasCompensationResult {
  const { data } = useSuiClientQuery(
    'getObject',
    { id: PROTOCOL_CONFIG_ID, options: { showContent: true } },
    { enabled: !!PROTOCOL_CONFIG_ID }
  )

  const minGasComp = useMemo(() => {
    const content = data?.data?.content
    if (!content || content.dataType !== 'moveObject') return null
    const raw = (content.fields as Record<string, unknown>).min_gas_compensation_mist
    if (raw == null) return null
    try {
      return BigInt(raw as string)
    } catch {
      return null
    }
  }, [data])

  const gasCompensationAmount = useMemo(() => {
    if (minGasComp == null) return 0n
    const dynamic = gasHealth?.available ? BigInt(gasHealth.gasCompensationAmount ?? '0') : 0n
    return dynamic > minGasComp ? dynamic : minGasComp
  }, [gasHealth, minGasComp])

  return { gasCompensationAmount, minGasComp, ready: minGasComp != null }
}
