import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { expensesService } from './expenses.service';
import { storageService, isStorageConfigured } from '../../services/storage.service';
import { AppError } from '../../middleware/error';

const ALLOWED_RECEIPT_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
]);
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

export const expensesController = {
    create: async (req: Request, res: Response) => {
        const file = (req as any).file as Express.Multer.File | undefined;
        let receiptUrl: string | undefined = req.body?.receiptUrl;
        const jobId = req.params.jobId || req.body.jobId;

        if (file) {
            if (!isStorageConfigured()) {
                throw new AppError(
                    'Receipt storage is not configured on this server',
                    StatusCodes.SERVICE_UNAVAILABLE
                );
            }
            if (!ALLOWED_RECEIPT_MIME.has(file.mimetype)) {
                throw new AppError(
                    'Receipt must be a JPEG, PNG, WebP, HEIC, or PDF',
                    StatusCodes.BAD_REQUEST
                );
            }
            if (file.size > MAX_RECEIPT_SIZE) {
                throw new AppError('Receipt file too large (max 10 MB)', StatusCodes.BAD_REQUEST);
            }
            const uploaded = await storageService.uploadBuffer({
                companyId: req.user!.companyId,
                folder: `jobs/${jobId}/receipts`,
                fileName: file.originalname || `receipt-${Date.now()}`,
                buffer: file.buffer,
                contentType: file.mimetype,
            });
            receiptUrl = uploaded.url;
        }

        const payload: Record<string, unknown> = {
            jobId,
            description: req.body.description,
            amount: typeof req.body.amount === 'string' ? parseFloat(req.body.amount) : req.body.amount,
            category: req.body.category,
            date: req.body.date || new Date().toISOString(),
        };
        if (receiptUrl) payload.receiptUrl = receiptUrl;

        const expense = await expensesService.create(req.user!.companyId, payload as any, req.user!.userId);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { expense } });
    },

    getByJob: async (req: Request, res: Response) => {
        const expenses = await expensesService.getByJob(req.params.jobId, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { expenses } });
    }
};
