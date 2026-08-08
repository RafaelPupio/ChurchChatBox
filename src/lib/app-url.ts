/** The origin that goes in an emailed link.
 *
 *  READ THIS BEFORE "IMPROVING" IT: the base URL must never be derived from the
 *  incoming request — not from the Host header, not from X-Forwarded-Host, not
 *  from `headers()`. Those are attacker-controlled. A request carrying
 *  `Host: evil.example` would produce a reset link pointing at evil.example, the
 *  victim would click it in a message that is genuinely from us, and the token
 *  would be handed straight to the attacker. That is the classic host-header
 *  password-reset takeover, and configuration is the only defence against it.
 *
 *  Resolution order:
 *    APP_BASE_URL                      — explicit, and what production should set.
 *    VERCEL_PROJECT_PRODUCTION_URL     — Vercel's STABLE production hostname.
 *    http://localhost:3000             — local development.
 *
 *  VERCEL_URL is deliberately not consulted: it names the individual deployment,
 *  so a link built from it points at an immutable preview URL that is behind
 *  deployment protection and will not be where the church's panel lives. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  // Vercel supplies a bare hostname with no scheme.
  if (production) return `https://${production.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}
