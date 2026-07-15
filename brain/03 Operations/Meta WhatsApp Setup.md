# Meta WhatsApp Setup

The Cloud API bureaucracy, in order. **This is the slow part of the project** — start it early.

## Order of operations
1. Create a **Meta Business account** + a **WhatsApp Business app**.
2. **Start business verification immediately.** Takes days, may request documents; **CNPJ helps**. Outside our control — begin it in parallel with coding, not after.
3. Buy a **new chip** for the bot number. ⚠️ Never the church's existing number — see below.
4. Connect the number in Meta's console; set the **webhook URL** + **verify token**.
5. Paste credentials into the panel's **Configurações** (they live in the DB, not env vars — see [[Data Model]]).

## ⚠️ The irreversible one
A number connected to the Cloud API **stops working in the normal WhatsApp app — permanently**. Chat history does not migrate, and staff lose app access to it. This is why the bot gets a **new dedicated chip** and the church's known number keeps working untouched. Getting this wrong costs the church its main line.

## Free test number
Meta provides a **free test number**. Everything (menu, prayer flow, handoff, inbox) can be built and tested on it. **No real number is needed until launch** — bureaucracy never blocks development. See [[Launch Roadmap]].

## Costs
**User-initiated conversations are free** — that is 100% of this bot's traffic, since members always message first. Church-initiated messages (broadcasts) cost money *and* need template pre-approval; explicitly a non-goal. See [[Overview]].

## The 24-hour window
Meta only allows free-form replies within **24h of the member's last message**. This is a Meta rule, not our choice, and it shapes the inbox: the panel shows the remaining window and **blocks expired sends with a Portuguese explanation** rather than failing mysteriously. See [[Troubleshooting]].

## Security
Meta signs every webhook request (`X-Hub-Signature-256`, verified against `app_secret`). **Unsigned or invalid requests are rejected** — otherwise anyone who learns the URL could inject fake messages into the church's inbox.
