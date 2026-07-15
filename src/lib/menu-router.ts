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

  const active = activeItemsSorted(items);

  let selected: MenuItemView | undefined;

  if (message.kind === 'list_reply') {
    selected = active.find((i) => i.id === message.itemId);
  } else if (message.kind === 'text') {
    const text = normalize(message.text);

    if (ESCAPE_WORDS.includes(text)) {
      return { replies: [menuReply(config.menuHeaderText)], nextMode: 'bot' };
    }

    const index = Number(text);
    if (Number.isInteger(index) && index >= 1 && index <= active.length) {
      selected = active[index - 1];
    }
  }

  if (!selected) {
    const bodyText = isFirstContact ? config.greetingText : config.fallbackText;
    return { replies: [menuReply(bodyText)], nextMode: 'bot' };
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
