import { Router } from 'express';
import { markupRuleController } from '../modules/markup-rules/markup-rules.controller';
import { requireUser, restrictTo } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';

export const markupRuleRouter = Router();

markupRuleRouter.use(requireUser);
markupRuleRouter.use(restrictTo('ADMIN'));

markupRuleRouter.get('/', catchAsync(markupRuleController.getAll));
markupRuleRouter.post('/', catchAsync(markupRuleController.upsert));
markupRuleRouter.put('/:id', catchAsync(markupRuleController.update));
markupRuleRouter.delete('/:id', catchAsync(markupRuleController.delete));
markupRuleRouter.post('/calculate', catchAsync(markupRuleController.calculateMarkup));
