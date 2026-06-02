import { Router } from 'express';
import { companyController } from '../modules/company/company.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const companyRouter = Router();

companyRouter.use(requireUser);

companyRouter.get('/me', catchAsync(companyController.getMe));
companyRouter.patch('/me', restrictTo('ADMIN'), catchAsync(companyController.updateMe));
companyRouter.get('/integrations/xero', restrictTo('ADMIN'), catchAsync(companyController.getXeroConnections));
companyRouter.put('/integrations/xero', restrictTo('ADMIN'), catchAsync(companyController.upsertXeroConnection));

// Signature upload endpoint
companyRouter.post('/signatures/upload', restrictTo('ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN'), catchAsync(companyController.uploadSignature));
