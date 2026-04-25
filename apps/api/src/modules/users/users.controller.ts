import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { userService } from './users.service';

export const userController = {
    getAll: async (req: Request, res: Response) => {
        const users = await userService.findAll(req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success', data: { users } });
    },

    create: async (req: Request, res: Response) => {
        const user = await userService.create(req.user!.companyId, req.body);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { user } });
    },

    update: async (req: Request, res: Response) => {
        const user = await userService.update(req.params.id, req.user!.companyId, req.body);
        res.status(StatusCodes.OK).json({ status: 'success', data: { user } });
    },

    delete: async (req: Request, res: Response) => {
        await userService.delete(req.params.id, req.user!.companyId);
        res.status(StatusCodes.OK).json({ status: 'success' });
    },
};
