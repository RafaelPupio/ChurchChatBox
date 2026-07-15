# Overview

A **WhatsApp automated secretary** for a church. Members message a dedicated church number and get instant answers in **Brazilian Portuguese**: service times, address, events, the monthly calendar, youth (OTB Jovens) and adult (GD Adultos) groups, and offerings. They can also send a prayer request or ask to talk to a real person.

Church staff run the whole thing from a **Portuguese web admin panel**. No developer required to change what the bot says or which options exist.

## Who it's for
- **Members** — want a fast answer at 9pm without bothering anyone.
- **Church staff** — want to stop retyping the same answers, and to not lose prayer requests.
- **Rafael** — maintainer; also the person who'd onboard a second church later.

## Shape: one church now, product later
Built for one church, but **every table is keyed by `church_id` from day one**. Church #2 is a database row, not a rewrite. What's deliberately *not* built yet: the multi-church onboarding UI. See [[Decisions Log]].

## The full spec
The approved design doc lives in the repo — the authoritative source, more detailed than this brain:

`docs/superpowers/specs/2026-07-15-secretaria-virtual-whatsapp-design.md`

This brain is the fast path; the spec is the contract.

## Deliberate non-goals (v1)
- **No AI.** Menu-only, by decision — predictable and free. See [[Decisions Log]].
- **No broadcasts** to members (Meta charges for those and requires template approval).
- **No member database, giving records, or event registration.**
- **No multi-church UI** (schema is ready; UI is later).

## Status
Design approved 2026-07-15. No code written yet. Next: implementation plan → scaffold. See [[Launch Roadmap]].
