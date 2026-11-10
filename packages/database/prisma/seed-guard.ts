/**
 * Guard for the destructive seed scripts (seed.ts wipes every table and
 * creates password123 users). Refuses to run against anything that isn't a
 * local/dev database unless ALLOW_DESTRUCTIVE_SEED=yes-wipe-<dbname> is set.
 */
import * as fs from 'fs';
import * as path from 'path';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

export type SeedGuardEnv = {
    NODE_ENV?: string;
    DATABASE_URL?: string;
    ALLOW_DESTRUCTIVE_SEED?: string;
};

export type SeedGuardResult = { ok: true; dbName: string; host: string } | { ok: false; reason: string };

export function checkSeedTarget(env: SeedGuardEnv): SeedGuardResult {
    const raw = env.DATABASE_URL;
    if (!raw) return { ok: false, reason: 'DATABASE_URL is not set.' };

    let host: string;
    let dbName: string;
    try {
        const url = new URL(raw);
        host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
    } catch {
        return { ok: false, reason: 'DATABASE_URL could not be parsed.' };
    }

    const override = env.ALLOW_DESTRUCTIVE_SEED;
    if (override !== undefined && override !== '') {
        if (dbName && override === `yes-wipe-${dbName}`) return { ok: true, dbName, host };
        return {
            ok: false,
            reason: `ALLOW_DESTRUCTIVE_SEED must be exactly "yes-wipe-${dbName}" to wipe this database.`,
        };
    }

    if (env.NODE_ENV === 'production') {
        return { ok: false, reason: 'NODE_ENV is "production".' };
    }
    if (!LOCAL_HOSTS.has(host)) {
        return { ok: false, reason: `database host "${host}" is not local (allowed: ${Array.from(LOCAL_HOSTS).join(', ')}).` };
    }
    return { ok: true, dbName, host };
}

// Prisma reads .env itself when the client starts, so DATABASE_URL may not be
// in process.env yet. Mirror its lookup so the guard sees the same URL.
function readDatabaseUrlFromEnvFiles(): string | undefined {
    const candidates = [
        path.resolve(process.cwd(), '.env'),
        path.join(__dirname, '.env'),
        path.join(__dirname, '..', '.env'),
    ];
    for (const file of candidates) {
        try {
            const text = fs.readFileSync(file, 'utf8');
            const match = text.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/m);
            if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
        } catch {
            // missing file — try the next one
        }
    }
    return undefined;
}

/** Exits the process with a clear message if seeding this database is unsafe. */
export function assertSafeToSeed(scriptName: string, env: NodeJS.ProcessEnv = process.env): void {
    const result = checkSeedTarget({
        NODE_ENV: env.NODE_ENV,
        DATABASE_URL: env.DATABASE_URL || readDatabaseUrlFromEnvFiles(),
        ALLOW_DESTRUCTIVE_SEED: env.ALLOW_DESTRUCTIVE_SEED,
    });
    if ('reason' in result) {
        console.error(
            `\n✋ Refusing to run ${scriptName}: ${result.reason}\n` +
            '   This script DELETES ALL DATA and creates demo users with known passwords.\n' +
            '   For production use `npm run db:deploy` (prisma migrate deploy).\n' +
            '   To wipe a non-local database on purpose, set ALLOW_DESTRUCTIVE_SEED=yes-wipe-<database name>.\n',
        );
        process.exit(1);
    }
    console.log(`🛡️  Seed target OK: ${result.host}/${result.dbName}`);
}
