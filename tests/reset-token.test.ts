import { describe, it, expect } from 'vitest';
import {
  MEASURED_ROUND_TRIP_P99_MS,
  RESET_REQUEST_MIN_INTERVAL_MS,
  RESET_RESPONSE_FLOOR_MS,
  RESET_TOKEN_TTL_MS,
  floorOverrunMs,
  generateResetToken,
  hashResetToken,
  isResetTokenUsable,
  mayRequestNewToken,
  remainingFloorMs,
  resetLinkFor,
  resetRequestCutoff,
  resetTokenExpiresAt,
  resetTokenHashEquals,
} from '@/lib/auth/reset-token';

describe('reset token generation', () => {
  it('never repeats a token', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateResetToken());
    expect(seen.size).toBe(500);
  });

  it('carries 256 bits of entropy', () => {
    // base64url of 32 bytes is 43 unpadded characters. This is the assertion that
    // would fail if someone swapped in a UUID (36 chars, 122 bits) or shortened
    // the token to something friendlier to type.
    const token = generateResetToken();
    expect(token).toHaveLength(43);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('is URL-safe, so the emailed link needs no encoding', () => {
    for (let i = 0; i < 200; i += 1) {
      const token = generateResetToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(token)).toBe(token);
    }
  });
});

describe('reset token hashing', () => {
  it('produces a hash that does not contain the token', () => {
    const token = generateResetToken();
    const hash = hashResetToken(token);
    expect(hash).not.toContain(token);
    expect(hash).not.toBe(token);
  });

  it('is a 64-character hex SHA-256 digest', () => {
    expect(hashResetToken('qualquer-coisa')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic, so the database can look a token up by index', () => {
    // Unlike bcrypt. This property is what makes the single atomic consuming
    // UPDATE possible on a driver with no transactions.
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });

  it('gives different tokens different hashes', () => {
    expect(hashResetToken(generateResetToken())).not.toBe(hashResetToken(generateResetToken()));
  });

  it('matches a known SHA-256 vector', () => {
    // Pins the algorithm: a silent switch to another digest would invalidate every
    // outstanding token in the database rather than fail loudly.
    expect(hashResetToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('resetTokenHashEquals', () => {
  it('accepts equal hashes and rejects different ones', () => {
    const hash = hashResetToken('token-a');
    expect(resetTokenHashEquals(hash, hash)).toBe(true);
    expect(resetTokenHashEquals(hash, hashResetToken('token-b'))).toBe(false);
  });

  it('returns false instead of throwing on a length mismatch', () => {
    // timingSafeEqual throws when lengths differ; an uncaught throw here would be
    // both a crash and a signal.
    expect(resetTokenHashEquals('curto', hashResetToken('token'))).toBe(false);
    expect(resetTokenHashEquals('', '')).toBe(true);
  });
});

describe('expiry', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');

  it('expires one hour after minting', () => {
    expect(resetTokenExpiresAt(now).getTime()).toBe(now.getTime() + 60 * 60 * 1000);
    expect(RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('is usable in the middle of its window', () => {
    const token = { expiresAt: resetTokenExpiresAt(now), usedAt: null };
    expect(isResetTokenUsable(token, new Date(now.getTime() + 30 * 60 * 1000))).toBe(true);
  });

  it('is dead exactly at the expiry instant, not a millisecond later', () => {
    const expiresAt = resetTokenExpiresAt(now);
    expect(isResetTokenUsable({ expiresAt, usedAt: null }, new Date(expiresAt.getTime() - 1))).toBe(true);
    expect(isResetTokenUsable({ expiresAt, usedAt: null }, expiresAt)).toBe(false);
    expect(isResetTokenUsable({ expiresAt, usedAt: null }, new Date(expiresAt.getTime() + 1))).toBe(false);
  });

  it('refuses a token that has already been used, however fresh it is', () => {
    const token = { expiresAt: resetTokenExpiresAt(now), usedAt: now };
    expect(isResetTokenUsable(token, now)).toBe(false);
  });

  it('refuses a used token that is also expired', () => {
    const token = { expiresAt: new Date(now.getTime() - 1), usedAt: now };
    expect(isResetTokenUsable(token, now)).toBe(false);
  });
});

describe('per-account request throttle', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');

  it('allows the first request for an account', () => {
    expect(mayRequestNewToken(null, now)).toBe(true);
  });

  it('refuses a second request inside the interval', () => {
    const justNow = new Date(now.getTime() - 1000);
    expect(mayRequestNewToken(justNow, now)).toBe(false);
  });

  it('allows one again once the interval has elapsed', () => {
    const boundary = new Date(now.getTime() - RESET_REQUEST_MIN_INTERVAL_MS);
    expect(mayRequestNewToken(boundary, now)).toBe(true);
    expect(mayRequestNewToken(new Date(boundary.getTime() + 1), now)).toBe(false);
  });

  it('caps one mailbox at roughly a message a minute', () => {
    expect(RESET_REQUEST_MIN_INTERVAL_MS).toBe(60 * 1000);
  });
});

describe('the throttle cutoff the SQL compares against', () => {
  // The throttle moved into the database when the request flow collapsed to one
  // statement. These assertions are what stop that from becoming a second,
  // drifting copy of the rule: the timestamp handed to the SQL has to decide every
  // case exactly as the pure predicate does.
  const now = new Date('2026-08-08T12:00:00.000Z');

  it('is one interval before now', () => {
    expect(resetRequestCutoff(now).getTime()).toBe(now.getTime() - RESET_REQUEST_MIN_INTERVAL_MS);
  });

  it('agrees with mayRequestNewToken on every case, boundaries included', () => {
    const cutoff = resetRequestCutoff(now);
    const cases = [
      null,
      new Date(now.getTime()),
      new Date(now.getTime() - 1),
      new Date(now.getTime() - 999),
      new Date(cutoff.getTime() + 1),
      new Date(cutoff.getTime()),
      new Date(cutoff.getTime() - 1),
      new Date(now.getTime() - 60 * 60 * 1000),
    ];
    for (const lastRequestedAt of cases) {
      // `last_created is null or last_created <= cutoff`, which is the WHERE clause
      // in issueResetToken written in TypeScript.
      const asSql = lastRequestedAt === null || lastRequestedAt.getTime() <= cutoff.getTime();
      expect(asSql).toBe(mayRequestNewToken(lastRequestedAt, now));
    }
  });
});

describe('reset link', () => {
  it('points at the public reset page with the token as a query parameter', () => {
    expect(resetLinkFor('https://painel.exemplo.br', 'abc123')).toBe(
      'https://painel.exemplo.br/admin/redefinir-senha?token=abc123',
    );
  });

  it('does not double the slash when the base URL has a trailing one', () => {
    expect(resetLinkFor('https://painel.exemplo.br/', 'abc123')).toBe(
      'https://painel.exemplo.br/admin/redefinir-senha?token=abc123',
    );
    expect(resetLinkFor('https://painel.exemplo.br///', 'abc')).toBe(
      'https://painel.exemplo.br/admin/redefinir-senha?token=abc',
    );
  });

  it('carries no church identifier, so the URL cannot say which church exists', () => {
    const link = resetLinkFor('https://painel.exemplo.br', generateResetToken());
    expect(link).not.toMatch(/church|igreja|tenant/i);
  });

  it('percent-encodes a token that is not URL-safe', () => {
    // generateResetToken never produces one, but resetLinkFor must not be the
    // thing that breaks if the token format ever changes.
    expect(resetLinkFor('https://x.br', 'a+b/c=')).toBe(
      'https://x.br/admin/redefinir-senha?token=a%2Bb%2Fc%3D',
    );
  });
});

describe('response timing floor', () => {
  it('owes the full floor when no time has passed', () => {
    expect(remainingFloorMs(0)).toBe(RESET_RESPONSE_FLOOR_MS);
  });

  it('owes the remainder partway through', () => {
    expect(remainingFloorMs(200, 700)).toBe(500);
  });

  it('owes nothing once the floor is reached or passed', () => {
    // Never negative: the caller passes this straight to a sleep.
    expect(remainingFloorMs(700, 700)).toBe(0);
    expect(remainingFloorMs(5000, 700)).toBe(0);
  });

  it('gives both branches of the request form the same total budget', () => {
    // The point of the floor: a fast "unknown email" path and a slow "found it,
    // inserted a row, sent a mail" path both land on the same wall-clock total.
    const unknownEmailElapsed = 3;
    const knownEmailElapsed = 180;
    expect(unknownEmailElapsed + remainingFloorMs(unknownEmailElapsed)).toBe(
      knownEmailElapsed + remainingFloorMs(knownEmailElapsed),
    );
  });

  it('SEPARATES the branches once one runs past it — the bug this file missed', () => {
    // Measured laptop-to-Neon against this project's database, 60 samples, before
    // the request flow was collapsed to one statement. The "address exists" branch
    // was four neon-http round trips; the "no such address" branch was one.
    //
    //     known    min 702.9  p50 713.2  p95 800.8  max 841.2
    //     unknown  min 174.6  p50 177.6  p95 184.6  max 264.8
    //
    // The floor was 700ms, and what it did is worse than "padded nothing". It
    // pinned the UNKNOWN branch to a flat 700ms, erasing the variance that would
    // have made a stopwatch ambiguous, and left the KNOWN branch reporting its raw
    // elapsed time — which never once, in 60 samples, landed inside the floor.
    const OLD_FLOOR_MS = 700;
    const respondsIn = (elapsed: number) => elapsed + remainingFloorMs(elapsed, OLD_FLOOR_MS);

    // Every unknown-address sample, fastest to slowest, answers in exactly 700ms.
    for (const elapsed of [174.6, 177.6, 184.6, 264.8]) {
      expect(respondsIn(elapsed)).toBe(OLD_FLOOR_MS);
    }
    // Every known-address sample, INCLUDING THE FASTEST OF 60, answers slower.
    for (const elapsed of [702.9, 713.2, 800.8, 841.2]) {
      expect(respondsIn(elapsed)).toBeCloseTo(elapsed);
      expect(respondsIn(elapsed)).toBeGreaterThan(respondsIn(264.8));
    }

    // remainingFloorMs reported all of that as a perfectly ordinary 0, which is the
    // same 0 it returns for a branch that arrived exactly on time. floorOverrunMs
    // is what distinguishes them, and what the action now logs on.
    expect(remainingFloorMs(713.2, OLD_FLOOR_MS)).toBe(0);
    expect(remainingFloorMs(700, OLD_FLOOR_MS)).toBe(0);
    expect(floorOverrunMs(713.2, OLD_FLOOR_MS)).toBeCloseTo(13.2);
    expect(floorOverrunMs(702.9, OLD_FLOOR_MS)).toBeCloseTo(2.9);
    expect(floorOverrunMs(700, OLD_FLOOR_MS)).toBe(0);
    expect(floorOverrunMs(177.6, OLD_FLOOR_MS)).toBe(0);
  });

  it('reports an overrun as a positive number and never a negative one', () => {
    expect(floorOverrunMs(0, 700)).toBe(0);
    expect(floorOverrunMs(699, 700)).toBe(0);
    expect(floorOverrunMs(700, 700)).toBe(0);
    expect(floorOverrunMs(701, 700)).toBe(1);
    expect(floorOverrunMs(5000, 700)).toBe(4300);
  });

  it('is never owed and overrun at the same time', () => {
    // The two functions partition every elapsed time between them, which is what
    // makes "overran" a signal rather than an interpretation of a zero.
    for (const elapsed of [0, 1, 399, 400, 401, 700, 726, 5000]) {
      const owed = remainingFloorMs(elapsed);
      const over = floorOverrunMs(elapsed);
      expect(owed === 0 || over === 0).toBe(true);
      expect(elapsed + owed - over).toBe(RESET_RESPONSE_FLOOR_MS);
    }
  });

  it('sits above the measured p99 of the branch it has to cover', () => {
    // The floor is only worth having while a real branch finishes inside it. Both
    // branches are now one neon-http statement, measured at a 271.4ms p99, so this
    // is the assertion that keeps the constant tied to a number somebody actually
    // took rather than to a number somebody liked.
    expect(RESET_RESPONSE_FLOOR_MS).toBeGreaterThan(MEASURED_ROUND_TRIP_P99_MS);
    expect(remainingFloorMs(MEASURED_ROUND_TRIP_P99_MS)).toBeGreaterThan(0);
    expect(floorOverrunMs(MEASURED_ROUND_TRIP_P99_MS)).toBe(0);
    // With enough headroom to be worth calling a floor: at least 1.25x the p99.
    expect(RESET_RESPONSE_FLOOR_MS).toBeGreaterThanOrEqual(MEASURED_ROUND_TRIP_P99_MS * 1.25);
  });
});
