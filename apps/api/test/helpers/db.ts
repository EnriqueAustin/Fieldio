import { createFakePrisma } from './fakePrisma';

// A single shared fake-Prisma instance. The `@fieldio/database` module mock
// resolves to this exact object, and tests seed/inspect the same instance.
export const fakePrisma = createFakePrisma();
