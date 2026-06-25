---
title: Overflow 2026 Highlights
order: 0
---

# Overflow 2026 Highlights

## Programmable, answer-and-claim payments

SurveySui bundles sybil-resistant verification -> answer recorded on-chain -> reward payout into a single PTB interaction, making incentivized surveys simple and efficient for both sides.

On SurveySui, you no longer fill out a survey and then wait for the operator to wire the money. Instead, it is a conditional payment that automatically verifies eligibility, prevents spam, and releases funds the moment the conditions are met. Reward payout is executed conditionally by the contract — no need to trust the creator or the platform.

## What We Built

An **on-chain survey platform** for small businesses: creators write surveys in Markdown and fund a reward budget; even respondents who are not crypto-native can complete an initial answer-and-claim flow without holding any SUI. "Collecting answers" and "paying out rewards" are no longer a tedious, high-cost sequence of steps, but a single information transaction guaranteed to settle by the contract.

| Role | Need | What they do |
|------|------|-----|
| Creator | Gather market insights | Fund, promote, organize data |
| Respondent | Express opinions | Answer, claim SSR |
| Administrator | Operate the service | Maintain the system and the reward reserve pool |

## Why We Need It

### An inefficient market with still-low penetration

"When a reward is offered, survey response rates rise significantly and the data is more detailed." This is a clear niche market willing to pay for reliable samples.

Surveys can provide more granular insight than post analysis. Yet a single survey's data has limited value, and survey systems carry high friction. Even when respondents opt for gift cards that require no bank transfer, they still have to accumulate many points to reach the redemption threshold. Many respondents give up because they never reach the threshold, and some even feel the effort is disproportionate to the payoff and suspect they are being scammed.

SurveySui aims to rebuild the existing process with the efficiency of blockchain, so respondents claim their reward right after answering. Respondents don't have to accumulate points to a threshold before withdrawing, nor pay high fees.

| Platform | Region | Estimated scale | Basis | Source |
|-----|-----|-----:|--------|-----|
| Toluna Influencers | Global | 6 MUSD | ~294M revenue in 2026 | growjo |
| Swagbucks | US | 3 MUSD | ~65M revenue in 2024 | rocketreach |
| Premise | Global | 2 MUSD | ~30M revenue in 2023 | getlatka |
| OpinionWorld | Taiwan | 5 MUSD | Claims ~5M paid out per year | swiftsalary |
| iX:Panel | Taiwan | 2 MUSD | Rough estimate from 220k members | ixresearch |

The mainstream revenue model for reward surveys is per-completed-sample pricing, where the unit price already bundles the respondent's reward cost and the platform's cut. The reward itself is the core engine of this business — and the engine's reliability is exactly where on-chain adds value.

## How It Works

### Token economy

The platform token is **SR** (Survey Reward). Creators spend SUI to mint SR from the token pool; once minted, SR is automatically **locked** into the pool, and the creator receives **SSR** (Staked Survey Reward) representing that right. Creators pre-inject SSR into a survey's dedicated vault as rewards for respondents. The SSR a respondent receives can circulate freely, but cannot be swapped directly back to SUI from the token pool.

The SUI spent to mint SR is also locked in the token pool as reserve. The mint price of SR is determined by the SR / SUI ratio inside the pool. The project team can unlock SUI from the pool, buy back SSR on the market, and burn an equal amount of SR and SSR in the pool, keeping the market stable and predictable. Third parties may freely create swap pools, and the project team has no power to interfere.

### SurveyPass sybil-resistant design

Each wallet holds one soulbound **SurveyPass** that can bind multiple identity sources at once (Email, OAuth, World ID). SurveyPass writes the verified identity into the record as a salted one-way hash, globally binding "one identity, one wallet"; each survey additionally hashes its own independent nullifier, ensuring no duplicate answers while making cross-survey correlation difficult.

When a user needs to change wallets, they can burn the entire SurveyPass and re-mint verification on a new wallet. Burning a SurveyPass requires no authorization from the project team — the owner can pay to delete it at any time.

### Survey encryption and security design

The body of an encrypted survey is encrypted with `AES-256-GCM + a URL fragment key`; the chain stores the ciphertext, the question hash, and the question-type structure. Answers use `X25519 + post-quantum ML-KEM-768` hybrid encryption, and the creator can decrypt them with just their wallet.

When the frontend renders Markdown, it escapes all raw HTML, intercepts malicious link protocols such as javascript: / data:, and routes all external images through a backend proxy — eliminating XSS, script, and link injection. Once the content hash is on-chain it cannot be tampered with, providing integrity verification. If a hash mismatch is detected, a warning page appears but answering is not hard-blocked.

### Gas sponsorship mechanism

The gas a respondent needs to answer is first sponsored by the backend, with the backend reimbursed from the vault prefunded by the creator. If the vault runs dry or the backend goes offline, the respondent can still choose to pay their own gas to answer.

## How you used the Sui stack

### 1. Atomic fund flow with PTBs

Multi-step fund flows are compressed to complete atomically within a single transaction, with no intermediate inconsistent state. The vault remains a single-owner object until funding is complete, becoming a shared object and publicly reachable only after funding; during that window it is unreachable from the outside. Eligibility authorization for claim is enforced on-chain by the Pass type and nullifier, not by backend rules. Combined with Sponsored Transactions, the respondent has a 0 balance the entire time and only needs to sign once.

### 2. Soulbound Pass + nullifier sybil resistance

Eligibility verification lives entirely in the contract; the backend only issues identity credentials, so even if the backend is compromised it cannot forge eligibility or claim rewards twice. A salted one-way hashed nullifier handles the global "one identity, one wallet" binding and per-survey de-duplication; the chain stores only the hash, not personal data, and the real identity cannot be reverse-derived from on-chain data. The Pass's non-transferability is guaranteed by the type system (`has key` without `store`), not by backend rules.

### 3. On-chain resource utilization — storage rebate

Forced data deletion: frontend UI + high overdue fees guide creators to release on-chain space. If a creator still hasn't burned the data three months after the survey ends, the backend force-burns it and takes 50% of the deposit after deducting cost as a fee. If the backend fails, after one year anyone is allowed to trigger the burn. Large questions are offloaded to Walrus, with only the blobId index kept on-chain.

## Future outlook

- Activate locked assets: beyond SUI, add yield-bearing assets similar to SuiUSDe to the token pool, so the locked reserve is no longer just static collateral. The yield these assets continuously generate can flow back to support SR's value, making the token pool more robust without additional issuance.
- More granular audience segmentation: creators can set answering thresholds based on respondent self-reported attributes such as age, region, and occupation. This lets the reward budget target the intended audience precisely, raising the representativeness and commercial value of collected samples.
- Stronger sybil resistance: on top of the existing multi-identity binding, introduce KYC-grade unique-human verification to further prevent large-scale sybil attacks. For high-value or highly sensitive surveys, this ensures every sample comes from a unique, real respondent.
- Add community features: based on respondents' answering history and interest tags, the platform proactively matches and recommends suitable surveys. This shortens the distance between creators and their target respondents while improving respondent participation and long-term retention.
