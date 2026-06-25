---
title: Answer & Claim
order: 3
---

# Answer & Claim

Answer one survey, claim one reward — **you don't need any gas in your wallet**.

## Flow overview

1. Open the survey link: the page shows the survey description, reward amount, and remaining slots.
2. Connect your wallet: if you don't have one, we recommend quickly creating a Slush wallet with a Google account.
3. (First time) Get your SurveyPass: choose one verification method — we recommend social OAuth, which also gives you Email verification. After verifying, a SurveyPass belonging to you is minted on-chain. Different sources have different validity periods and need renewal once expired. The first two mints are sponsored by the platform. See the "Identity Verification & SurveyPass" article for details.
4. Answer and submit: your wallet pops up a signature request on submit. The gas for this transaction is sponsored by the creator (except for oversized answers).
5. Receive the reward instantly: once the transaction is on-chain, the survey's smart contract verifies your answer and transfers the reward token SSR from the survey's vault to your wallet address.

## Why don't I pay a fee?

Blockchain transactions need a small amount of SUI as a compute fee (gas). SurveySui uses Sui's **sponsored transactions** mechanism: the creator prefunds a gas reimbursement when creating the survey, the platform fronts your fee first, then gets reimbursed from that reserve.

If the platform's sponsorship server goes offline, you can use the SUI in your wallet to pay your own gas, and you'll still receive the SSR reward once your answer is on-chain.

## Who can see my answers?

For surveys with answer encryption enabled:
- Encryption happens on your device, and the ciphertext is sent on-chain.
- Only the survey creator holds the decryption key; the platform and anyone else **cannot** decrypt your answer.
- The chain stores the **hashed** Email and social account, so on-chain data only reveals a wallet address and cannot be traced back to your identity.

For fully public surveys:
- Anyone can see your answer.
- They can also see your wallet address.
- The chain stores the **hashed** Email and social account, so it still cannot directly trace back to your identity, *but it may be possible to infer your identity from the answer content*.
**Do not reveal any private information in a public survey.**

## What is the SSR I received?

SSR (Staked Survey Reward) is the platform's reward token, minted in the reserve pool from the SUI the creator invested. Currently you can:

- Hold: SSR stays in your wallet and can be used once features expand in the future.
- Trade: SSR can be transferred and traded freely.
- Create surveys: SSR can be used directly as your reward budget when creating a survey, with no need to buy SUI to swap.

Note: SSR cannot be swapped directly back to SUI — think of it as reward points within the platform's ecosystem.

## Can I answer the same survey twice?

By default, one answer per person. But if the creator has enabled "repeat answering," you can answer again within the allowed number of times and claim the repeat reward the creator set. How many times are allowed is shown on the survey page.
