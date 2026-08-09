import { describe, it, expect } from 'vitest';
import { canActivateAnotherItem, canHideItem, positionsFromOrder } from '@/lib/menu-admin-rules';

describe('canActivateAnotherItem', () => {
  it('allows activation below the 10-row cap', () => {
    expect(canActivateAnotherItem(9)).toBe(true);
  });
  it('blocks activation at the cap', () => {
    expect(canActivateAnotherItem(10)).toBe(false);
  });
});

describe('positionsFromOrder', () => {
  it('assigns 1-indexed positions in order', () => {
    expect(positionsFromOrder(['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
      { id: 'b', position: 3 },
    ]);
  });
  it('handles an empty list', () => {
    expect(positionsFromOrder([])).toEqual([]);
  });
});

describe('canHideItem', () => {
  it('allows hiding while another item is still visible', () => {
    expect(canHideItem(2)).toBe(true);
  });
  it('refuses to hide the last visible item', () => {
    // Zero active rows makes buildListPayload throw MenuEmptyError and the bot
    // answers members with body text and nothing to tap.
    expect(canHideItem(1)).toBe(false);
  });
  it('refuses on an already-empty menu', () => {
    expect(canHideItem(0)).toBe(false);
  });
});
