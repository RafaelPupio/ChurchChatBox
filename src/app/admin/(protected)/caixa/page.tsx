import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { listConversations } from '@/lib/repo/inbox';
import type { ContactMode } from '@/lib/types';

function modeTag(mode: ContactMode): { label: string; cls: string } {
  if (mode === 'human') return { label: 'Atendimento', cls: 'mode-human' };
  if (mode === 'awaiting_prayer') return { label: 'Oração', cls: 'mode-prayer' };
  return { label: 'Bot', cls: 'mode-bot' };
}

export default async function CaixaPage() {
  const { churchId } = await requireSession();
  const conversations = await listConversations(churchId);

  return (
    <div>
      <h1>Caixa de Entrada</h1>
      <p className="hint">Conversas de quem pediu atendente aparecem aqui. Responda pelo número da igreja.</p>
      {conversations.length === 0 ? (
        <p className="hint">Nenhuma conversa ainda.</p>
      ) : (
        conversations.map((c) => {
          const tag = modeTag(c.mode);
          return (
            <Link key={c.id} className="card conv" href={`/admin/caixa/${c.id}`}>
              <span className="grow">
                <strong>{c.name || c.phone}</strong>
                {c.name && <span className="hint"> · {c.phone}</span>}
              </span>
              <span className={`mode-tag ${tag.cls}`}>{tag.label}</span>
            </Link>
          );
        })
      )}
    </div>
  );
}
