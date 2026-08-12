/** The member's Art. 18 V copy, as THREE pure builders rather than one.
 *
 *  The route streams: header, then pages of entries, then footer. It never holds
 *  the whole history, so there is no point at which a `buildMemberExport(church,
 *  contact, messages[], prayers[])` could be called — that signature would force
 *  the route to materialise every row first and would fail on exactly the member
 *  with the most data.
 *
 *  Keys are pt-BR because a member reads them. (Code identifiers stay English;
 *  the binding pt-BR rule is about user-facing text, and a JSON key handed to a
 *  Brazilian member is user-facing text.) */

/** Art. 18 VII — who else sees this. The same answer for every member of every
 *  church, which is why it is a constant and not a query. */
export const SHARING_DISCLOSURE: string[] = [
  'WhatsApp (Meta Platforms) — é por onde a conversa acontece.',
  'Serviços de hospedagem e banco de dados que executam o sistema da igreja.',
  'Não vendemos, alugamos nem cedemos estes dados a terceiros.',
];

/** True as of the commit that shipped the nightly purge (Task 8). Before that this
 *  constant carried the present-tense wording, because the member's export file
 *  reads it and a promise here is a promise in the artifact the member receives. */
export const RETENTION_NOTE =
  'As conversas e os pedidos de oração são apagados automaticamente após 12 meses.';

export const EXPORT_NOTES: string[] = [
  'Áudios, fotos e outros arquivos enviados não são guardados por nós — apenas o registro de que uma mídia chegou.',
  'Esta cópia contém apenas o que a igreja guarda. A conversa também existe no seu aparelho e nos servidores do WhatsApp, fora do controle da igreja.',
];

export interface ExportHeaderInput {
  churchName: string;
  contact: { name: string | null; phone: string; createdAt: Date; lastInboundAt: Date | null };
  counts: { messages: number; prayers: number };
  now: Date;
}

export interface ExportHeader {
  gerado_em: string;
  igreja: string;
  titular: {
    nome: string | null;
    whatsapp: string;
    primeiro_registro: string;
    ultima_mensagem_recebida: string | null;
    total_de_mensagens: number;
    total_de_pedidos_de_oracao: number;
  };
}

export function exportHeader(input: ExportHeaderInput): ExportHeader {
  const { churchName, contact, counts, now } = input;
  return {
    gerado_em: now.toISOString(),
    igreja: churchName,
    titular: {
      // null stays null. An empty string would assert we hold a blank name, which
      // is a different claim from "we never saw one".
      nome: contact.name,
      whatsapp: contact.phone,
      primeiro_registro: contact.createdAt.toISOString(),
      ultima_mensagem_recebida: contact.lastInboundAt ? contact.lastInboundAt.toISOString() : null,
      total_de_mensagens: counts.messages,
      total_de_pedidos_de_oracao: counts.prayers,
    },
  };
}

export interface ExportMessageRow {
  id: string;
  waMessageId: string | null;
  direction: 'inbound' | 'outbound';
  body: string | null;
  createdAt: Date;
}

export interface ExportMessageEntry {
  quando: string;
  de: 'membro' | 'igreja';
  texto: string | null;
}

export function exportMessageEntry(row: ExportMessageRow): ExportMessageEntry {
  // `id` and `waMessageId` are accepted and DROPPED, deliberately: the caller
  // needs them for the keyset cursor, and this builder is the boundary at which
  // they stop travelling. A wamid may encode the member's own phone number.
  return {
    quando: row.createdAt.toISOString(),
    de: row.direction === 'inbound' ? 'membro' : 'igreja',
    texto: row.body,
  };
}

export interface ExportPrayerRow {
  id: string;
  status: 'novo' | 'orado';
  text: string;
  createdAt: Date;
}

export interface ExportPrayerEntry {
  quando: string;
  situacao: 'novo' | 'orado';
  texto: string;
}

export function exportPrayerEntry(row: ExportPrayerRow): ExportPrayerEntry {
  return { quando: row.createdAt.toISOString(), situacao: row.status, texto: row.text };
}

export interface ExportFooter {
  compartilhamento: string[];
  retencao: string;
  observacoes: string[];
  aviso?: string;
  continuacao?: string;
}

/** Brazilian date for a human. The cursor beside it is opaque and machine-read;
 *  human-readable and machine-resumable are different jobs and one value cannot
 *  do both — a date cannot name a position inside a day. */
export function truncationNotice(at: Date): string {
  const d = at.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  return `Este arquivo vai até ${d}. Havia mais dados do que cabe em um único arquivo — a secretaria da igreja pode gerar o restante em um segundo arquivo.`;
}

export function exportFooter(input: {
  truncatedAt: Date | null;
  continuation: string | null;
}): ExportFooter {
  const footer: ExportFooter = {
    compartilhamento: SHARING_DISCLOSURE,
    retencao: RETENTION_NOTE,
    observacoes: EXPORT_NOTES,
  };
  // Both keys appear together or not at all. A file carrying `aviso` without
  // `continuacao` would tell the secretary data is missing and give them no way
  // to fetch it; truncation is never silent AND never a dead end.
  if (input.truncatedAt && input.continuation) {
    footer.aviso = truncationNotice(input.truncatedAt);
    footer.continuacao = input.continuation;
  }
  return footer;
}
