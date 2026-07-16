import { describe, it, expect } from 'vitest';
import { canActivateAnotherItem, positionsFromOrder } from '@/lib/menu-admin-rules';

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
