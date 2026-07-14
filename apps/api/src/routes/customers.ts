import { Router } from 'express';
import { customerController } from '../modules/customers/customers.controller';
import { propertyController } from '../modules/properties/properties.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const customerRouter = Router();

customerRouter.use(requireUser);

customerRouter.get('/', catchAsync(customerController.getAll));
customerRouter.post('/', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(customerController.create));
customerRouter.post('/import', restrictTo('ADMIN', 'OFFICE'), catchAsync(customerController.bulkImport));
customerRouter.get('/:id', catchAsync(customerController.getOne));
customerRouter.patch('/:id', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(customerController.update));
customerRouter.delete('/:id', restrictTo('ADMIN', 'OFFICE'), catchAsync(customerController.softDelete));

// Nested Property Routes
customerRouter.post('/:customerId/properties', restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'), catchAsync(propertyController.create));
customerRouter.post(
    '/:customerId/properties/:propertyId/assets',
    restrictTo('ADMIN', 'OFFICE', 'DISPATCHER'),
    catchAsync(propertyController.createAsset)
);
