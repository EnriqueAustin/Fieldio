import { Router } from 'express';
import { campaignController } from '../modules/campaigns/campaigns.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const campaignRouter = Router();

campaignRouter.use(requireUser);

campaignRouter.get('/', catchAsync(campaignController.getAll));
campaignRouter.get('/:id', catchAsync(campaignController.getOne));
campaignRouter.post('/', catchAsync(campaignController.create));
campaignRouter.put('/:id', catchAsync(campaignController.update));
campaignRouter.delete('/:id', catchAsync(campaignController.delete));
campaignRouter.get('/:id/stats', catchAsync(campaignController.getStats));
