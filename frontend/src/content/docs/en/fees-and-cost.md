---
title: Fees & Sponsorship
order: 5
---

# Creators pay, respondents answer for free

## The creator's costs

Paid in full once when creating a survey; the funding page lists the complete breakdown before you sign:

| Item | Amount | Destination |
|------|------|------|
| Reward budget | slots × first-time/repeat reward | Locked into the survey vault, paid to respondents |
| Authorization fee | ~~20%~~ of the reward budget, currently 50% off at 10% | Platform |
| Gas reimbursement reserve | Estimated from slots and current rates | Locked into the vault, used when sponsoring |
| Walrus storage fee | Only when the survey exceeds 10 KB | Walrus storage network |

**Remaining rewards are refundable**: at close, the remaining reward budget and gas reserve are returned to the creator; when the survey is burned you also get back the on-chain storage deposit.

**No fee for burning it yourself**: three months after the survey's deadline, the platform will automatically burn the survey content on the creator's behalf and charge a burn fee equal to 50% of the on-chain storage deposit reclaimed at burn time, after deducting gas.

## Zero cost for respondents

We do our best to let respondents answer with a 0 balance; both on-chain operations have a free quota:

| Operation | Free quota | How the quota is computed |
|------|----------|--------------|
| Mint / renew SurveyPass | 2 times | Platform-sponsored |
| Submit a survey to claim | Gas + storage fee | Creator-sponsored |

**What if the quota runs out or the platform goes down?** If a respondent decides the reward minus gas is still worth it, they can pay their own gas to answer.

## Some details

- The lifetime quota count for the Pass has no centralized data table; instead it **counts on-chain history in real time**: scanning the wallet's transactions for the number of "platform-sponsored" mint/update entries.
- The vault sponsors answering gas: due to the constraints of the execution scheme, the platform fronts the gas when answering, then the contract reimburses `gas_compensation_amount` to the sponsor from the survey vault's gas reserve.
- Rate limits: the sponsorship endpoint is 2 req/min, and 5 req/min per wallet; the quota is reserved only after the user's signature is verified, preventing concurrent over-quota and quota sniping.
