import { activeItemsSorted } from './menu';
import type { MenuItemView, Reply, RouterInput, RouterResult } from './types';

const ESCAPE_WORDS = ['menu', 'voltar', '0'];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function menuReply(bodyText: string): Reply {
  return { type: 'menu', bodyText };
}

function contentReplies(item: MenuItemView, menuHeaderText: string): Reply[] {
  const body: Reply = item.imageUrl
    ? { type: 'image', body: item.bodyText, imageUrl: item.imageUrl }
    : { type: 'text', body: item.bodyText };
  return [body, menuReply(menuHeaderText)];
}

/** Pure. No I/O. Every conversational rule lives here. */
export function route(input: RouterInput): RouterResult {
  const { config, items, mode, message, isFirstContact } = input;

  // Human mode: the bot is silent. Staff own this conversation until they end it.
  if (mode === 'human') {
    return { replies: [], nextMode: 'human' };
  }

  if (message.kind === 'unsupported') {
    return {
      replies: [
        { type: 'text', body: config.unsupportedMediaText },
        menuReply(config.menuHeaderText),
      ],
      nextMode: mode === 'awaiting_prayer' ? 'awaiting_prayer' : 'bot',
    };
  }

  const active = activeItemsSorted(items);

  let selected: MenuItemView | undefined;

  if (message.kind === 'list_reply') {
    selected = active.find((i) => i.id === message.itemId);
  } else if (message.kind === 'text') {
    const text = normalize(message.text);

    if (ESCAPE_WORDS.includes(text)) {
      return { replies: [menuReply(config.menuHeaderText)], nextMode: 'bot' };
    }

    // Checked before numeric selection: in this state the member was asked to
    // write, so a prayer reading "1" is a prayer, not a menu choice.
    if (mode === 'awaiting_prayer') {
      const trimmed = message.text.trim();

      // Never capture an empty prayer. The webhook only saves when
      // prayerRequestText is truthy, so '' would thank the member for a prayer
      // that was silently discarded. Re-prompt instead.
      if (!trimmed) {
        return {
          replies: [{ type: 'text', body: config.prayerPromptText }],
          nextMode: 'awaiting_prayer',
        };
      }
      return {
        replies: [{ type: 'text', body: config.prayerThanksText }],
        nextMode: 'bot',
        prayerRequestText: trimmed,
      };
    }

    // Canonical digits only. Bare Number() coerces '+1', '0x1' and '1e0' to 1,
    // which would silently select the first menu item.
    if (/^\d+$/.test(text)) {
      const index = Number(text);
      if (index >= 1 && index <= active.length) {
        selected = active[index - 1];
      }
    }
  }

  if (!selected) {
    const bodyText = isFirstContact ? config.greetingText : config.fallbackText;
    const result: RouterResult = { replies: [menuReply(bodyText)], nextMode: 'bot' };
    // Flagged, not inferred: the webhook records "we have greeted this person" only
    // after the send succeeds, and it cannot tell greetingText from fallbackText by
    // comparing strings when a church has configured them identically.
    if (isFirstContact) result.greeted = true;
    return result;
  }

  switch (selected.kind) {
    case 'content':
      return { replies: contentReplies(selected, config.menuHeaderText), nextMode: 'bot' };
    case 'prayer':
      return { replies: [{ type: 'text', body: config.prayerPromptText }], nextMode: 'awaiting_prayer' };
    case 'human':
      return { replies: [{ type: 'text', body: config.handoffText }], nextMode: 'human' };
  }
}
