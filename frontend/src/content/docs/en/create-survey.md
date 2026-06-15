---
title: Create a Survey
order: 2
---

# Create a Survey

The full flow: design the survey -> set rewards -> fund and publish on-chain -> manage progress -> close and wrap up.

## Step 1: Design the survey

Surveys are written in a Markdown editor and support four question types:

- Single choice: the respondent picks one.
- Multiple choice: more than one can be selected.
- Text: free input.
- Scale: e.g. a 1–5 satisfaction rating.

Choice questions support up to 50 options.
The system also supports randomizing option order to reduce ordering bias.

You can choose to *encrypt the survey questions locally* before they go on-chain. Survey questions within 10 KB are stored directly on-chain; larger surveys are automatically stored on Walrus instead, so you'll need Walrus tokens to cover the storage cost for large surveys. Either way, the survey's hash is bound to the vault. **Once a survey is published it cannot be modified.**

## Step 2: Set participation conditions and rewards

Deadline: a survey is valid for up to 3 months and automatically stops accepting answers when it expires.
Accepted verification sources: you can choose which verification sources (Email, Google, GitHub, World ID) of users you accept, or require holding a specific NFT. Stronger required verification (such as World Orb) makes it harder to spam with fake accounts, but also shrinks your audience.

Reward rules:
- Reward amount per answer (the amount each first-time respondent claims).
- Maximum number of slots (budget cap = slots × per-answer reward).
- Repeat answering (optional): allow the same person to answer again and claim a lower repeat reward, suitable for tracking studies.

## Step 3: Fund and publish on-chain

After the settings are complete, you enter the funding page, where the system lists the estimated total cost.
Once confirmed, the following actions complete within the same interaction (all succeed or the whole thing is canceled — there is no intermediate state where "a few steps failed"):

1. Spend SUI to mint the reward token SSR.
2. Create the survey's dedicated vault and inject the SSR reward.
3. Inject the gas reimbursement reserve.
4. Pay the 20% protocol fee, currently half price.
5. Register the survey content (hash bound to the vault).
6. Open the vault for the public to answer.

After this you'll get a survey link that you can share directly.

Tip: if the survey questions are also encrypted, the part of the URL after the `#` is the decryption key — be careful not to leak it.

## Step 5: Close and wrap up

The dashboard shows in real time: number answered, completion rate, rewards paid out, remaining budget, and the countdown to the deadline.

Close: the creator can close at any time; after closing, the remaining reward budget and gas reserve are returned to your wallet, and the survey stops accepting answers. After the deadline passes, anyone can trigger the close, but the funds are still returned to you.

View results: on the results page, decrypt all answers with your key, with basic statistics built in.

Burn: after closing, you can burn the survey's questions and **answers**. Burning runs in batches of 500 answers each; the last batch burns the vault and the survey object and reclaims the deposit (storage rebate) for the on-chain storage that was occupied. If you leave it unattended, the platform will automatically clean it up after the grace period. The surplus after deducting execution cost will have *50% taken as a fee*, so be sure to remember to burn the data.
