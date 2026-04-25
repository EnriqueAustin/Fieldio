import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { prisma } from '@fieldio/database';
import { AppError } from '../../middleware/error';
import { socketService } from '../../services/socket.service';

const publicSubmitSchema = z.object({
    name: z.string().min(2),
    email: z.string().email().optional(),
    phone: z.string().min(7).optional(),
    addressLine1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    serviceType: z.string().optional(),
    description: z.string().min(5),
    preferredDate: z.string().datetime().optional(),
});

export const bookingsController = {
    /**
     * Public submission — used by /book/:companyId on the marketing site.
     */
    submit: async (req: Request, res: Response) => {
        const companyId = req.params.companyId;
        const company = await prisma.company.findUnique({ where: { id: companyId } });
        if (!company) throw new AppError('Company not found', StatusCodes.NOT_FOUND);

        const body = publicSubmitSchema.parse(req.body);
        const booking = await prisma.bookingRequest.create({
            data: {
                companyId,
                ...body,
                preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined,
            },
        });

        socketService.emitToCompany(companyId, 'booking:received', booking);
        res.status(StatusCodes.CREATED).json({ status: 'success', data: { booking } });
    },

    list: async (req: Request, res: Response) => {
        const bookings = await prisma.bookingRequest.findMany({
            where: { companyId: req.user!.companyId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ status: 'success', data: { bookings } });
    },

    /**
     * Convert a booking to a customer + property + REQUESTED job.
     */
    convert: async (req: Request, res: Response) => {
        const companyId = req.user!.companyId;
        const booking = await prisma.bookingRequest.findFirst({
            where: { id: req.params.id, companyId },
        });
        if (!booking) throw new AppError('Booking not found', StatusCodes.NOT_FOUND);

        const result = await prisma.$transaction(async (tx) => {
            const customer =
                booking.customerId
                    ? await tx.customer.findUnique({ where: { id: booking.customerId } })
                    : await tx.customer.create({
                          data: {
                              companyId,
                              name: booking.name,
                              email: booking.email,
                              phone: booking.phone,
                          },
                      });
            if (!customer) throw new AppError('Customer creation failed', StatusCodes.INTERNAL_SERVER_ERROR);

            const property = await tx.property.create({
                data: {
                    companyId,
                    customerId: customer.id,
                    addressLine1: booking.addressLine1 ?? 'Unknown',
                    city: booking.city ?? '',
                    state: booking.state ?? '',
                    zip: booking.zip ?? '',
                },
            });

            const job = await tx.job.create({
                data: {
                    companyId,
                    customerId: customer.id,
                    propertyId: property.id,
                    title: booking.serviceType ?? 'Service request',
                    description: booking.description,
                    scheduledStart: booking.preferredDate,
                    status: 'REQUESTED',
                },
            });

            await tx.bookingRequest.update({
                where: { id: booking.id },
                data: { status: 'CONVERTED', customerId: customer.id },
            });

            return { customer, property, job };
        });

        res.status(StatusCodes.CREATED).json({ status: 'success', data: result });
    },
};
