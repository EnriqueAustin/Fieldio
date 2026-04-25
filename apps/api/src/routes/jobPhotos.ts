import { Router } from 'express';
import multer from 'multer';
import { jobPhotosController } from '../modules/jobs/photos.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

export const jobPhotosRouter = Router();
jobPhotosRouter.use(requireUser);

jobPhotosRouter.get('/jobs/:jobId/photos', catchAsync(jobPhotosController.list));
jobPhotosRouter.post(
    '/jobs/:jobId/photos',
    upload.single('photo'),
    catchAsync(jobPhotosController.upload)
);
jobPhotosRouter.delete('/photos/:photoId', catchAsync(jobPhotosController.remove));
