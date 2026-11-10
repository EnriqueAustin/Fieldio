import pino from 'pino';
import { config } from '../config/env';

const isDev = config.NODE_ENV === 'development';

// Never write credentials or session material to the logs. pino-http logs
// `req`/`res` through this logger, so these paths cover request logging too.
const SECRET_KEYS = ['password', 'newPassword', 'currentPassword', 'token', 'accessToken', 'refreshToken', 'passphrase', 'merchantKey', 'apiKey', 'secret'];
export const LOG_REDACT_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-twilio-signature"]',
    'req.headers["x-hub-signature-256"]',
    'res.headers["set-cookie"]',
    'headers.authorization',
    'headers.cookie',
    ...SECRET_KEYS.flatMap((k) => [k, `*.${k}`, `req.body.${k}`, `body.${k}`]),
];

export const loggerOptions: pino.LoggerOptions = {
    level: isDev ? 'debug' : 'info',
    redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
};

// In dev, pretty-print in the main thread. pino's worker-thread `transport`
// crashes under `tsx --watch` on Node 24 ("this should not happen: undefined").
// Loaded lazily so production never needs the pino-pretty dev dependency.
const prettyStream = isDev ? require('pino-pretty')({ colorize: true }) : undefined;

export const logger = pino(loggerOptions, prettyStream);
