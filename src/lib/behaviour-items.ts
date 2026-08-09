import { LIST_ROW_TITLE_MAX } from './list-row-title';
import type { MenuItemKind } from './types';

/** The two menu kinds that carry BEHAVIOUR rather than content. Their reply text
 *  lives in church.prayerPromptText / church.handoffText — see menu-router.ts
 *  cases 'prayer' and 'human', which read neither bodyText nor imageUrl. That is
 *  why the panel does not show those two fields for these items, and why this
 *  module carries a sentence explaining what the item does instead. */
export type BehaviourKind = 'prayer' | 'human';

export const BEHAVIOUR_KINDS: readonly BehaviourKind[] = ['prayer', 'human'];

export interface BehaviourItemCopy {
  /** Label the one-tap button creates the item with. Must fit LIST_ROW_TITLE_MAX
   *  — a default the product chooses must never be one the product truncates. */
  defaultLabel: string;
  /** The one-tap button on the list page, shown only while the church has no
   *  item of this kind. */
  addButton: string;
  /** One line under the item's name in the list: what a tap actually does. This
   *  replaces the old cryptic "· oração" / "· atendente" tag. */
  listNote: string;
  /** The edit screen's explanation, standing where the two fields that did
   *  nothing used to be. */
  explanation: string;
  /** Which Configurações field really owns this item's words. The labels match
   *  the ones the Configurações form uses, so the sentence is a findable
   *  instruction rather than a vague pointer. */
  settingsField: string;
}

export const BEHAVIOUR_ITEM: Record<BehaviourKind, BehaviourItemCopy> = {
  prayer: {
    defaultLabel: '🙏 Pedido de oração',
    addButton: '+ Adicionar “🙏 Pedido de oração”',
    listNote: 'Quem tocar aqui é convidado a escrever o pedido, e o pedido chega em Pedidos de Oração.',
    explanation:
      'Esta opção não tem texto próprio. Quando alguém toca nela, a secretária virtual envia o convite ' +
      'para a pessoa escrever o pedido, e o pedido chega em Pedidos de Oração.',
    settingsField: 'Pedir o texto da oração',
  },
  human: {
    defaultLabel: '💬 Falar com atendente',
    addButton: '+ Adicionar “💬 Falar com atendente”',
    // The second half of this sentence is a fact the panel has never told anyone:
    // menu-router.ts returns zero replies while a contact is in 'human' mode, so
    // the bot really does go silent for that person until staff end the handoff.
    listNote:
      'Quem tocar aqui entra na fila da Caixa de Entrada, e a secretária virtual para de responder ' +
      'essa pessoa até vocês encerrarem o atendimento.',
    explanation:
      'Esta opção não tem texto próprio. Quando alguém toca nela, a secretária virtual avisa que a pessoa ' +
      'vai ser atendida, a conversa entra na fila da Caixa de Entrada, e a secretária virtual para de ' +
      'responder essa pessoa até vocês encerrarem o atendimento.',
    settingsField: 'Ao encaminhar para um atendente',
  },
};

export function isBehaviourKind(kind: MenuItemKind): kind is BehaviourKind {
  return kind === 'prayer' || kind === 'human';
}

/** Which behaviour kinds this church does not have yet — the list page offers a
 *  button for each. A church with two prayer items counts as having prayer; this
 *  never proposes a duplicate, and never tries to clean one up either. */
export function missingBehaviourKinds(kinds: MenuItemKind[]): BehaviourKind[] {
  return BEHAVIOUR_KINDS.filter((behaviour) => !kinds.includes(behaviour));
}

/** Exported for the test that keeps the two default labels inside the WhatsApp
 *  row-title cap. Importing LIST_ROW_TITLE_MAX here rather than in the test keeps
 *  the module honest about the constraint it is subject to. */
export const BEHAVIOUR_LABEL_MAX = LIST_ROW_TITLE_MAX;
