# 單筆 `purge` 可刪除答案數上限 — 測量結果

> 測量分支 `measurement`，localnet，2026-06-14。原始數據見 [measure-purge-results.json](./measure-purge-results.json)，腳本見 [src/measure-purge.ts](./src/measure-purge.ts)。

## 天花板數據

| payload（鏈上 `AnswerRecord.payload`） | 最大安全 N | 首次失敗 N | 該 N 的 upfront gas | netGas（含 rebate） | 限制因素 |
|---|---|---|---|---|---|
| 小（blob-id ~100 B） | **975** | 1000 | 0.0455 SUI | −2.81 SUI | 物件刪除數量上限 |
| 大（inline ~6144 B） | **975** | 1000 | 1.487 SUI | −45.7 SUI | 物件刪除數量上限 |

真實執行驗證（非 dry-run）：N=243 與 N=975 皆成功且 vault 確實被銷毀，與 dry-run 結論一致。

## 關鍵結論

1. **天花板 ≈ 1000 筆，與 payload 大小無關。** 大小兩種 payload 的最大安全 N 完全相同（975，硬牆在 1000）。
2. **限制因素不是 gas，而是 Sui 單筆交易的物件刪除/dynamic field runtime 上限。** 失敗錯誤是 `dynamic_field::remove_child_object` 的 `MovePrimitiveRuntimeError`（command 0），不是 gas budget 不足。
3. **gas 永遠不是瓶頸。** 即使大 payload 在 975 筆時 upfront 也只 1.49 SUI，遠低於 50 SUI cap。推算即使到 inline 絕對上限 32 KB，gas 仍 < ~8 SUI——在撞到 gas cap 之前，早就先撞到 ~1000 的數量牆。故先前「大答卷 N 上限更低」的假設在此 regime **不成立**：數量牆對大小答卷一視同仁。
   - storage rebate 隨 payload 變大而暴增（大 payload netGas −45.7 SUI），但只影響成本/分帳，不影響上限。

## 建議

### 1. `PURGE_ANSWERS_BATCH`：100 → **500**

- 現值 100 過於保守，使 >100 筆問卷不必要地分多筆。
- 硬牆 ~1000；975 已含末筆銷毀 vault/survey/3 個 table UID 的固定開銷（測量是 batch 設超大、單筆刪光的 all-in-one 情境）。
- 取 **500** 留約 2× 安全邊際，兼顧協議常數可能隨 Sui 版本變動的風險；同時把分批輪數較現況砍 5 倍。實務可接受上限 ~750，硬上限 ~975。
- 註：table（`used_nullifiers`/`claim_counts`/`used_blob_ids`）以 `table::drop` 銷毀，只刪 table UID、不逐筆刪 entry，故 table 內容**不**計入每筆刪除數；答案 dynamic field 才是主導，與本測量一致。

### 2. `purge_batch(&mut) + purge_finalize` refactor：**不需要**

- 天花板是**每筆交易**的物件刪除上限，PTB 內多個 moveCall 共用同一上限——拆成多個 `purge_batch` 塞進一筆 PTB 不會提高總量，反而單一 moveCall 內迴圈 df::remove 最省 command overhead。
- 因此「先查筆數、一次塞進一筆 PTB」對 ≤ ~975 筆問卷本就可行（把 batch 設足夠大即可），對 > ~975 筆則是協議硬限制、**多筆交易無法避免**，與是否 refactor 無關。
- 結論：維持現行「多筆 + `answers_purged` 游標」設計，僅調高 batch 即可。

### 3. 文件修正

[Overflow_2026_亮點說明.md](../frontend/src/content/docs/zh/Overflow_2026_亮點說明.md) 中 `purge` 列於「單一 PTB 內完成」表並宣稱原子性，應加註條件：**答案數 ≤ 約 1000 時單筆完成；超過則協議層強制分批多筆、僅末筆銷毀分帳**，避免讀者誤以為任意規模都是原子單筆。

## 收尾提醒

`bulk_add_answers_for_measurement`（[survey_vault.move](../contracts/sources/survey_vault.move)）與本腳本僅供 `measurement` 分支量測，**禁止 merge 進 main 或部署任何公開網路**；採用 batch 調整時，只需改 `PURGE_ANSWERS_BATCH` env / 鏈上 `set_purge_answers_batch`，不涉及上述測量碼。
