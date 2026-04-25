import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { storageService, isStorageConfigured } from '../../services/storage.service';
import { socketService } from '../../services/socket.service';

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
        if (!file.mimetype.startsWith('image/')) {
            throw new AppError('Only images are accepted', StatusCodes.BAD_REQUEST);
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
