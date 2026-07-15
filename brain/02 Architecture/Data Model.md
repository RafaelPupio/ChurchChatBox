# Data Model

Every table carries **`church_id` from day one**. v1 has exactly one church row; that column is what makes church #2 a row instead of a rewrite.

## Tables
- **`church`** — name; WhatsApp credentials (`phone_number_id`, `access_token`, `webhook_verify_token`, `app_secret`); **and every global bot string**: `greeting_text`, `menu_header_text`, `menu_button_label`, `fallback_text`, `unsupported_media_text`, `error_text`, `prayer_prompt_text`, `prayer_thanks_text`, `handoff_text`, `handoff_closed_text`.
- **`menu_item`** — `church_id`, `position`, `label`, `body_text`, `image_url` (nullable), `is_active`, `kind`:
  - `content` — replies with `body_text` + optional image. Covers Horários, Endereço, Agenda, Calendário do Mês, OTB Jovens, GD Adultos, Ofertas, **and anything staff invent later**.
  - `prayer` — starts the prayer capture flow.
  - `human` — switches the contact to human mode.
- **`contact`** — `church_id`, `phone`, `name`, `mode` (`bot` | `human` | `awaiting_prayer`), `mode_changed_at`, `last_inbound_at` (drives the 24h window).
- **`message`** — `church_id`, `contact_id`, `wa_message_id` (**unique — the dedupe key**), `direction`, `body`, `created_at`. Powers the inbox.
- **`prayer_request`** — `church_id`, `contact_id`, `text`, `status` (`novo` | `orado`), `created_at`.
- **`admin_user`** — `church_id`, `email`, `password_hash`, `name`.

## Why the menu is data, not code
Three `kind` values cover every option the church has today *and* every one they'll invent. A new group ("Ministério de Louvor") is a row staff create in the panel — not a deploy. `is_active` lets seasonal content (🎄 Cantata de Natal) sleep 11 months without being deleted.

This is the whole point of the project. A hardcoded menu would technically work and would quietly make the church dependent on Rafael forever.

## Why the strings live here too
**Nothing user-facing is hardcoded** — see [[Home]]. The `church` table's string columns exist so staff can retune tone without a developer. Seed data provides pt-BR defaults so the bot works on day one, but each default is an **editable row, not a constant**.

## Dedupe, specifically
`message.wa_message_id` is **unique** because Meta can deliver the same message twice even when we succeed. Without that constraint, a member gets the menu three times. See [[Troubleshooting]].
