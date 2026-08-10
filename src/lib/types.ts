export type ContactMode = 'bot' | 'awaiting_prayer' | 'human';

export type MenuItemKind = 'content' | 'prayer' | 'human';

export interface MenuItemView {
  id: string;
  position: number;
  label: string;
  bodyText: string;
  imageUrl: string | null;
  isActive: boolean;
  kind: MenuItemKind;
}

/** Every user-facing string the bot can emit. All of it is editable data. */
export interface ChurchConfig {
  id: string;
  name: string;
  greetingText: string;
  menuHeaderText: string;
  menuButtonLabel: string;
  fallbackText: string;
  unsupportedMediaText: string;
  errorText: string;
  prayerPromptText: string;
  prayerThanksText: string;
  handoffText: string;
  handoffClosedText: string;
  courtesyText: string;
}

export type InboundMessage =
  | { kind: 'text'; text: string }
  // `title` is optional so existing construction sites (router tests, etc.) that
  // only care about itemId keep compiling. parseInbound always populates it (with
  // a sensible fallback) so nothing is lost when persisting message history — see
  // Finding 4. The router must never read it; it selects by itemId only.
  | { kind: 'list_reply'; itemId: string; title?: string }
  | { kind: 'unsupported' };

export type Reply =
  | { type: 'menu'; bodyText: string }
  | { type: 'text'; body: string }
  | { type: 'image'; body: string; imageUrl: string };

export interface RouterInput {
  config: ChurchConfig;
  items: MenuItemView[];
  mode: ContactMode;
  message: InboundMessage;
  isFirstContact: boolean;
}

export interface RouterResult {
  replies: Reply[];
  nextMode: ContactMode;
  prayerRequestText?: string;
  /** True only when `replies` carries the church's greetingText — i.e. this is the
   *  first thing the bot has ever said to this person. The webhook persists
   *  contact.greetedAt from this flag AFTER the reply successfully sends. A string
   *  comparison would be wrong here: a church may legitimately configure
   *  greetingText === fallbackText in the panel. */
  greeted?: true;
}
