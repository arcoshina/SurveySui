## 警告整理(部署已成功,以下皆為 lint warning,非錯誤)

| # | 代碼 | 位置 | 意義 | 建議處置 | 優先 |
|---|------|------|------|----------|------|
| 1 | Lint W99001 非可組合 transfer | `sources/survey_pass.move:490` (`self_delete_sponsored_pass`) | 直接 `public_transfer(fee, ctx.sender())` 轉回發起人,linter 偏好 return 物件以利 PTB 組合 | 屬刻意設計則加 `#[allow(lint(self_transfer))]` 消音 | 低(風格) |

| 3 | W09002 unused variable | `sources/survey_vault.move:351` | 參數 `nft: &Nft` 宣告未使用 | 介面需保留→改 `_nft`;否則刪除 | 低 |
| 4 | W09002 unused variable | `sources/survey_vault.move:352` | 參數 `attribute_nullifiers` 宣告未使用 | 介面需保留→改 `_attribute_nullifiers`;否則刪除 | 低 |

**說明**
- 全部不影響部署與執行,可暫不處理。
- 唯一建議盡早處理的是 #2 deprecated:Sui 版本升級時 `type_name::get` 可能被移除,屆時會變編譯錯誤。
- #1 牽涉行為語意(代付 Pass 自刪返費流向),改動前需確認不影響現有設計,建議僅消音不改邏輯。
- #3/#4 純清理,改底線前綴最安全(保留介面簽章)。

| 2 | W04037 deprecated usage | `sources/survey_vault.move:292` | `type_name::get` 已改名為 `with_defining_ids`,舊名標記棄用 | 改為 `type_name::with_defining_ids<Nft>()` | 中(未來可能移除) |


---

Building Move package…
[NOTE] Dependencies on Sui, MoveStdlib, Bridge, DeepBook, and SuiSystem are automatically added, but this feature is disabled for your package because you have explicitly included dependencies on Sui. Consider removing these dependencies from `Move.toml`.
INCLUDING DEPENDENCY MoveStdlib
INCLUDING DEPENDENCY Sui
BUILDING surveysui
warning[Lint W99001]: non-composable transfer to sender
    ┌─ .\sources\survey_pass.move:490:9
    │
477 │ public fun self_delete_sponsored_pass(
    │            -------------------------- Returning an object from a function, allows a caller to use the object and enables composability via programmable transactions.
    ·
490 │         transfer::public_transfer(fee, ctx.sender());
    │         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    │         │                              │
    │         │                              Transaction sender address coming from here
    │         Transfer of an object to transaction sender address
    │
    = This warning can be suppressed with '#[allow(lint(self_transfer))]' applied to the 'module' or module member ('const', 'fun', or 'struct')

warning[W04037]: deprecated usage
    ┌─ .\sources\survey_vault.move:292:70
    │
292 │     let actual = ascii::into_bytes(type_name::into_string(type_name::get<Nft>()));
    │                                                                      ^^^ The function 'std::type_name::get' is deprecated: Renamed to `with_defining_ids` for clarity.
    │
    = This warning can be suppressed with '#[allow(deprecated_usage)]' applied to the 'module' or module member ('const', 'fun', or 'struct')

warning[W09002]: unused variable
    ┌─ .\sources\survey_vault.move:351:5
    │
351 │     nft: &Nft,
    │     ^^^ Unused parameter 'nft'. Consider removing or prefixing with an underscore: '_nft'
    │
    = This warning can be suppressed with '#[allow(unused_variable)]' applied to the 'module' or module member ('const', 'fun', or 'struct')

warning[W09002]: unused variable
    ┌─ .\sources\survey_vault.move:352:5
    │
352 │     attribute_nullifiers: &vector<vector<u8>>,
    │     ^^^^^^^^^^^^^^^^^^^^ Unused parameter 'attribute_nullifiers'. Consider removing or prefixing with an underscore: '_attribute_nullifiers'
    │
    = This warning can be suppressed with '#[allow(unused_variable)]' applied to the 'module' or module member ('const', 'fun', or 'struct')

Please report feedback on the linter warnings at https://forums.sui.io

