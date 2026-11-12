import express, { type Express } from 'express';
import { deserializeUser } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error';
import { publicPortalRouter } from '../../src/routes/portal';
import { financeRouter } from '../../src/routes/finance';
import { publicPaymentsRouter } from '../../src/routes/payments';
import { analyticsRouter } from '../../src/routes/analytics';
import { sageExportRouter } from '../../src/routes/sageExport';
import { vanRouter } from '../../src/routes/vans';
import { digitalFormsRouter } from '../../src/routes/digitalForms';
import { searchRouter } from '../../src/routes/search';
import { schedulingRouter, publicTrackerRouter } from '../../src/routes/scheduling';
import { messagingRouter, publicMessagingRouter } from '../../src/routes/messaging';
// Routers exercised by the RBAC sweep (test/rbac.sweep.test.ts).
import { authRouter } from '../../src/routes/auth';
import { userRouter } from '../../src/routes/users';
import { operationsRouter } from '../../src/routes/operations';
import { trackingRouter } from '../../src/routes/tracking';
import { bookingsRouter } from '../../src/routes/bookings';
import { recurringRouter } from '../../src/routes/recurring';
import { projectsRouter } from '../../src/routes/projects';
import { inventoryTransfersRouter } from '../../src/routes/inventoryTransfers';
import { permitRouter } from '../../src/routes/permits';
import { warrantyClaimRouter } from '../../src/routes/warrantyClaims';
import { certificationRouter } from '../../src/routes/certifications';
import { leadsRouter } from '../../src/routes/leads';
import { dunningRouter } from '../../src/routes/dunning';
import { documentsRouter } from '../../src/routes/documents';
import { inventoryAlertsRouter } from '../../src/routes/inventoryAlerts';
import { branchesRouter } from '../../src/routes/branches';
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
    app.use('/public/track', publicTrackerRouter);
    app.use('/public/messaging', publicMessagingRouter);

    // Authenticated routes: deserialize the bearer token, then mount routers.
    app.use(deserializeUser);
    app.use('/finance', financeRouter);
    app.use('/finance/export', sageExportRouter);
    app.use('/analytics', analyticsRouter);
    app.use('/vans', vanRouter);
    app.use('/digital-forms', digitalFormsRouter);
    app.use('/search', searchRouter);
    app.use('/schedule', schedulingRouter);
    app.use('/messaging', messagingRouter);
    app.use('/auth', authRouter);
    app.use('/users', userRouter);
    app.use('/operations', operationsRouter);
    app.use('/tracking', trackingRouter);
    app.use('/bookings', bookingsRouter);
    app.use('/recurring', recurringRouter);
    app.use('/projects', projectsRouter);
    app.use('/inventory-transfers', inventoryTransfersRouter);
    app.use('/permits', permitRouter);
    app.use('/warranty-claims', warrantyClaimRouter);
    app.use('/certifications', certificationRouter);
    app.use('/leads', leadsRouter);
    app.use('/dunning', dunningRouter);
    app.use('/documents', documentsRouter);
    app.use('/inventory-alerts', inventoryAlertsRouter);
    app.use('/branches', branchesRouter);

    app.use(errorHandler);
    return app;
}

type Role = 'ADMIN' | 'OFFICE' | 'DISPATCHER' | 'TECHNICIAN' | 'ACCOUNTANT' | 'SALES' | 'CSR';

// Produces an Authorization header value for a user of the given role/company.
export function authHeader(opts: { role: Role; companyId?: string; userId?: string }) {
    const token = signAccessToken({
        userId: opts.userId ?? 'user_test',
        companyId: opts.companyId ?? 'company_1',
        role: opts.role,
    });
    return `Bearer ${token}`;
}
