# Concepts Explained

Plain-language explanations of the tech in this project.

## Webhook
A URL Meta calls **the instant** someone messages the church number — Meta pushes the message to us; we don't poll. It's why replies feel instant, and why the app must always be awake (see [[Hosting & Deploy]]).

## Why we answer "200 OK" before doing any work
`200` means "got it." If Meta doesn't hear that fast, it assumes failure and **sends the message again** — and a retry means a real person gets the same reply twice. So: acknowledge first, work after. It feels backwards (normally you confirm *after* succeeding), but Meta's retry is the bigger risk. See [[Troubleshooting]].

## Idempotency (the fancy word for "don't repeat yourself")
Handling the same message twice should produce the **same result as handling it once**. We get it by storing each `wa_message_id` with a **unique** constraint — a repeat hits the constraint and is dropped. Cheap insurance against a bot that spams members.

## Pure function (why the router has no database access)
A pure function only reads its inputs and returns an output — no database, no network, no surprises. Same inputs → same output, always. That's why `menu-router.ts` can be tested exhaustively in milliseconds without fixtures. See [[App Structure]].

## The 24-hour window
Meta's rule: a business may only send **free-form** messages within 24h of the customer's last message. It exists to stop businesses spamming people. It's why the inbox shows a countdown, and why staff can't answer a 3-day-old message without a (paid, pre-approved) template. See [[Meta WhatsApp Setup]].

## Interactive list message
WhatsApp's native tappable menu — the member taps a button, gets a list, picks a row. Better than typing "1". Capped at **10 rows**, which is why [[Menu Inventory]] tracks the ceiling.

## Seed data
The rows a fresh database starts with — here, the pt-BR default strings and the 9 menu items. **Seed ≠ hardcoded**: seeds are starting values staff can edit; hardcoded means only a developer can change them. That distinction is the whole project. See [[Data Model]].

## RLS? (no — and why not)
BibleMarathon uses Postgres Row Level Security because its app ships a public key to phones. **Here, nothing public touches the database**: only our server does, behind a login. So plain queries scoped by `church_id` suffice. Different threat model, different tool.

## ORM (Drizzle)
Write TypeScript instead of raw SQL strings, and the compiler catches typos in column names before they reach production. Drizzle specifically because it's light and starts fast — which matters on serverless.
