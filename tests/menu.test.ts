import { describe, it, expect } from 'vitest';
import { activeItemsSorted } from '@/lib/menu';
import type { MenuItemView } from '@/lib/types';

function item(overrides: Partial<MenuItemView> & { id: string; position: number }): MenuItemView {
  return {
    label: 'Item',
    bodyText: 'corpo',
    imageUrl: null,
    isActive: true,
    kind: 'content',
    ...overrides,
  };
}

describe('activeItemsSorted', () => {
  it('sorts by position', () => {
    const result = activeItemsSorted([
      item({ id: 'b', position: 2 }),
      item({ id: 'a', position: 1 }),
    ]);
    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('drops inactive items', () => {
    const result = activeItemsSorted([
      item({ id: 'a', position: 1 }),
      item({ id: 'hidden', position: 2, isActive: false }),
    ]);
    expect(result.map((i) => i.id)).toEqual(['a']);
  });

  it('returns an empty array when nothing is active', () => {
    expect(activeItemsSorted([item({ id: 'x', position: 1, isActive: false })])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [item({ id: 'b', position: 2 }), item({ id: 'a', position: 1 })];
    activeItemsSorted(input);
    expect(input.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
