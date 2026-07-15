import express, { type Express } from 'express';
import { deserializeUser } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error';
import { publicPortalRouter } from '../../src/routes/portal';
import { financeRouter } from '../../src/routes/finance';
import { publicPaymentsRouter } from '../../src/routes/payments';
import { analyticsRouter } from '../../src/routes/analytics';
import { sageExportRouter } from '../../src/routes/sageExport';
import { signAccessToken } from '../../src/utils/jwt';

// Builds an Express app that mirrors the middleware chain of the real
// server (src/server.ts) for just the routers under test — without the
// socket server, schedulers, or `.listen()`. Supertest drives this directly.
export function buildTestApp(): Express {
    const app = express();
    app.use(express.json());

    // Public (no-auth) portal + payments routes, mounted exactly as in server.ts.
    app.use('/public/portal', publicPortalRouter);
    app.use('/public/payments', publicPaymentsRouter);

    // Authenticated routes: deserialize the bearer token, then mount routers.
    app.use(deserializeUser);
    app.use('/finance', financeRouter);
    app.use('/finance/export', sageExportRouter);
    app.use('/analytics', analyticsRouter);

    app.use(errorHandler);
    return app;
}

type Role = 'ADMIN' | 'OFFICE' | 'DISPATCHER' | 'TECHNICIAN' | 'ACCOUNTANT' | 'SALES';

// Produces an Authorization header value for a user of the given role/company.
export function authHeader(opts: { role: Role; companyId?: string; userId?: string }) {
    const token = signAccessToken({
        userId: opts.userId ?? 'user_test',
        companyId: opts.companyId ?? 'company_1',
        role: opts.role,
    });
    return `Bearer ${token}`;
}
