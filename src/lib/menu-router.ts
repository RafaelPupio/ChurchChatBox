import { activeItemsSorted } from './menu';
import type { MenuItemView, Reply, RouterInput, RouterResult } from './types';

const ESCAPE_WORDS = ['menu', 'voltar', '0'];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/** The words that CLOSE a conversation rather than ask something.
 *
 *  The list is logic and lives here; the sentence it triggers is content and
 *  lives in church.courtesy_text, editable in Configurações like every other
 *  thing the bot says.
 *
 *  Written without accents because `courtesyKey` folds them: on a phone keyboard
 *  "amem" and "amém" are equally common and neither is a typo worth punishing.
 *
 *  Deliberately NOT here: ok, blz, beleza, entendi, certo, sim, legal, show.
 *  Those are acknowledgements, and answering "ok" with a blessing is odd. Nor
 *  greetings — "boa noite" opens a Brazilian message far more often than it ends
 *  one, and swallowing it would cost a member her menu. */
const COURTESY_WORDS = new Set([
  'obrigado', 'obrigada', 'obrigadao', 'obrigadinho', 'obrigadinha',
  'brigado', 'brigada', 'obg', 'obgd',
  'valeu', 'vlw', 'gratidao',
  'amem',
]);

/** Courtesy that needs more than one word. Kept as whole phrases rather than
 *  adding 'muito' to COURTESY_WORDS, which would also match "muito bom". */
const COURTESY_PHRASES = new Set(['muito obrigado', 'muito obrigada']);

/** "Deus abençoe" and how people actually write it. Anchored at both ends for
 *  the same reason the whole matcher is exact — see `isCourtesy`. */
const BLESSING = /^(que )?deus (te |lhe |vos )?abencoe( voce| voces| a todos| todos)?$/;

/** Folds a message down to comparable words: no accents, no punctuation, no
 *  emoji, no double spaces. The member who prompted this branch wrote
 *  "obrigada!" — with the exclamation mark — and `normalize` only trims and
 *  lowercases, so without this her thank-you would still miss the list. */
function courtesyKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // combining accents, now detached by NFD
    .toLowerCase()
    // Punctuation and emoji go; DIGITS STAY. In this bot a digit is a menu
    // choice, so "obrigada 1" must not be flattened to a bare "obrigada" and
    // answered with a blessing — it keeps a word that is not courtesy and
    // therefore falls through, exactly as it did before this branch existed.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** EXACT match on the whole message, never "contains".
 *
 *  "obrigada, mas qual o horário do culto?" is a QUESTION with a polite opening,
 *  and a contains-match would answer it with a blessing and drop it — the member
 *  would be left thanked and unanswered, which is worse than the cold fallback
 *  this branch exists to remove. So the whole message must be courtesy and
 *  nothing else; anything with a real word in it falls through to the menu.
 *
 *  Multiple courtesy words together ("amém, obrigada!") still count: every word
 *  must be one, so no room is left for a question to hide in. */
function isCourtesy(text: string): boolean {
  const key = courtesyKey(text);
  if (!key) return false; // a bare 🙏 has no words to recognise
  if (COURTESY_PHRASES.has(key) || BLESSING.test(key)) return true;
  return key.split(' ').every((word) => COURTESY_WORDS.has(word));
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

    // "obrigada", "amém", "Deus abençoe" — she is closing the conversation, and
    // the honest answer is a blessing, not "Desculpe, não entendi".
    //
    // The position in this function is the whole design:
    //  - BELOW the human-mode return at the top, because a member mid-handoff is
    //    talking to a PERSON and the bot must not interrupt with a blessing.
    //  - BELOW `awaiting_prayer`, because a prayer that opens "Obrigada por
    //    orarem…" is her REQUEST, and capturing it is the point of that state.
    //  - BELOW the escape words, so "menu" still reaches the menu.
    //  - ABOVE the numeric selection only for readability; a courtesy key is
    //    letters-only and can never collide with a menu number.
    //
    // A first contact is excluded deliberately: someone whose first ever message
    // is "amém" has never seen the menu, and a blessing with nothing after it
    // would be a dead end. She gets the greeting, which is warm already.
    if (!isFirstContact && isCourtesy(message.text)) {
      // One plain reply, and no menu behind it. She said thank you; re-offering
      // the menu would be the bot insisting the conversation continue. Anything
      // it does NOT recognise still ends at the menu, so nothing is lost.
      return { replies: [{ type: 'text', body: config.courtesyText }], nextMode: 'bot' };
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
