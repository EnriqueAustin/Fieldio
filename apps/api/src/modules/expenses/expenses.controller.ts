import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { expensesService } from './expenses.service';

export const expensesController = {
    create: async (req: Request, res: Response) => {
        // jobId could be body or params
        const expense = await expensesService.create(req.user!.companyId, {
            ...req.body,
            jobId: req.params.jobId || req.body.jobId
        });
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { expense } });
    },

    getByJob: async (req: Request, res: Response) => {
        const expenses = await expensesService.getByJob(req.params.jobId, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { expenses } });
    }
};
