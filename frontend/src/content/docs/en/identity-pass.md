---
title: SurveyPass Identity Token
order: 4
---

# SurveyPass Identity Token

SurveyPass is an on-chain pass made by SurveySui: a **non-transferable** Soulbound Token. It lets survey creators confirm that "each answer comes from a different user" without exposing any of your personal data.

A single SurveyPass can carry multiple verifications at once (for example, verify with Email first, then add Google later); once a credential expires, simply re-verify to extend it.
A SurveyPass can be burned by yourself at any time, which may incur a tiny sybil-resistance fee.

If your wallet's private key or seed phrase is leaked, you can delete the SurveyPass on the website. But if a verification-source account is leaked and you cannot change that account, you can contact the platform to permanently revoke the SurveyPass's verification.

## Four verification methods

| Method | Flow | Trust level | Validity |
|------|------|----------|--------|
| Email | Receive a code (OTP) and enter it | Tier 0 | 3 months |
| Google | OAuth authorization login | Tier 1 | 3 months |
| GitHub | OAuth authorization login | Tier 1 | 3 months |
| World ID | World App proof-of-personhood | Tier 2 | 365 days |

We recommend using a Google or GitHub account — convenient and common (some surveys or platform sponsorship policies may require Tier 1), and it also gives you Email verification at the same time.
World Orb provides the strongest proof-of-personhood and the longest validity.
Email suits surveys with low sybil-resistance requirements; it's the better-than-nothing tier.

## Privacy design: your personal data is not on-chain

During verification, your Email or social account is used only at the moment of verification and is **not stored on-chain**. What the chain records is an identifier called a nullifier — derived from your real account (salted) via a SHA-256 hash:

- The same account always produces the same nullifier.
- The nullifier cannot be reversed back into your account, not even by a (known) quantum computer.
- When you answer a survey it is hashed once more, so the same nullifier's behavior cannot be tracked across different surveys (though a wallet's on-chain interactions can be tracked).

This is the mechanism that "masks your real identity."

## Mint cost and sponsorship

Minting a Pass requires an on-chain transaction. The platform provides **2 free sponsorships per wallet for life** (mint + renewal share this quota), so ordinary users pay nothing at first. Beyond the quota, if you need to renew a credential, you'll have to pay your own gas (for example, by selling survey rewards or buying SUI).

## Deleting a SurveyPass

You can delete your own SurveyPass at any time (for example, when changing wallets). Note:

- Self-paid minted SurveyPass: delete directly, no extra fee.
- Platform-sponsored minted SurveyPass: because deleting an on-chain object produces a storage deposit rebate (returned to the funder), a sponsored Pass must be deleted via the platform, or you pay an on-chain escape fee to delete it yourself (the actual amount depends on the sponsorship cost at mint time).
- After deletion, the nullifier of a **valid** credential is released, and the same account can re-verify; a revoked account cannot start over by deleting.
