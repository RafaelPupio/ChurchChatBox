import { describe, expect, it, vi } from 'vitest';

/** The seam's one security-relevant promise: sendPasswordResetEmail NEVER throws.
 *
 *  Its caller must answer identically whether or not the address belongs to an
 *  account. A transport failure that escaped would only ever be observable on the
 *  branch where the account exists — the other branch never calls it — so the
 *  error itself would become the account-existence oracle the whole flow is built
 *  to prevent. This suite substitutes a transport that always fails and checks the
 *  seam absorbs it.
 *
 *  Mocked at the module level, which is why this lives in its own file: every
 *  other test needs the real console transport. */
const failure = new Error('provider is down');

vi.mock('@/lib/email/console-sender', () => ({
  consoleEmailSender: {
    name: 'always-fails (test)',
    send: async () => {
      throw failure;
    },
  },
}));

const { sendPasswordResetEmail } = await import('@/lib/email');

describe('sendPasswordResetEmail', () => {
  it('resolves even when the transport throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      sendPasswordResetEmail('maria@igreja.br', 'https://painel.igreja.br/admin/redefinir-senha?token=x'),
    ).resolves.toBeUndefined();
    error.mockRestore();
  });

  it('logs the failure rather than swallowing it silently', async () => {
    // Absorbed for the visitor, visible to the operator. A provider outage that
    // left no trace anywhere would be indistinguishable from working.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendPasswordResetEmail('maria@igreja.br', 'https://x');

    expect(error).toHaveBeenCalled();
    const logged = error.mock.calls[0];
    expect(String(logged[0])).toContain('always-fails (test)');
    expect(logged[1]).toBe(failure);
    error.mockRestore();
  });

  it('does not put the link in the failure log', async () => {
    // The link is a live credential. A logged one outlives the token's hour in
    // whatever aggregator collects the logs.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const link = 'https://painel.igreja.br/admin/redefinir-senha?token=SEGREDO';

    await sendPasswordResetEmail('maria@igreja.br', link);

    const logged = error.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('SEGREDO');
    error.mockRestore();
  });
});
