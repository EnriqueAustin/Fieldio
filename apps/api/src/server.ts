import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error';
import { deserializeUser } from './middleware/auth';
import { socketService } from './services/socket.service';
import { startRecurringScheduler } from './modules/recurring/recurring.service';
import { startReviewScheduler } from './modules/reviews/review.service';
import { startCampaignScheduler } from './modules/campaigns/campaigns.service';
import { startDunningScheduler } from './modules/dunning/dunning.service';
import { startEstimateFollowupScheduler } from './modules/estimates/followups.service';
import { startMembershipMaintenanceScheduler } from './modules/memberships/maintenance.service';
import { startInventoryAlertScheduler } from './modules/inventory-alerts/inventory-alerts.service';
import { startAppointmentReminderScheduler } from './modules/scheduling/reminders.service';
import { startVanServiceScheduler } from './modules/vans/van-service.service';

// Routes
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/users';
import { companyRouter } from './routes/company';
import { customerRouter } from './routes/customers';
import { schedulingRouter } from './routes/scheduling';
import { jobRouter } from './routes/jobs';
import { financeRouter } from './routes/finance';
import { operationsRouter } from './routes/operations';
import { analyticsRouter } from './routes/analytics';
import { paymentsRouter, publicPaymentsRouter, stripeWebhookHandler } from './routes/payments';
import { jobPhotosRouter } from './routes/jobPhotos';
import { trackingRouter } from './routes/tracking';
import { publicBookingsRouter, bookingsRouter } from './routes/bookings';
import { recurringRouter } from './routes/recurring';
import { supplierRouter } from './routes/suppliers';
import { priceBookRouter } from './routes/priceBook';
import { publicPortalRouter, portalRouter } from './routes/portal';
import { projectsRouter } from './routes/projects';
import { timeTrackingRouter } from './routes/timeTracking';
import { digitalFormsRouter } from './routes/digitalForms';
import { inventoryTransfersRouter } from './routes/inventoryTransfers';
import { membershipRouter } from './routes/memberships';
import { campaignRouter } from './routes/campaigns';
import { permitRouter } from './routes/permits';
import { subcontractorRouter } from './routes/subcontractors';
import { financingRouter } from './routes/financing';
import { flatRateRouter } from './routes/flatRate';
import { customerNoteRouter } from './routes/customerNotes';
import { warrantyClaimRouter } from './routes/warrantyClaims';
import { certificationRouter } from './routes/certifications';
import { markupRuleRouter } from './routes/markupRules';
import { vanRouter } from './routes/vans';
import { sageExportRouter } from './routes/sageExport';
import { leadsRouter } from './routes/leads';
import { jobTemplatesRouter } from './routes/jobTemplates';
import { messagingRouter, publicMessagingRouter } from './routes/messaging';
import { callsRouter, publicCallsRouter } from './routes/calls';
import { dunningRouter } from './routes/dunning';
import { creditNotesRouter } from './routes/creditNotes';
import { statementsRouter } from './routes/statements';
import { documentsRouter } from './routes/documents';
import { inventoryAlertsRouter } from './routes/inventoryAlerts';
import { branchesRouter } from './routes/branches';
import { publicTrackerRouter } from './routes/scheduling';
const app = express();
const httpServer = createServer(app);

socketService.init(httpServer);

import { authLimiter, apiLimiter, publicEndpointLimiter, bookingLimiter, webhookLimiter } from './middleware/rateLimit';

// Security
app.disable('x-powered-by');
app.set('trust proxy', config.TRUST_PROXY);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", config.WEB_URL],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === config.WEB_URL) {
        callback(null, true);
        return;
      }
      callback(new Error('Blocked by CORS'));
    },
    credentials: true,
  })
);

// Stripe webhook MUST receive the raw body — register it BEFORE express.json().
app.post(
  '/webhooks/stripe',
  webhookLimiter,
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

// Rate limiting
app.use('/auth', authLimiter);
app.use('/public/payments', publicEndpointLimiter);
app.use('/public/portal', publicEndpointLimiter);
app.use('/public/bookings', bookingLimiter);
app.use('/', apiLimiter);

// Logging
app.use(pinoHttp({ logger }));

// Body & Cookie parsing
app.use(express.json({ limit: config.API_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: config.API_BODY_LIMIT }));
app.use(cookieParser());

// Public (no-auth) routes
app.use('/public/payments', publicPaymentsRouter);
app.use('/public/bookings', publicBookingsRouter);
app.use('/public/portal', publicPortalRouter);
app.use('/public/messaging', publicMessagingRouter);
app.use('/public/calls', publicCallsRouter);
app.use('/public/track', publicTrackerRouter);

// Auth deserialization for everything below
app.use(deserializeUser);

// Authenticated routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/users', userRouter);
app.use('/company', companyRouter);
app.use('/customers', customerRouter);
app.use('/schedule', schedulingRouter);
app.use('/jobs', jobRouter);
app.use('/finance', financeRouter);
app.use('/operations', operationsRouter);
app.use('/analytics', analyticsRouter);
app.use('/payments', paymentsRouter);
app.use('/media', jobPhotosRouter);
app.use('/tracking', trackingRouter);
app.use('/bookings', bookingsRouter);
app.use('/recurring', recurringRouter);
app.use('/suppliers', supplierRouter);
app.use('/price-book', priceBookRouter);
app.use('/portal', portalRouter);
app.use('/projects', projectsRouter);
app.use('/time-tracking', timeTrackingRouter);
app.use('/digital-forms', digitalFormsRouter);
app.use('/inventory-transfers', inventoryTransfersRouter);
app.use('/memberships', membershipRouter);
app.use('/campaigns', campaignRouter);
app.use('/permits', permitRouter);
app.use('/subcontractors', subcontractorRouter);
app.use('/financing', financingRouter);
app.use('/flat-rate', flatRateRouter);
app.use('/customer-notes', customerNoteRouter);
app.use('/warranty-claims', warrantyClaimRouter);
app.use('/certifications', certificationRouter);
app.use('/markup-rules', markupRuleRouter);
app.use('/vans', vanRouter);
app.use('/finance/export', sageExportRouter);
app.use('/leads', leadsRouter);
app.use('/job-templates', jobTemplatesRouter);
app.use('/messaging', messagingRouter);
app.use('/calls', callsRouter);
app.use('/dunning', dunningRouter);
app.use('/credit-notes', creditNotesRouter);
app.use('/statements', statementsRouter);
app.use('/documents', documentsRouter);
app.use('/inventory-alerts', inventoryAlertsRouter);
app.use('/branches', branchesRouter);

// Error handling
app.use(errorHandler);

httpServer.listen(config.PORT, () => {
  logger.info(`API running on port ${config.PORT} in ${config.NODE_ENV} mode`);
  startRecurringScheduler();
  startReviewScheduler();
  startCampaignScheduler();
  startDunningScheduler();
  startEstimateFollowupScheduler();
  startMembershipMaintenanceScheduler();
  startInventoryAlertScheduler();
  startAppointmentReminderScheduler();
  startVanServiceScheduler();
});
