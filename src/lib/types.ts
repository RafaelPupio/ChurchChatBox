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
}

export type InboundMessage =
  | { kind: 'text'; text: string }
  | { kind: 'list_reply'; itemId: string }
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
}
