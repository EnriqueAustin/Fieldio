import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (
    err: Error | AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    logger.error(err);

    if (err instanceof AppError && err.isOperational) {
        res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
        });
        return;
    }

    if (err instanceof ZodError) {
        res.status(StatusCodes.BAD_REQUEST).json({
            status: 'error',
            message: 'Validation failed',
            errors: err.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
        return;
    }

    // Generic fallback
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: 'Something went wrong',
    });
};
