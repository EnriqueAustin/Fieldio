import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'http';
import request from 'supertest';
import express, { type Express } from 'express';

// Recording stand-in for socket.io (same approach as socket.scoping.test.ts):
// every emit is captured with the rooms it targeted and excluded.
type Emit = { rooms: string[]; except: string[]; event: string; data: any };
const io = vi.hoisted(() => {
    const emits: Emit[] = [];
    const operator = (rooms: string[], except: string[] = []) => ({
        except: (r: string | string[]) => operator(rooms, [...except, ...([] as string[]).concat(r)]),
        to: (r: string | string[]) => operator([...rooms, ...([] as string[]).concat(r)], except),
        emit: (event: string, data: unknown) => {
            emits.push({ rooms, except, event, data });
            return true;
        },
    });
    return {
        emits,
        Server: class {
            use() {}
            on() {}
            to(r: string | string[]) {
                return operator(([] as string[]).concat(r));
            }
        },
    };
});
vi.mock('socket.io', () => ({ Server: io.Server }));

vi.mock('@fieldio/database', async () => {
    const { fakePrisma } = await import('./helpers/db');
    return { prisma: fakePrisma };
});

vi.mock('../src/services/notifications/notification.service', () => ({
    notificationService: { notifyCustomer: vi.fn(), notifyUser: vi.fn(), notify: vi.fn(), notifyStaff: vi.fn() },
}));

import { fakePrisma } from './helpers/db';
import { authHeader } from './helpers/app';
import { deserializeUser } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/error';
import { jobRouter } from '../src/routes/jobs';
import { schedulingRouter } from '../src/routes/scheduling';
import { socketService } from '../src/services/socket.service';
import { notificationService } from '../src/services/notifications/notification.service';
import { previousAssignees } from '../src/utils/reassignment';

function buildApp(): Express {
    const app = express();
    app.use(express.json());
    app.use(deserializeUser);
    app.use('/jobs', jobRouter);
    app.use('/schedule', schedulingRouter);
    app.use(errorHandler);
    return app;
}

const app = buildApp();
const C = 'company_1';
const LEAD = '11111111-1111-4111-8111-111111111111';
const OLD_CREW = '22222222-2222-4222-8222-222222222222';
const NEW_CREW = '33333333-3333-4333-8333-333333333333';
const VAN_X = '44444444-4444-4444-8444-444444444444';
const VAN_Y = '55555555-5555-4555-8555-555555555555';
const JOB = '66666666-6666-4666-8666-666666666666';

const asOffice = () => authHeader({ role: 'OFFICE', userId: 'office_1', companyId: C });
const user = (id: string) => `user:${id}`;
const deliveredTo = (userId: string, event: string) =>
    io.emits.filter((e) => e.event === event && e.rooms.includes(user(userId)) && !e.except.includes(user(userId)));
const notifyUser = vi.mocked(notificationService.notifyUser);

beforeAll(() => {
    socketService.init({} as HttpServer);
});

beforeEach(() => {
    io.emits.length = 0;
    fakePrisma.$reset();
    vi.clearAllMocks();
    fakePrisma.user.seed([{ id: LEAD, companyId: C, role: 'TECHNICIAN', status: 'ACTIVE', email: 'lead@example.com' }]);
    fakePrisma.van.seed([
        { id: VAN_X, companyId: C, name: 'Bakkie X', active: true },
        { id: VAN_Y, companyId: C, name: 'Bakkie Y', active: true },
    ]);
    fakePrisma.vanMember.seed([
        { id: 'vm_1', vanId: VAN_X, userId: LEAD },
        { id: 'vm_2', vanId: VAN_X, userId: OLD_CREW },
        { id: 'vm_3', vanId: VAN_Y, userId: NEW_CREW },
    ]);
    fakePrisma.job.seed([
        {
            id: JOB, companyId: C, title: 'Burst geyser', status: 'ASSIGNED', techId: LEAD, vanId: VAN_X,
            customerId: 'cust_1', customer: { id: 'cust_1', name: 'Mthembu' }, scheduledStart: null, scheduledEnd: null,
        },
    ]);
});

describe('previousAssignees', () => {
    it('names only the assignees that changed', () => {
        expect(previousAssignees({ techId: 'a', vanId: 'x' }, { techId: 'a', vanId: 'x' })).toEqual({});
        expect(previousAssignees({ techId: 'a', vanId: 'x' }, { techId: 'b', vanId: null })).toEqual({
            previousTechId: 'a',
            previousVanId: 'x',
        });
        expect(previousAssignees({ techId: null, vanId: null }, { techId: 'b', vanId: 'y' })).toEqual({});
    });
});

describe('socket routing of a reassigned job', () => {
    it("delivers to the previous van's crew as well as the current one", async () => {
        socketService.emitToCompany(C, 'job:updated', { id: JOB, techId: LEAD, vanId: VAN_Y, previousVanId: VAN_X });

        await vi.waitFor(() => expect(deliveredTo(NEW_CREW, 'job:updated')).toHaveLength(1));
        expect(deliveredTo(OLD_CREW, 'job:updated')).toHaveLength(1);
        expect(deliveredTo(LEAD, 'job:updated')).toHaveLength(1);
    });

    it('delivers to the previous tech', async () => {
        socketService.emitToCompany(C, 'schedule:updated', { id: JOB, techId: null, vanId: null, previousTechId: LEAD });
        await vi.waitFor(() => expect(deliveredTo(LEAD, 'schedule:updated')).toHaveLength(1));
    });
});

describe('PATCH /jobs/:id van change', () => {
    it('X → Y: old crew told it is off their schedule, new crew told they have it, live', async () => {
        const res = await request(app).patch(`/jobs/${JOB}`).set('Authorization', asOffice()).send({ vanId: VAN_Y });

        expect(res.status).toBe(200);
        expect(notifyUser).toHaveBeenCalledWith(
            OLD_CREW, C, 'ALERT', 'Job reassigned', expect.any(String), { jobId: JOB, url: '/' },
        );
        expect(notifyUser).toHaveBeenCalledWith(
            NEW_CREW, C, 'JOB_ASSIGNED', 'New van job', expect.any(String), { jobId: JOB, url: `/?job=${JOB}` },
        );
        // The lead tech is still on the job: no "reassigned" for them.
        expect(notifyUser.mock.calls.filter((c) => c[0] === LEAD)).toHaveLength(0);

        await vi.waitFor(() => expect(deliveredTo(OLD_CREW, 'job:updated')).toHaveLength(1));
        expect(deliveredTo(OLD_CREW, 'job:updated')[0].data.previousVanId).toBe(VAN_X);
    });

    it('X → none: the old crew still hears about it', async () => {
        const res = await request(app).patch(`/jobs/${JOB}`).set('Authorization', asOffice()).send({ vanId: null });

        expect(res.status).toBe(200);
        expect(notifyUser).toHaveBeenCalledWith(
            OLD_CREW, C, 'ALERT', 'Job reassigned', expect.any(String), { jobId: JOB, url: '/' },
        );
        await vi.waitFor(() => expect(deliveredTo(OLD_CREW, 'job:updated')).toHaveLength(1));
    });

    it('an unrelated edit names no previous assignee', async () => {
        await request(app).patch(`/jobs/${JOB}`).set('Authorization', asOffice()).send({ title: 'Burst geyser (urgent)' });

        const office = io.emits.find((e) => e.event === 'job:updated');
        expect(office?.data).not.toHaveProperty('previousVanId');
        expect(office?.data).not.toHaveProperty('previousTechId');
        expect(notifyUser).not.toHaveBeenCalled();
    });
});

describe('PATCH /schedule/jobs/:id van change', () => {
    it('X → none reaches the old crew live and in-app', async () => {
        const res = await request(app)
            .patch(`/schedule/jobs/${JOB}`)
            .set('Authorization', authHeader({ role: 'DISPATCHER', userId: 'disp_1', companyId: C }))
            .send({ vanId: null });

        expect(res.status).toBe(200);
        await vi.waitFor(() => expect(deliveredTo(OLD_CREW, 'schedule:updated')).toHaveLength(1));
        expect(deliveredTo(OLD_CREW, 'schedule:updated')[0].data.previousVanId).toBe(VAN_X);
        expect(notifyUser).toHaveBeenCalledWith(
            OLD_CREW, C, 'ALERT', 'Job reassigned', expect.any(String), { jobId: JOB, url: '/' },
        );
    });
});
