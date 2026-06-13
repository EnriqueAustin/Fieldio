import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { storageService, isStorageConfigured } from '../../services/storage.service';
import { socketService } from '../../services/socket.service';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const MAX_PHOTO_SIZE = 15 * 1024 * 1024; // 15 MB

const IMAGE_SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
    { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47] },
    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function validateImageMagicBytes(buffer: Buffer): boolean {
    return IMAGE_SIGNATURES.some(({ bytes }) =>
        bytes.every((byte, i) => buffer.length > i && buffer[i] === byte)
    );
}

export const jobPhotosController = {
    list: async (req: Request, res: Response) => {
        const job = await prisma.job.findFirst({
            where: { id: req.params.jobId, companyId: req.user!.companyId },
            select: { id: true },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const photos = await prisma.jobPhoto.findMany({
            where: { jobId: job.id },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ status: 'success', data: { photos } });
    },

    upload: async (req: Request, res: Response) => {
        if (!isStorageConfigured()) {
            throw new AppError(
                'Photo storage is not configured on this server',
                StatusCodes.SERVICE_UNAVAILABLE
            );
        }
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) throw new AppError('No file provided', StatusCodes.BAD_REQUEST);
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            throw new AppError('Only JPEG, PNG, WebP, and HEIC images are accepted', StatusCodes.BAD_REQUEST);
        }
        if (file.size > MAX_PHOTO_SIZE) {
            throw new AppError('File too large (max 15 MB)', StatusCodes.BAD_REQUEST);
        }
        if (!validateImageMagicBytes(file.buffer)) {
            throw new AppError('File content does not match an image format', StatusCodes.BAD_REQUEST);
        }

        const job = await prisma.job.findFirst({
            where: { id: req.params.jobId, companyId: req.user!.companyId },
        });
        if (!job) throw new AppError('Job not found', StatusCodes.NOT_FOUND);

        const uploaded = await storageService.uploadJobPhoto({
            companyId: job.companyId,
            jobId: job.id,
            buffer: file.buffer,
            contentType: file.mimetype,
        });

        const photo = await prisma.jobPhoto.create({
            data: {
                jobId: job.id,
                companyId: job.companyId,
                url: uploaded.url,
                thumbnailUrl: uploaded.thumbnailUrl,
                caption: (req.body?.caption as string) || null,
                uploadedById: req.user!.userId,
            },
        });

        socketService.emitToCompany(job.companyId, 'job:photo:added', { jobId: job.id, photo });

        res.status(StatusCodes.CREATED).json({ status: 'success', data: { photo } });
    },

    remove: async (req: Request, res: Response) => {
        const photo = await prisma.jobPhoto.findFirst({
            where: { id: req.params.photoId, companyId: req.user!.companyId },
        });
        if (!photo) throw new AppError('Photo not found', StatusCodes.NOT_FOUND);
        await prisma.jobPhoto.delete({ where: { id: photo.id } });
        res.status(StatusCodes.NO_CONTENT).send();
    },
};
