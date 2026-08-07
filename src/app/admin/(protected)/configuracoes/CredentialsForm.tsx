/** Read-only. The church does not manage its WhatsApp connection — Rafael does,
 *  from the owner console. Showing status (without secrets) keeps support
 *  conversations simple: "está conectado?" is answerable by the church. */
export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Conexão WhatsApp</h2>
      {connected ? (
        <p style={{ color: 'var(--ok)', margin: 0 }}>✓ Conectado</p>
      ) : (
        <p className="warn" style={{ margin: 0 }}>Aguardando conexão</p>
      )}
      <p className="hint" style={{ marginBottom: 0 }}>
        A conexão com o WhatsApp é configurada pela equipe da Secretária Virtual.
        Se algo não estiver funcionando, entre em contato com o suporte.
      </p>
    </div>
  );
}
