import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { searchService } from './search.service';

export const searchController = {
    global: async (req: Request, res: Response) => {
        const q = String(req.query.q ?? '');
        const results = await searchService.globalSearch(req.user!.companyId, q);
        res.status(StatusCodes.OK).json({ status: 'success', data: results });
    },
};
