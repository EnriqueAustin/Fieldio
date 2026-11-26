import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'http';

// A recording stand-in for socket.io: every emit is captured with the rooms it
// targeted and the rooms it excluded, so routing can be asserted without sockets.
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

import { fakePrisma } from './helpers/db';
import { socketService } from '../src/services/socket.service';

const C = 'company_1';
const role = (r: string) => `role:${C}:${r}`;
const user = (id: string) => `user:${id}`;
const NON_TECH_ROLE_ROOMS = ['ADMIN', 'DISPATCHER', 'OFFICE', 'CSR', 'SALES', 'ACCOUNTANT'].map(role);

/** Every emit of `event` whose target includes `room` (and doesn't exclude it). */
const deliveredTo = (room: string, event: string) =>
    io.emits.filter((e) => e.event === event && e.rooms.includes(room) && !e.except.includes(room));

/** Rooms that received any copy of `event`, flattened. */
const roomsFor = (event: string) => io.emits.filter((e) => e.event === event).flatMap((e) => e.rooms);

const job = {
    id: 'job_1',
    companyId: C,
    title: 'Burst geyser',
    techId: 'tech_assigned',
    vanId: 'van_1',
    customer: { name: 'Thabo Dlamini', phone: '+27821112222' },
    lineItems: [{ description: 'Geyser element', quantity: 1, unitPrice: 850, total: 850 }],
    total: 850,
};

beforeAll(() => {
    socketService.init({} as HttpServer);
});

beforeEach(() => {
    io.emits.length = 0;
    fakePrisma.$reset();
    fakePrisma.van.seed([{ id: 'van_1', companyId: C, name: 'Bakkie 1' }]);
    fakePrisma.vanMember.seed([
        { id: 'vm_1', vanId: 'van_1', userId: 'tech_assigned' },
        { id: 'vm_2', vanId: 'van_1', userId: 'tech_crew' },
    ]);
    fakePrisma.job.seed([{ id: 'job_1', companyId: C, techId: 'tech_assigned', vanId: 'van_1' }]);
});

describe('socket scoping of job events', () => {
    it('sends a job event to office roles in full and to the assigned tech + van crew only', async () => {
        socketService.emitToCompany(C, 'job:updated', job);

        await vi.waitFor(() => expect(deliveredTo(user('tech_crew'), 'job:updated')).toHaveLength(1));

        // Office roles: full payload, prices intact.
        for (const r of ['ADMIN', 'OFFICE', 'DISPATCHER']) {
            const [e] = deliveredTo(role(r), 'job:updated');
            expect(e.data.total).toBe(850);
        }
        // Assigned tech and van crew get it on their user rooms.
        expect(deliveredTo(user('tech_assigned'), 'job:updated')).toHaveLength(1);
        // The technician role room (every tech) never gets it, nor does another tech.
        const rooms = roomsFor('job:updated');
        expect(rooms).not.toContain(role('TECHNICIAN'));
        expect(rooms).not.toContain(`company:${C}`);
        expect(rooms).not.toContain(user('tech_other'));
    });

    it('strips prices from the copy technicians receive', async () => {
        socketService.emitToCompany(C, 'job:updated', job);
        await vi.waitFor(() => expect(deliveredTo(user('tech_assigned'), 'job:updated')).toHaveLength(1));

        const [e] = deliveredTo(user('tech_assigned'), 'job:updated');
        expect(e.data.total).toBeUndefined();
        expect(e.data.lineItems[0].unitPrice).toBeUndefined();
        expect(e.data.lineItems[0].description).toBe('Geyser element');
        expect(e.data.customer.name).toBe('Thabo Dlamini');
        // Office users who are also on the job are served by their role room, not twice.
        expect(e.except).toEqual(expect.arrayContaining(NON_TECH_ROLE_ROOMS));
        expect(e.except).not.toContain(role('TECHNICIAN'));
    });

    it('looks up the job when the payload only carries a job id', async () => {
        socketService.emitToCompany(C, 'job:note:added', { id: 'note_1', jobId: 'job_1', message: 'Gate code 1234' });
        socketService.emitToCompany(C, 'schedule:updated', { id: 'job_1', status: 'ON_SITE' });

        await vi.waitFor(() => expect(deliveredTo(user('tech_crew'), 'schedule:updated')).toHaveLength(1));
        expect(deliveredTo(user('tech_assigned'), 'job:note:added')).toHaveLength(1);
        expect(deliveredTo(user('tech_crew'), 'job:note:added')).toHaveLength(1);
        expect(deliveredTo(user('tech_assigned'), 'schedule:updated')).toHaveLength(1);
        expect(roomsFor('job:note:added')).not.toContain(role('TECHNICIAN'));
    });

    it('does not look up another tenant\'s job', async () => {
        fakePrisma.job.seed([{ id: 'job_x', companyId: 'company_2', techId: 'tech_elsewhere', vanId: null }]);
        socketService.emitToCompany(C, 'job:photo:added', { jobId: 'job_x', photo: { id: 'p1' } });
        socketService.emitToCompany(C, 'job:updated', job);

        await vi.waitFor(() => expect(deliveredTo(user('tech_assigned'), 'job:updated')).toHaveLength(1));
        expect(roomsFor('job:photo:added')).not.toContain(user('tech_elsewhere'));
    });

    it('an unassigned job reaches no technician at all', async () => {
        socketService.emitToCompany(C, 'job:created', { ...job, techId: null, vanId: null });
        socketService.emitToCompany(C, 'job:updated', job); // sentinel: queue has drained once this lands

        await vi.waitFor(() => expect(deliveredTo(user('tech_assigned'), 'job:updated')).toHaveLength(1));
        const created = io.emits.filter((e) => e.event === 'job:created');
        expect(created.flatMap((e) => e.rooms).every((r) => r.startsWith('role:') && r !== role('TECHNICIAN'))).toBe(true);
        expect(deliveredTo(role('DISPATCHER'), 'job:created')).toHaveLength(1);
    });

    it('van stock events reach that van\'s crew only', async () => {
        socketService.emitToCompany(C, 'inventory:used', { vanId: 'van_1', itemId: 'i1', jobId: 'job_1', quantityUsed: 1 });

        await vi.waitFor(() => expect(deliveredTo(user('tech_crew'), 'inventory:used')).toHaveLength(1));
        expect(deliveredTo(user('tech_assigned'), 'inventory:used')).toHaveLength(1);
        expect(roomsFor('inventory:used')).not.toContain(role('TECHNICIAN'));
    });

    it('keeps office-only and staff-only rules', () => {
        socketService.emitToCompany(C, 'invoice:paid', { invoiceId: 'inv_1', amount: 100 });
        socketService.emitToCompany(C, 'tech:location', { userId: 'tech_assigned', lat: 1, lng: 2 });

        expect(roomsFor('invoice:paid').sort()).toEqual([role('ADMIN'), role('DISPATCHER'), role('OFFICE')].sort());
        expect(roomsFor('tech:location')).not.toContain(role('TECHNICIAN'));
        expect(roomsFor('tech:location')).toContain(role('CSR'));
    });

    it('never throws when the recipient lookup fails', async () => {
        const spy = vi.spyOn(fakePrisma.job, 'findFirst').mockRejectedValueOnce(new Error('db down'));
        expect(() => socketService.emitToCompany(C, 'job:checklist_updated', { jobId: 'job_1', isCompleted: true })).not.toThrow();
        socketService.emitToCompany(C, 'job:updated', job);

        await vi.waitFor(() => expect(deliveredTo(user('tech_assigned'), 'job:updated')).toHaveLength(1));
        expect(deliveredTo(user('tech_assigned'), 'job:checklist_updated')).toHaveLength(0);
        // Office still got it synchronously.
        expect(deliveredTo(role('OFFICE'), 'job:checklist_updated')).toHaveLength(1);
        spy.mockRestore();
    });
});
