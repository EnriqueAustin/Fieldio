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
    if (cond && typeof cond === 'object' && 'gt' in cond && typeof cond.gt === 'number') {
        return Number(rowVal) > cond.gt;
    }
    // Nested relation filters (e.g. `job: { customerId }`) are not modelled;
    // treat them as satisfied so they don't exclude seeded rows.
    if (cond && typeof cond === 'object') return true;
    return rowVal === cond;
};

const matchWhere = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => matchScalar(row[key], cond));

const applySelectInclude = (row: Row) => ({ ...row }); // selects/includes return the row as-is here

class Table {
    rows: Row[] = [];
    constructor(private prefix: string) {}

    seed(rows: Row[]) {
        for (const r of rows) this.rows.push({ deletedAt: null, ...r });
        return this;
    }

    async findFirst(args: any = {}) {
        const found = this.rows.find((r) => matchWhere(r, args.where));
        return found ? applySelectInclude(found) : null;
    }

    async findUnique(args: any = {}) {
        return this.findFirst(args);
    }

    async findMany(args: any = {}) {
        return this.rows.filter((r) => matchWhere(r, args.where)).map(applySelectInclude);
    }

    async create(args: any) {
        const row: Row = {
            id: args.data.id ?? nextId(this.prefix),
            createdAt: new Date('2026-07-14T00:00:00.000Z'),
            updatedAt: new Date('2026-07-14T00:00:00.000Z'),
            deletedAt: null,
            ...args.data,
        };
        this.rows.push(row);
        return applySelectInclude(row);
    }

    async createMany(args: any) {
        const data = Array.isArray(args.data) ? args.data : [args.data];
        for (const d of data) await this.create({ data: d });
        return { count: data.length };
    }

    async update(args: any) {
        const row = this.rows.find((r) => matchWhere(r, args.where));
        if (!row) throw new Error(`Record to update not found in ${this.prefix}`);
        Object.assign(row, args.data, { updatedAt: new Date('2026-07-14T00:00:00.000Z') });
        return applySelectInclude(row);
    }

    async updateMany(args: any) {
        const affected = this.rows.filter((r) => matchWhere(r, args.where));
        for (const row of affected) Object.assign(row, args.data);
        return { count: affected.length };
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
    const table = (name: string) => (tables[name] ??= new Table(name));

    const client: any = {
        estimate: table('estimate'),
        estimateOption: table('estimateOption'),
        job: table('job'),
        jobLineItem: table('jobLineItem'),
        priceBookItem: table('priceBookItem'),
        customer: table('customer'),
        company: table('company'),
        customerPortalToken: table('customerPortalToken'),
        property: table('property'),
        invoice: table('invoice'),
        payment: table('payment'),
        expense: table('expense'),
        notification: table('notification'),
        auditLog: table('auditLog'),
        warrantyClaim: table('warrantyClaim'),
        vanMember: table('vanMember'),
        user: table('user'),
        membership: table('membership'),
        kpiSnapshot: table('kpiSnapshot'),
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
