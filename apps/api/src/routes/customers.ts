import { Router } from 'express';
import { customerController } from '../modules/customers/customers.controller';
import { propertyController } from '../modules/properties/properties.controller';
import { requireUser } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const customerRouter = Router();

customerRouter.use(requireUser);

customerRouter.get('/', catchAsync(customerController.getAll));
customerRouter.post('/', catchAsync(customerController.create));
customerRouter.get('/:id', catchAsync(customerController.getOne));
customerRouter.patch('/:id', catchAsync(customerController.update));

// Nested Property Routes
customerRouter.post('/:customerId/properties', catchAsync(propertyController.create));
