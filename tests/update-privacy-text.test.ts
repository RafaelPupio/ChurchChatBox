import { beforeEach, describe, expect, it, vi } from 'vitest';

/** vi.mock factories are hoisted above every import AND above any top-level
 *  `const`, so a factory that closes over a plain `const x = vi.fn()` throws
 *  "Cannot access 'x' before initialization". vi.hoisted() is itself hoisted
 *  alongside the mocks, so its return value exists by the time the factories
 *  below execute. Same pattern as tests/member-data-actions.test.ts. */
const h = vi.hoisted(() => ({
  requireOwnerSession: vi.fn(),
  listMenuItemsForAdmin: vi.fn(),
  updateMenuItem: vi.fn(),
}));

vi.mock('@/lib/auth/owner-session', () => ({ requireOwnerSession: h.requireOwnerSession }));
vi.mock('@/lib/repo/menu-admin', () => ({
  // countMenuItems / createMenuItem back seedPrivacyItem, which this file does
  // not exercise — stubs are enough so the module still resolves its imports.
  countMenuItems: vi.fn(),
  createMenuItem: vi.fn(),
  listMenuItemsForAdmin: h.listMenuItemsForAdmin,
  updateMenuItem: h.updateMenuItem,
}));
vi.mock('@/lib/repo/platform', () => ({ setChurchCredentials: vi.fn(), setChurchStatus: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updatePrivacyText } from '@/app/owner/(protected)/[churchId]/actions';
import { PRIVACY_ITEM, PRIVACY_ITEM_PREVIOUS_BODIES } from '@/lib/church-defaults';

const { requireOwnerSession, listMenuItemsForAdmin, updateMenuItem } = h;

const CHURCH_ID = 'church-1';

function itemWithBody(bodyText: string) {
  return {
    id: 'item-1',
    churchId: CHURCH_ID,
    position: 1,
    label: PRIVACY_ITEM.label,
    bodyText,
    imageUrl: null,
    isActive: true,
    kind: 'content' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnerSession.mockResolvedValue({ ownerUserId: 'o1', name: 'Rafael' });
  updateMenuItem.mockResolvedValue(undefined);
});

describe('updatePrivacyText — the rollout button', () => {
  it('refuses a church whose body matches neither the current text nor either previous body, and writes NOTHING', async () => {
    // The church edited its own words. The vendor may replace vendor-authored
    // text, never the controller's own — this is the whole point of the gate.
    listMenuItemsForAdmin.mockResolvedValue([itemWithBody('Texto totalmente reescrito pela secretaria.')]);

    const result = await updatePrivacyText(CHURCH_ID);

    expect(result).toEqual({
      error: 'Esta igreja editou o próprio texto de Privacidade. Fale com ela antes de alterar.',
    });
    expect(updateMenuItem).not.toHaveBeenCalled();
  });

  it('reports already-current and writes NOTHING when the body is already the new default', async () => {
    listMenuItemsForAdmin.mockResolvedValue([itemWithBody(PRIVACY_ITEM.bodyText)]);

    const result = await updatePrivacyText(CHURCH_ID);

    expect(result).toEqual({ ok: 'Esta igreja já está com o texto mais recente.' });
    expect(updateMenuItem).not.toHaveBeenCalled();
  });

  it.each(PRIVACY_ITEM_PREVIOUS_BODIES.map((body, i) => [i, body] as const))(
    'rewrites a church still carrying previous body #%i to the current default',
    async (_i, previousBody) => {
      listMenuItemsForAdmin.mockResolvedValue([itemWithBody(previousBody)]);

      const result = await updatePrivacyText(CHURCH_ID);

      expect(updateMenuItem).toHaveBeenCalledWith('item-1', CHURCH_ID, { bodyText: PRIVACY_ITEM.bodyText });
      expect(result).toEqual({ ok: 'Texto de Privacidade atualizado.' });
    },
  );

  it('reports missing-item and writes NOTHING when the church has no Privacidade row', async () => {
    listMenuItemsForAdmin.mockResolvedValue([]);

    const result = await updatePrivacyText(CHURCH_ID);

    expect(result).toEqual({
      error: 'Esta igreja não tem o item de Privacidade. Use "Recriar item de Privacidade".',
    });
    expect(updateMenuItem).not.toHaveBeenCalled();
  });

  it('reports a generic failure when the write itself throws', async () => {
    listMenuItemsForAdmin.mockResolvedValue([itemWithBody(PRIVACY_ITEM_PREVIOUS_BODIES[0])]);
    updateMenuItem.mockRejectedValue(new Error('neon down'));

    const result = await updatePrivacyText(CHURCH_ID);

    expect(result).toEqual({ error: 'Não foi possível atualizar o texto. Tente novamente.' });
  });
});
