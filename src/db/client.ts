import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let instance: Db | null = null;

/** Constructed on first use, not at import. Importing a module that transitively
 *  reaches this file (a session guard, a repo) must not require a database URL —
 *  only actually running a query does. Mirrors the lazy SESSION_SECRET read in
 *  src/lib/auth/session.ts. */
function getDb(): Db {
  if (instance) return instance;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }
  instance = drizzle(neon(connectionString), { schema });
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    // Bind methods to the real instance so drizzle's builder chaining keeps working.
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
