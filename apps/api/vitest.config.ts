import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['test/**/*.test.ts'],
        setupFiles: ['./test/setup.ts'],
        // Route/service tests share module-level singletons (config, routers),
        // so run serially for determinism.
        pool: 'forks',
        poolOptions: { forks: { singleFork: true } },
    },
});
