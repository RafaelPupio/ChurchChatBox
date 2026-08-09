import Link from 'next/link';
import { requireReadableSession } from '@/lib/auth/writable';
import { listConversations } from '@/lib/repo/inbox';
import type { ContactMode } from '@/lib/types';
import { AutoRefresh } from '../AutoRefresh';

function modeTag(mode: ContactMode): { label: string; cls: string } {
  if (mode === 'human') return { label: 'Atendimento', cls: 'mode-human' };
  if (mode === 'awaiting_prayer') return { label: 'Oração', cls: 'mode-prayer' };
  return { label: 'Bot', cls: 'mode-bot' };
}

export default async function CaixaPage() {
  const { churchId } = await requireReadableSession();
  const conversations = await listConversations(churchId);

  return (
    <div>
      <h1>Caixa de Entrada</h1>
      <p className="hint">
        Quem pediu para falar com uma pessoa aparece no topo, marcado como <strong>Atendimento</strong>.
        Abra para responder pelo número da igreja. A lista se atualiza sozinha.
      </p>
      {/* Nothing pushes an inbound message into an open panel — the webhook writes
          the row on the server and no revalidation reaches this browser. Without
          this the list is a snapshot of whenever the page happened to load, and
          someone asking for a person waits until the secretary thinks to reload.
          The last sentence of the hint above is the promise this keeps. */}
      <AutoRefresh />
      {conversations.length === 0 ? (
        <p className="hint">Nenhuma conversa ainda.</p>
      ) : (
        conversations.map((c) => {
          const tag = modeTag(c.mode);
          return (
            <Link key={c.id} className="card conv" href={`/admin/caixa/${c.id}`}>
              {/* The name on its own line and the number under it, rather than
                  "Nome · +55…" on one: at 375px a long name plus a phone number
                  ran the mode tag off the row, and the tag is how she spots who
                  is waiting. */}
              <span className="grow">
                <strong className="conv-name">{c.name || c.phone}</strong>
                {c.name && <span className="hint conv-phone">{c.phone}</span>}
              </span>
              <span className={`mode-tag ${tag.cls}`}>{tag.label}</span>
            </Link>
          );
        })
      )}
    </div>
  );
}
