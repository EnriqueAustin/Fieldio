import { Router } from 'express';
import { campaignController } from '../modules/campaigns/campaigns.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const campaignRouter = Router();

campaignRouter.use(requireUser);
// Sales works the campaigns they are selling into, so they can read them;
// creating and editing campaigns (which carry spend) stays office-side.
campaignRouter.use(restrictTo('ADMIN', 'OFFICE', 'SALES'));
const officeOnly = restrictTo('ADMIN', 'OFFICE');

campaignRouter.get('/', catchAsync(campaignController.getAll));
campaignRouter.get('/:id', catchAsync(campaignController.getOne));
campaignRouter.post('/', officeOnly, catchAsync(campaignController.create));
campaignRouter.put('/:id', officeOnly, catchAsync(campaignController.update));
campaignRouter.delete('/:id', officeOnly, catchAsync(campaignController.delete));
campaignRouter.get('/:id/stats', catchAsync(campaignController.getStats));
