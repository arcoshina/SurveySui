---
title: FAQ
order: 6
---

# Frequently Asked Questions

## Why do I need a wallet?
The reward is a token paid out on-chain, and your wallet is your receiving account; at the same time, wallet signatures replace traditional account passwords and are how you authorize each operation. The platform does not custody any of your assets or keys.

## Can the SSR reward be converted to cash?
The platform does not offer this. SR and SSR are reward tokens of the platform's ecosystem; for now you can hold them or use them directly as the budget for surveys you create yourself. There is no feature to swap them directly back to SUI, so understand their implied value as "in-ecosystem points." The good news, though, is that the platform cannot interfere with the free transfer and trading of SSR.

## Can I use it with no cryptocurrency at all?
Yes. Respondents never need to hold SUI. The answering gas fee is sponsored by the creator, and the first two identity verifications are sponsored by the platform. You only need a wallet (we recommend beginners start with the Slush wallet extension paired with social-account zkLogin, then take time to properly learn the rules of blockchain).

## Who can see my answers?
Answers in a public survey can be seen by anyone.
If an answer is set to be encrypted, it is encrypted in your browser before being sent, and the decryption key is held by the creator via their wallet, so under normal circumstances only the survey creator can see it.
The chain only stores a hashed identity identifier, which cannot be reversed back into an Email or social account.

## Can I answer the same survey twice?
By default, one answer per person. If the creator enables "repeat answering," you can answer again within the allowed number of times and claim the repeat reward. Switching wallets or accounts to claim again doesn't work — eligibility is bound to your verified identity, and the same Email / social account counts as one person on the same survey.

## My answering eligibility was rejected — why?
Common reasons: slots are full, the survey has ended, your verification method is not on the creator's accepted list (for example, the survey requires World ID but you only bound Email), or you've already answered. The survey page will show the specific reason.

## Will the survey and answers stay on-chain forever?
No. After a survey is closed, the creator or the platform burns the survey object and deletes the on-chain answer data. Creators who need to keep results should export them before burning.

## What is the minimum SUI needed to create a survey?
Cost = reward budget + protocol fee cut + gas reimbursement reserve (estimated from slots). The website lists the exact amount before you sign. Any budget and gas the survey didn't use up are fully refunded at close.

## Can the creator default and not pay the reward?
No. The budget is locked into the on-chain vault when the survey is created, and the payout is executed by the smart contract within the same transaction in which you submit your answer — the creator has no step to intercept or review it. The only thing the creator can do is close the survey; rewards already paid out cannot be reclaimed.

## If the platform shuts down, will my rewards disappear?
Rewards already received into your wallet are recorded on the blockchain and do not depend on the platform's servers. Eligibility verification and payout logic are both in on-chain contracts, so even if the platform goes offline, users can still interact directly with the contracts until their SurveyPass expires.

## Has it officially launched yet?
Not yet. The platform currently runs on the Sui testnet: tokens have no real value for now. All data and quotas may be reset to zero before the official launch, so do not store anything of value.
