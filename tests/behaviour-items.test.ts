import { describe, it, expect } from 'vitest';
import { BEHAVIOUR_ITEM, BEHAVIOUR_KINDS, isBehaviourKind, missingBehaviourKinds } from '@/lib/behaviour-items';
import { LIST_ROW_TITLE_MAX, truncateRowTitle } from '@/lib/list-row-title';

describe('behaviour item defaults', () => {
  it.each([...BEHAVIOUR_KINDS])('%s default label survives the WhatsApp row-title cap', (kind) => {
    const label = BEHAVIOUR_ITEM[kind].defaultLabel;
    // A label the PRODUCT chooses must never be one the product then truncates.
    expect(label.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX);
    expect(truncateRowTitle(label)).toBe(label);
  });

  it.each([...BEHAVIOUR_KINDS])('%s says where the church sees the result', (kind) => {
    // The whole reason these sentences exist: the old UI showed "· oração" and a
    // field that discarded her writing. Every one of these must name a screen.
    expect(BEHAVIOUR_ITEM[kind].listNote.length).toBeGreaterThan(20);
    expect(BEHAVIOUR_ITEM[kind].explanation).toContain('não tem texto próprio');
    expect(BEHAVIOUR_ITEM[kind].settingsField.length).toBeGreaterThan(0);
  });

  it('never says "dízimo"', () => {
    const all = JSON.stringify(BEHAVIOUR_ITEM);
    expect(all.toLowerCase()).not.toContain('dízimo');
    expect(all.toLowerCase()).not.toContain('dizimo');
  });
});

describe('isBehaviourKind', () => {
  it('separates content from behaviour', () => {
    expect(isBehaviourKind('content')).toBe(false);
    expect(isBehaviourKind('prayer')).toBe(true);
    expect(isBehaviourKind('human')).toBe(true);
  });
});

describe('missingBehaviourKinds', () => {
  it('offers both to a freshly provisioned church (Privacidade only)', () => {
    expect(missingBehaviourKinds(['content'])).toEqual(['prayer', 'human']);
  });
  it('offers nothing once the church has both', () => {
    expect(missingBehaviourKinds(['content', 'prayer', 'human'])).toEqual([]);
  });
  it('offers only the missing one', () => {
    expect(missingBehaviourKinds(['content', 'prayer'])).toEqual(['human']);
  });
  it('treats a duplicate as present, never proposing a third', () => {
    expect(missingBehaviourKinds(['prayer', 'prayer', 'human'])).toEqual([]);
  });
  it('offers both to an empty menu', () => {
    expect(missingBehaviourKinds([])).toEqual(['prayer', 'human']);
  });
});
