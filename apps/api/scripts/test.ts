import assert from 'node:assert/strict';
import { parseEnv } from '../src/config/env.ts';

const validEnv = {
    DATABASE_URL: 'postgresql://fieldio:fieldio@localhost:5432/fieldio',
    JWT_SECRET: 'secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    API_URL: 'http://localhost:3001',
    WEB_URL: 'http://localhost:3000',
};

const run = (name: string, fn: () => void) => {
    try {
        fn();
        console.log(`PASS ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
};

run('parseEnv applies defaults for optional configuration', () => {
    const config = parseEnv(validEnv);

    assert.equal(config.PORT, '3001');
    assert.equal(config.NODE_ENV, 'development');
    assert.equal(config.TRUST_PROXY, false);
    assert.equal(config.EMAIL_FROM, 'Fieldio <noreply@fieldio.app>');
    assert.equal(config.S3_REGION, 'us-east-1');
});

run('parseEnv coerces boolean-like values', () => {
    const config = parseEnv({
        ...validEnv,
        TRUST_PROXY: 'true',
        NODE_ENV: 'test',
    });

    assert.equal(config.TRUST_PROXY, true);
    assert.equal(config.NODE_ENV, 'test');
});

run('parseEnv rejects invalid urls and empty required values', () => {
    assert.throws(
        () =>
            parseEnv({
                ...validEnv,
                API_URL: 'not-a-url',
                JWT_SECRET: '',
            }),
        /Invalid environment variables/
    );
});
