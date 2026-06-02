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

const app = express();
const httpServer = createServer(app);

socketService.init(httpServer);

import { authLimiter, apiLimiter } from './middleware/rateLimit';

// Security
app.disable('x-powered-by');
app.set('trust proxy', config.TRUST_PROXY);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
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
  express.raw({ type: 'application/json' }),
  stripeWebhookHandler
);

// Rate limiting
app.use('/auth', authLimiter);
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

// Error handling
app.use(errorHandler);

httpServer.listen(config.PORT, () => {
  logger.info(`API running on port ${config.PORT} in ${config.NODE_ENV} mode`);
  startRecurringScheduler();
  startReviewScheduler();
});
