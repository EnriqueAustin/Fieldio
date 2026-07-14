// Global test environment setup. Runs before any test module is imported.
//
// The API's config loader (src/config/env.ts) deliberately returns an empty
// config object when NODE_ENV === 'test' *unless* FIELDIO_LOAD_ENV_CONFIG is
// set. We want the real, validated config in these integration tests (JWT
// signing, WEB_URL for portal links, etc.), so we opt in and supply the
// minimum required environment.
process.env.NODE_ENV = 'test';
process.env.FIELDIO_LOAD_ENV_CONFIG = 'true';
process.env.DATABASE_URL ||= 'postgresql://fieldio:fieldio@localhost:5432/fieldio_test';
process.env.JWT_SECRET ||= 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-that-is-at-least-32-characters-long';
process.env.API_URL ||= 'http://localhost:3001';
process.env.WEB_URL ||= 'http://localhost:3000';

import { vi } from 'vitest';

// Silence the pino logger during tests — negative-path cases legitimately log
// expected AppErrors, which otherwise flood the test output.
vi.mock('../src/utils/logger', () => {
    const noop = () => {};
    return { logger: { info: noop, error: noop, warn: noop, debug: noop, fatal: noop, trace: noop } };
});
