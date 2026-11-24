// A tiny in-memory Prisma stand-in. It is deliberately minimal: it implements
// just the query surface exercised by the revenue-critical estimate + portal
// flows, with simple `where` matching (scalar equality and `{ in: [...] }`).
//
// It is injected in place of `@fieldio/database`'s real PrismaClient via
// `vi.mock`, so tests never touch a real database or the generated client.

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${(++idCounter).toString(16).padStart(6, '0')}`;

type Row = Record<string, any>;

const matchScalar = (rowVal: any, cond: any): boolean => {
    if (cond === null) return rowVal === null || rowVal === undefined;
    if (cond && typeof cond === 'object' && 'in' in cond) {
        return Array.isArray(cond.in) && cond.in.includes(rowVal);
    }
    if (cond && typeof cond === 'object' && 'not' in cond) {
        return rowVal !== cond.not;
    }
    if (cond && typeof cond === 'object' && 'notIn' in cond) {
        return Array.isArray(cond.notIn) && !cond.notIn.includes(rowVal);
    }
    // Range comparisons over numbers and dates. These must be real: the
    // catch-all below treats an unknown object condition as "matches", so a
    // silently-ignored `lt` would quietly select every row — which is how a
    // date-window query can look like it works while matching everything.
    if (cond && typeof cond === 'object') {
        const RANGE_OPS = ['gt', 'gte', 'lt', 'lte'] as const;
        const ops = RANGE_OPS.filter((op) => op in cond);
        if (ops.length > 0) {
            const asNumber = (v: any) => (v instanceof Date ? v.getTime() : Number(v));
            const left = asNumber(rowVal);
            if (Number.isNaN(left)) return false;
            return ops.every((op) => {
                const right = asNumber(cond[op]);
                if (op === 'gt') return left > right;
                if (op === 'gte') return left >= right;
                if (op === 'lt') return left < right;
                return left <= right;
            });
        }
    }
    // Nested relation filters (e.g. `job: { customerId }`) are not modelled;
    // treat them as satisfied so they don't exclude seeded rows.
    if (cond && typeof cond === 'object') return true;
    return rowVal === cond;
};

const matchWhere = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => matchScalar(row[key], cond));

/**
 * Applies `select` / `include` the way Prisma does, recursively.
 *
 * This matters beyond fidelity: several endpoints exist specifically to keep
 * fields out of a response (password hashes, pay rates, pricing hidden from
 * technicians). If the fake handed back the whole seeded row regardless, those
 * tests would pass without proving anything.
 */
const project = (value: any, spec: any): any => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((v) => project(v, spec));
    if (typeof value !== 'object' || value instanceof Date) return value;

    if (spec?.select) {
        const out: Row = {};
        for (const [key, sub] of Object.entries<any>(spec.select)) {
            if (!sub) continue;
            out[key] = sub === true ? value[key] : project(value[key], sub);
        }
        return out;
    }

    if (spec?.include) {
        const out: Row = { ...value };
        for (const [key, sub] of Object.entries<any>(spec.include)) {
            if (!sub) continue;
            out[key] = sub === true ? value[key] : project(value[key], sub);
        }
        return out;
    }

    return { ...value };
};

const applySelectInclude = (row: Row, args: any = {}) => project(row, args);

class Table {
    rows: Row[] = [];
    // Compound unique keys to enforce on insert (e.g. idempotency's
    // [companyId, userId, key]) so a duplicate create throws a P2002, matching
    // real Prisma — this is what the concurrent-replay path relies on.
    constructor(private prefix: string, private uniqueBy: string[][] = []) {}

    seed(rows: Row[]) {
        for (const r of rows) this.rows.push({ deletedAt: null, ...r });
        return this;
    }

    async findFirst(args: any = {}) {
        const found = this.rows.find((r) => matchWhere(r, args.where));
        return found ? applySelectInclude(found, args) : null;
    }

    async findUnique(args: any = {}) {
        return this.findFirst(args);
    }

    async findMany(args: any = {}) {
        return this.rows.filter((r) => matchWhere(r, args.where)).map((r) => applySelectInclude(r, args));
    }

    async create(args: any) {
        const row: Row = {
            id: args.data.id ?? nextId(this.prefix),
            createdAt: new Date('2026-07-14T00:00:00.000Z'),
            updatedAt: new Date('2026-07-14T00:00:00.000Z'),
            deletedAt: null,
            ...args.data,
        };
        // Enforce registered compound unique keys (no await before the push keeps
        // this atomic for concurrent inserts) so a duplicate throws P2002.
        for (const keys of this.uniqueBy) {
            if (this.rows.some((r) => keys.every((k) => r[k] === row[k]))) {
                const err: any = new Error(`Unique constraint failed on ${this.prefix}`);
                err.code = 'P2002';
                throw err;
            }
        }
        this.rows.push(row);
        return applySelectInclude(row, args);
    }

    async createMany(args: any) {
        const data = Array.isArray(args.data) ? args.data : [args.data];
        for (const d of data) await this.create({ data: d });
        return { count: data.length };
    }

    async update(args: any) {
        const row = this.rows.find((r) => matchWhere(r, args.where));
        if (!row) throw new Error(`Record to update not found in ${this.prefix}`);
        // Atomic numeric mutations (`{ increment }` / `{ decrement }`) are applied
        // numerically; every other field is assigned as-is (Prisma semantics).
        for (const [k, v] of Object.entries<any>(args.data ?? {})) {
            if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'increment' in v) {
                row[k] = Number(row[k] ?? 0) + v.increment;
            } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && 'decrement' in v) {
                row[k] = Number(row[k] ?? 0) - v.decrement;
            } else {
                row[k] = v;
            }
        }
        row.updatedAt = new Date('2026-07-14T00:00:00.000Z');
        return applySelectInclude(row, args);
    }

    // Compound unique keys (`{ a_b: { a, b } }`) are flattened to scalar matches;
    // `{ increment: n }` updates are applied numerically.
    async upsert(args: any) {
        const where: Row = {};
        for (const [k, v] of Object.entries<any>(args.where ?? {})) {
            if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) Object.assign(where, v);
            else where[k] = v;
        }
        const row = this.rows.find((r) => matchWhere(r, where));
        if (!row) return this.create({ ...args, data: { ...where, ...args.create } });
        for (const [k, v] of Object.entries<any>(args.update ?? {})) {
            row[k] = v && typeof v === 'object' && 'increment' in v ? Number(row[k] ?? 0) + v.increment : v;
        }
        return applySelectInclude(row, args);
    }

    async updateMany(args: any) {
        const affected = this.rows.filter((r) => matchWhere(r, args.where));
        for (const row of affected) Object.assign(row, args.data);
        return { count: affected.length };
    }

    async delete(args: any) {
        const idx = this.rows.findIndex((r) => matchWhere(r, args.where));
        if (idx === -1) throw new Error(`Record to delete not found in ${this.prefix}`);
        const [row] = this.rows.splice(idx, 1);
        return applySelectInclude(row, args);
    }

    async deleteMany(args: any = {}) {
        const before = this.rows.length;
        this.rows = this.rows.filter((r) => !matchWhere(r, args.where));
        return { count: before - this.rows.length };
    }

    async count(args: any = {}) {
        return this.rows.filter((r) => matchWhere(r, args.where)).length;
    }

    // Minimal aggregate: supports _count / _sum / _avg over numeric fields,
    // which is all the analytics KPI queries use.
    async aggregate(args: any = {}) {
        const rows = this.rows.filter((r) => matchWhere(r, args.where));
        const result: Row = {};
        if (args._count !== undefined) result._count = rows.length;
        if (args._sum) {
            result._sum = {};
            for (const key of Object.keys(args._sum)) {
                result._sum[key] = rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
            }
        }
        if (args._avg) {
            result._avg = {};
            for (const key of Object.keys(args._avg)) {
                result._avg[key] = rows.length
                    ? rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) / rows.length
                    : null;
            }
        }
        return result;
    }
}

export type FakePrisma = ReturnType<typeof createFakePrisma>;

export function createFakePrisma() {
    const tables: Record<string, Table> = {};
    const table = (name: string, uniqueBy: string[][] = []) =>
        (tables[name] ??= new Table(name, uniqueBy));

    const client: any = {
        estimate: table('estimate'),
        estimateOption: table('estimateOption'),
        job: table('job'),
        jobLineItem: table('jobLineItem'),
        priceBookItem: table('priceBookItem'),
        customer: table('customer'),
        customerNote: table('customerNote'),
        leadSource: table('leadSource', [['companyId', 'name']]),
        company: table('company'),
        customerPortalToken: table('customerPortalToken'),
        property: table('property'),
        invoice: table('invoice'),
        creditNote: table('creditNote', [['companyId', 'number']]),
        customerStatement: table('customerStatement'),
        payment: table('payment'),
        expense: table('expense'),
        notification: table('notification'),
        auditLog: table('auditLog'),
        warrantyClaim: table('warrantyClaim'),
        vanMember: table('vanMember'),
        van: table('van'),
        inventoryItem: table('inventoryItem'),
        inventoryAlert: table('inventoryAlert'),
        vanInventoryTarget: table('vanInventoryTarget'),
        digitalFormTemplate: table('digitalFormTemplate'),
        digitalFormSubmission: table('digitalFormSubmission'),
        jobSignature: table('jobSignature'),
        jobChecklist: table('jobChecklist'),
        jobPhoto: table('jobPhoto'),
        idempotencyKey: table('idempotencyKey', [['companyId', 'userId', 'key']]),
        user: table('user'),
        timeEntry: table('timeEntry'),
        jobTimelineEvent: table('jobTimelineEvent'),
        membership: table('membership'),
        kpiSnapshot: table('kpiSnapshot'),
        financingOption: table('financingOption'),
        financingApplication: table('financingApplication'),
        userLocationPing: table('userLocationPing'),
        // Registered for the RBAC sweep (rbac.sweep.test.ts): empty tables let a
        // guarded office-role read return 200 instead of 500 on a missing model.
        project: table('project'),
        recurringPlan: table('recurringPlan'),
        permit: table('permit'),
        bookingRequest: table('bookingRequest'),
        dunningRule: table('dunningRule'),
        inventoryTransfer: table('inventoryTransfer'),
        documentFile: table('documentFile'),
        techCertification: table('techCertification'),
        branch: table('branch'),
        smsThread: table('smsThread'),
        smsMessage: table('smsMessage'),
        notificationLog: table('notificationLog'),
        jobTemplate: table('jobTemplate'),
        // Raw SQL is not modelled; analytics uses it only for a top-techs
        // leaderboard, so an empty result set is a safe stand-in.
        $queryRaw: async () => [],
        // Transactions just run the callback against the same client.
        $transaction: async (arg: any) => {
            if (typeof arg === 'function') return arg(client);
            return Promise.all(arg);
        },
        // Test-only: wipe all in-memory rows between tests for isolation.
        $reset: () => {
            for (const t of Object.values(tables)) t.rows = [];
            idCounter = 0;
        },
    };
    return client;
}
