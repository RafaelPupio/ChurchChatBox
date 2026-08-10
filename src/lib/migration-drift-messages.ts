import type { MigrationDrift } from './migration-drift';

/** The pt-BR the /owner console says about migration drift.
 *
 *  Separated from the component that renders it so every sentence is reachable
 *  by a test without a DOM, a React renderer or a database — this repo has none
 *  of the three. The component below it is a dumb renderer over this shape.
 *
 *  Operator-facing English lives in scripts/db-check.ts. This file is a panel,
 *  so it is Portuguese. */

export type DriftTone = 'alarm' | 'warning' | 'ok';

export interface DriftMessage {
  readonly tone: DriftTone;
  readonly title: string;
  /** What is wrong and what it costs, in that order. */
  readonly body: string;
  /** Migration tags to list, in the order they must be applied. */
  readonly items: readonly string[];
  /** The command that fixes it, or null when there is nothing to run. */
  readonly fix: string | null;
  /** Present only when the command above will NOT be enough. */
  readonly caveat: string | null;
}

function migracoes(n: number): string {
  return n === 1 ? '1 migração' : `${n} migrações`;
}

function dessas(n: number): string {
  return n === 1 ? 'dessa migração' : 'dessas migrações';
}

/** THE SENTENCE THE WHOLE FEATURE IS FOR. Rafael already knows what a migration
 *  is; what he could not see, twice, is that a missing one reaches members as
 *  silence rather than as an error. The webhook's always-return-200 rule is
 *  correct — a non-200 makes Meta retry and a retry means a real person gets the
 *  same reply twice — so it is not going to change, and this is the compensating
 *  disclosure. */
const SILENCE =
  'No webhook do WhatsApp a exceção é engolida e a Meta recebe 200 assim mesmo: ' +
  'os membros ficam sem resposta, e nada avisa que isso está acontecendo.';

export function driftMessage(drift: MigrationDrift): DriftMessage {
  const tags = drift.missing.map((m) => m.tag);
  const caveat = drift.skippedByMigrate.length
    ? `Atenção: db:migrate NÃO vai aplicar ${drift.skippedByMigrate.map((m) => m.tag).join(', ')}. ` +
      'O drizzle só aplica migrações com data posterior à última registrada no banco, e o banco já ' +
      'registrou uma mais recente que essa(s). Aplique o SQL à mão ou gere a migração de novo, com data nova.'
    : null;

  /** The command, but only while it is still true of something. When every
   *  missing migration is one db:migrate would skip, showing it would send
   *  Rafael to run a command that prints nothing, changes nothing and exits 0 —
   *  and reading that as "fixed" is exactly the kind of quiet wrongness this
   *  banner exists to end. */
  const fix =
    drift.missing.length > drift.skippedByMigrate.length ? 'npm run db:migrate' : null;

  if (drift.status === 'in_sync') {
    return {
      tone: 'ok',
      // Said out loud even when everything is fine, on purpose: a check that
      // renders nothing when healthy is indistinguishable from a check that
      // stopped running, and "it looked fine" is how both incidents shipped.
      title: 'Banco de dados em dia',
      body: `As ${migracoes(drift.expectedCount)} que este código espera estão aplicadas.`,
      items: [],
      fix: null,
      caveat: null,
    };
  }

  if (drift.neverMigrated) {
    return {
      tone: 'alarm',
      title: 'BANCO DE DADOS NUNCA MIGRADO',
      body:
        `Não há nenhuma migração aplicada — nenhuma das ${migracoes(drift.expectedCount)} que este código espera. ` +
        `O banco é novo, ou o schema "drizzle" foi apagado. Nada que dependa do banco funciona assim. ${SILENCE}`,
      items: tags,
      fix,
      caveat,
    };
  }

  if (drift.status === 'behind') {
    return {
      tone: 'alarm',
      title: 'BANCO DE DADOS DESATUALIZADO',
      body:
        `O código espera ${migracoes(drift.missing.length)} que o banco não tem. ` +
        `Toda consulta que usar as colunas ou tabelas ${dessas(drift.missing.length)} falha. ${SILENCE}`,
      items: tags,
      fix,
      caveat,
    };
  }

  if (drift.status === 'diverged') {
    return {
      tone: 'alarm',
      title: 'BANCO DE DADOS E CÓDIGO DIVERGIRAM',
      body:
        `Faltam ${migracoes(drift.missing.length)} no banco, e o banco tem ` +
        `${migracoes(drift.extra.length)} que este código não conhece. ` +
        `Isso não é só um deploy atrasado: as duas pontas seguiram caminhos diferentes. ` +
        `Descubra qual código gerou o que está no banco antes de aplicar qualquer coisa. ${SILENCE}`,
      items: tags,
      fix,
      caveat,
    };
  }

  return {
    tone: 'warning',
    title: 'Banco de dados à frente do código',
    body:
      `O banco tem ${migracoes(drift.extra.length)} que este código não conhece. ` +
      'Quase sempre isso é um deploy revertido: o código voltou, o schema ficou. ' +
      'O bot continua respondendo, porque o schema tem mais do que o código pede — mas a versão ' +
      'no ar não é a que gerou esse banco, e a próxima migração que você gerar pode ser ignorada ' +
      'em silêncio por ter data anterior à última registrada. Confira se o deploy é o que você espera.',
    items: [],
    fix: null,
    caveat: null,
  };
}

/** Shown when the check itself could not run — the query to
 *  drizzle.__drizzle_migrations threw for a reason other than the table not
 *  existing yet.
 *
 *  Deliberately NOT silent and deliberately NOT the red alarm. Not silent,
 *  because "the detector is broken" and "there is no drift" must never look the
 *  same on this screen. Not red, because a Neon hiccup is not an outage and a
 *  detector that cries wolf gets ignored, which costs more than it saves. */
export const DRIFT_CHECK_UNAVAILABLE: DriftMessage = {
  tone: 'warning',
  title: 'Não foi possível verificar o banco de dados',
  body:
    'A consulta ao registro de migrações falhou. Isto não quer dizer que há problema no schema — ' +
    'quer dizer que ninguém sabe. Rode a verificação pelo terminal para ver o erro completo.',
  items: [],
  fix: 'npm run db:check',
  caveat: null,
};
