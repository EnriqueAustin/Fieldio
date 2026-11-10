/**
 * Demo volume seed — layers ~6 months of realistic activity on top of the base
 * seed (prisma/seed.ts) so the app looks like a busy plumbing business.
 *
 * Run after the base seed:  npm run db:seed:demo  (runs both)
 * Deterministic: same random sequence every run. Dates are relative to "now".
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { assertSafeToSeed } from './seed-guard';

// Destructive demo data — same guard as the base seed.
assertSafeToSeed('prisma/seed-demo.ts');

const prisma = new PrismaClient();

// ── Deterministic randomness ──
let seed = 20261103;
function rand(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const uuid = () => crypto.randomUUID();
const money = (n: number) => Math.round(n * 100) / 100;

function dayAt(offsetDays: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

// ── Reference data ──
const FIRST = ['Sipho', 'Lerato', 'Johan', 'Anele', 'Kabelo', 'Nomsa', 'Ruan', 'Chantelle', 'Themba', 'Precious', 'Hendrik', 'Ayesha', 'Mandla', 'Karabo', 'Ilse', 'Tshepo', 'Fatima', 'Riaan', 'Zodwa', 'Sean', 'Nandi', 'Werner', 'Busisiwe', 'Michael', 'Refilwe', 'Marius', 'Thandeka', 'Yusuf', 'Lindiwe', 'Gareth', 'Palesa', 'Andile', 'Elmarie', 'Vusi', 'Kerry', 'Mpho', 'Deon', 'Naledi', 'Craig', 'Kgomotso'];
const LAST = ['Nkosi', 'Botha', 'Dlamini', 'Naidoo', 'van Zyl', 'Mokoena', 'Pillay', 'Steyn', 'Khumalo', 'du Plessis', 'Mahlangu', 'Smith', 'Sithole', 'Venter', 'Govender', 'Molefe', 'Coetzee', 'Ndlovu', 'Pretorius', 'Zulu', 'Jacobs', 'Maseko', 'Fourie', 'Ramaphosa', 'Kruger', 'Mabaso', 'Joubert', 'Moodley', 'Shabalala', 'Nel'];
const EMAIL_DOMAINS = ['gmail.com', 'outlook.com', 'icloud.com', 'yahoo.com', 'webmail.co.za', 'mweb.co.za', 'vodamail.co.za', 'telkomsa.net'];

const BUSINESSES = [
  'Rosebank Dental Studio', 'Parkhurst Bistro', 'Melrose Arch Gym', 'Fourways Vet Clinic', 'Midrand Business Park BC', 'Bryanston Country Club',
  'Hyde Park Pharmacy', 'Illovo Office Towers', 'Northcliff Primary School', 'Waterfall Logistics', 'Kyalami Equestrian Centre', 'Craighall Laundromat',
  'Morningside Medical Suites', 'Rivonia Spar', 'Linden Bakery', 'Menlyn Office Park', 'Hatfield Student Residence', 'Brooklyn Guest House',
  'Centurion Mall Food Court', 'Lynnwood Retirement Village', 'Greenside Coffee Co.', 'Bedfordview Car Wash', 'Edenvale Panel Beaters', 'Randburg Motor Lodge',
];

type Suburb = { name: string; city: string; zip: string; lat: number; lng: number; pta?: boolean };
const SUBURBS: Suburb[] = [
  { name: 'Randburg', city: 'Johannesburg', zip: '2194', lat: -26.0941, lng: 28.0012 },
  { name: 'Fourways', city: 'Johannesburg', zip: '2191', lat: -26.0169, lng: 28.0063 },
  { name: 'Bryanston', city: 'Sandton', zip: '2191', lat: -26.0516, lng: 28.0225 },
  { name: 'Rosebank', city: 'Johannesburg', zip: '2196', lat: -26.1458, lng: 28.0436 },
  { name: 'Parkhurst', city: 'Johannesburg', zip: '2193', lat: -26.1393, lng: 28.0172 },
  { name: 'Northcliff', city: 'Johannesburg', zip: '2195', lat: -26.1450, lng: 27.9733 },
  { name: 'Melville', city: 'Johannesburg', zip: '2092', lat: -26.1756, lng: 28.0090 },
  { name: 'Midrand', city: 'Midrand', zip: '1685', lat: -25.9992, lng: 28.1263 },
  { name: 'Morningside', city: 'Sandton', zip: '2057', lat: -26.0818, lng: 28.0573 },
  { name: 'Rivonia', city: 'Sandton', zip: '2128', lat: -26.0525, lng: 28.0597 },
  { name: 'Bedfordview', city: 'Germiston', zip: '2007', lat: -26.1793, lng: 28.1338 },
  { name: 'Linden', city: 'Johannesburg', zip: '2195', lat: -26.1380, lng: 27.9945 },
  { name: 'Kyalami', city: 'Midrand', zip: '1684', lat: -25.9970, lng: 28.0710 },
  { name: 'Greenside', city: 'Johannesburg', zip: '2193', lat: -26.1470, lng: 28.0130 },
  { name: 'Edenvale', city: 'Edenvale', zip: '1609', lat: -26.1410, lng: 28.1520 },
  { name: 'Menlyn', city: 'Pretoria', zip: '0181', lat: -25.7826, lng: 28.2775, pta: true },
  { name: 'Hatfield', city: 'Pretoria', zip: '0083', lat: -25.7487, lng: 28.2380, pta: true },
  { name: 'Brooklyn', city: 'Pretoria', zip: '0181', lat: -25.7700, lng: 28.2390, pta: true },
  { name: 'Centurion', city: 'Centurion', zip: '0157', lat: -25.8603, lng: 28.1894, pta: true },
  { name: 'Lynnwood', city: 'Pretoria', zip: '0081', lat: -25.7660, lng: 28.2730, pta: true },
];
const STREETS = ['Jan Smuts Ave', 'Oxford Rd', 'Main Rd', 'Bompas Rd', 'Republic Rd', 'Witkoppen Rd', 'William Nicol Dr', 'Beyers Naude Dr', 'Malibongwe Dr', 'Garsfontein Rd', 'Lynnwood Rd', 'Atterbury Rd', 'Pretorius St', 'Rivonia Rd', 'Grayston Dr', 'Louis Botha Ave', '4th Ave', '7th St', 'Acacia Rd', 'Protea Cres', 'Jacaranda St', 'Kiaat Ln'];

type Item = { name: string; quantity: number; unitPrice: number; type: 'SERVICE' | 'MATERIAL' | 'LABOR' };
type Recipe = { title: string; desc: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'; mins: number; weight: number; items: () => Item[]; skill?: string };

const callout = (): Item => ({ name: 'Call-out Fee', quantity: 1, unitPrice: 450, type: 'SERVICE' });
const labour = (h: number): Item => ({ name: 'Labour — Per Hour', quantity: h, unitPrice: 550, type: 'LABOR' });

const RECIPES: Recipe[] = [
  { title: 'Dripping tap', desc: 'Tap dripping when closed — washers / cartridge.', priority: 'LOW', mins: 60, weight: 10,
    items: () => [callout(), { name: 'Tap Washer Replacement', quantity: 1, unitPrice: 350, type: 'SERVICE' }, { name: 'Tap Washer Kit', quantity: int(1, 2), unitPrice: 35, type: 'MATERIAL' }] },
  { title: 'Blocked drain', desc: 'Kitchen/bathroom drain draining slowly or backing up.', priority: 'MEDIUM', mins: 90, weight: 14, skill: 'Blocked Drains',
    items: () => [callout(), { name: 'Drain Unblocking — Standard', quantity: 1, unitPrice: 950, type: 'SERVICE' }] },
  { title: 'Blocked main sewer line', desc: 'Gully overflowing, multiple fixtures affected. Jet + CCTV.', priority: 'HIGH', mins: 180, weight: 5, skill: 'CCTV Drain Inspection',
    items: () => [callout(), { name: 'High-Pressure Drain Jetting', quantity: 1, unitPrice: 2200, type: 'SERVICE' }, { name: 'CCTV Drain Inspection', quantity: 1, unitPrice: 1650, type: 'SERVICE' }] },
  { title: 'Burst geyser', desc: 'Geyser burst — water through ceiling. Isolate and replace.', priority: 'EMERGENCY', mins: 240, weight: 6, skill: 'Geyser Installation',
    items: () => { const big = chance(0.5); return [{ name: 'Emergency Call-out Fee', quantity: 1, unitPrice: 850, type: 'SERVICE' }, { name: big ? 'Geyser Installation — 200L' : 'Geyser Installation — 150L', quantity: 1, unitPrice: big ? 11500 : 8500, type: 'SERVICE' }, { name: big ? 'Kwikot 200L Geyser' : 'Kwikot 150L Geyser', quantity: 1, unitPrice: big ? 6800 : 5400, type: 'MATERIAL' }, { name: 'Pressure Control Valve', quantity: 1, unitPrice: 350, type: 'MATERIAL' }, { name: 'Vacuum Breaker', quantity: 2, unitPrice: 180, type: 'MATERIAL' }]; } },
  { title: 'Geyser element & thermostat', desc: 'No hot water. Test element and thermostat, replace faulty parts.', priority: 'HIGH', mins: 120, weight: 9, skill: 'Geyser Repair',
    items: () => [callout(), { name: 'Geyser Element Replacement', quantity: 1, unitPrice: 1450, type: 'SERVICE' }, { name: 'Geyser Element 3kW', quantity: 1, unitPrice: 320, type: 'MATERIAL' }, ...(chance(0.6) ? [{ name: 'Geyser Thermostat', quantity: 1, unitPrice: 280, type: 'MATERIAL' as const }] : [])] },
  { title: 'Leak detection', desc: 'High water bill / damp wall. Locate hidden leak.', priority: 'MEDIUM', mins: 150, weight: 7, skill: 'Leak Detection',
    items: () => [callout(), { name: 'Leak Detection — Acoustic', quantity: 1, unitPrice: 1850, type: 'SERVICE' }, labour(int(1, 2))] },
  { title: 'Burst pipe repair', desc: 'Pipe burst in wall/garden. Cut out and replace section.', priority: 'EMERGENCY', mins: 150, weight: 7, skill: 'Burst Pipe Repair',
    items: () => [{ name: 'Emergency Call-out Fee', quantity: 1, unitPrice: 850, type: 'SERVICE' }, { name: 'Burst Pipe Repair', quantity: 1, unitPrice: 1800, type: 'SERVICE' }, { name: '15mm Copper Pipe', quantity: int(1, 4), unitPrice: 85, type: 'MATERIAL' }, { name: '15mm Copper Elbows', quantity: int(2, 6), unitPrice: 18, type: 'MATERIAL' }] },
  { title: 'Toilet running / cistern repair', desc: 'Cistern runs constantly or will not fill.', priority: 'MEDIUM', mins: 75, weight: 10,
    items: () => [callout(), { name: 'Toilet Repair — Cistern', quantity: 1, unitPrice: 750, type: 'SERVICE' }, { name: 'Cistern Inlet Valve — Universal', quantity: 1, unitPrice: 120, type: 'MATERIAL' }] },
  { title: 'Toilet installation', desc: 'Remove old toilet and install new close-coupled suite.', priority: 'LOW', mins: 150, weight: 4,
    items: () => [callout(), { name: 'Toilet Installation', quantity: 1, unitPrice: 1800, type: 'SERVICE' }, { name: 'Close-Coupled Toilet Suite', quantity: 1, unitPrice: 2400, type: 'MATERIAL' }] },
  { title: 'Mixer tap installation', desc: 'Supply & fit new kitchen/basin mixer.', priority: 'LOW', mins: 90, weight: 6,
    items: () => [callout(), { name: 'Tap Installation', quantity: 1, unitPrice: 650, type: 'SERVICE' }, { name: 'Basin Mixer Tap', quantity: 1, unitPrice: 650, type: 'MATERIAL' }] },
  { title: 'Grease trap service', desc: 'Scheduled grease trap pump-out and clean.', priority: 'MEDIUM', mins: 150, weight: 4,
    items: () => [{ name: 'Grease Trap Service', quantity: 1, unitPrice: 2400, type: 'SERVICE' }, { name: 'Waste Disposal Levy', quantity: 1, unitPrice: 650, type: 'SERVICE' }] },
  { title: 'Solar geyser service', desc: 'Annual solar geyser check — panels, valves, anode.', priority: 'LOW', mins: 120, weight: 3, skill: 'Solar Geyser',
    items: () => [callout(), { name: 'Solar Geyser Service', quantity: 1, unitPrice: 1950, type: 'SERVICE' }, ...(chance(0.4) ? [{ name: 'Sacrificial Anode', quantity: 1, unitPrice: 420, type: 'MATERIAL' as const }] : [])] },
  { title: 'Gas hob installation', desc: 'Install gas hob & regulator, issue gas CoC.', priority: 'MEDIUM', mins: 180, weight: 3, skill: 'Gas Installation',
    items: () => [callout(), { name: 'Gas Appliance Installation', quantity: 1, unitPrice: 2650, type: 'SERVICE' }, { name: 'Gas Regulator & Hose Kit', quantity: 1, unitPrice: 480, type: 'MATERIAL' }, { name: 'Gas Certificate of Compliance', quantity: 1, unitPrice: 950, type: 'SERVICE' }] },
  { title: 'Plumbing CoC inspection', desc: 'Certificate of Compliance for property transfer.', priority: 'MEDIUM', mins: 120, weight: 5, skill: 'Compliance Certificate (CoC)',
    items: () => [{ name: 'Plumbing CoC Inspection', quantity: 1, unitPrice: 1650, type: 'SERVICE' }, ...(chance(0.5) ? [{ name: 'Vacuum Breaker', quantity: 2, unitPrice: 180, type: 'MATERIAL' as const }, labour(1)] : [])] },
  { title: 'Water pressure problem', desc: 'Low pressure throughout house — check PRV and supply.', priority: 'MEDIUM', mins: 90, weight: 4,
    items: () => [callout(), { name: 'Pressure Reducing Valve', quantity: 1, unitPrice: 890, type: 'MATERIAL' }, labour(1.5)] },
  { title: 'Bathroom renovation — rough-in', desc: 'Re-pipe bathroom ahead of tiling.', priority: 'LOW', mins: 420, weight: 2, skill: 'Bathroom Renovation',
    items: () => [labour(int(6, 8)), { name: '15mm Copper Pipe', quantity: int(8, 14), unitPrice: 85, type: 'MATERIAL' }, { name: '110mm PVC Drain Pipe', quantity: int(4, 8), unitPrice: 120, type: 'MATERIAL' }] },
];
const RECIPE_BAG: Recipe[] = RECIPES.flatMap((r) => Array(r.weight).fill(r));

const NOTE_BODIES: { type: 'NOTE' | 'CALL_INBOUND' | 'CALL_OUTBOUND' | 'EMAIL_SENT' | 'EMAIL_RECEIVED' | 'SMS_SENT' | 'MEETING'; subject?: string; body: string }[] = [
  { type: 'CALL_INBOUND', subject: 'Booking request', body: 'Called to book a follow-up. Prefers mornings before 11.' },
  { type: 'CALL_OUTBOUND', subject: 'Payment follow-up', body: 'Called re outstanding invoice — promised EFT by Friday.' },
  { type: 'EMAIL_SENT', subject: 'Quote sent', body: 'Emailed revised quote with premium geyser option.' },
  { type: 'EMAIL_RECEIVED', subject: 'Thank you', body: 'Customer emailed to thank the tech for leaving the site clean.' },
  { type: 'SMS_SENT', body: 'Reminder SMS sent for tomorrow’s appointment.' },
  { type: 'NOTE', body: 'Dogs on property — ring before entering the yard.' },
  { type: 'NOTE', body: 'Access via side gate. Remote is with the domestic worker.' },
  { type: 'NOTE', body: 'Geyser is 9 years old — recommend replacement next visit.' },
  { type: 'MEETING', subject: 'Site meeting', body: 'Met facilities manager on site to scope annual maintenance contract.' },
  { type: 'CALL_INBOUND', subject: 'Complaint', body: 'Slow drain returned after 3 days. Booked a no-charge callback.' },
  { type: 'NOTE', body: 'Prefers WhatsApp over email for invoices.' },
  { type: 'CALL_OUTBOUND', subject: 'Review request', body: 'Asked for a Google review — happy to leave one.' },
];

async function main() {
  console.log('\n🚀 Demo volume seed — making AquaFlow look busy...');

  const company = await prisma.company.findFirstOrThrow({ where: { name: 'AquaFlow Plumbing Solutions' } });
  const cid = company.id;
  const settings = (company.settings ?? {}) as Record<string, unknown>;
  const [admin, office, csr, sales, dispatcher, sipho, pieter] = await Promise.all(
    ['admin', 'office', 'csr', 'sales', 'dispatch', 'sipho', 'pieter'].map((u) =>
      prisma.user.findFirstOrThrow({ where: { companyId: cid, email: `${u}@aquaflow.co.za` } }),
    ),
  );
  const branches = await prisma.branch.findMany({ where: { companyId: cid } });
  const branchPta = branches.find((b) => /pretoria/i.test(b.name)) ?? null;
  const branchJhb = branches.find((b) => b !== branchPta) ?? null;
  const leadSources = await prisma.leadSource.findMany({ where: { companyId: cid } });

  // ── Two more active technicians so the board looks staffed ──
  const passwordHash = await bcrypt.hash('password123', 10);
  const kagiso = await prisma.user.create({
    data: {
      companyId: cid, email: 'kagiso@aquaflow.co.za', passwordHash, firstName: 'Kagiso', lastName: 'Molefe',
      role: 'TECHNICIAN', status: 'ACTIVE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kagiso',
      skills: ['Blocked Drains', 'Leak Detection', 'Burst Pipe Repair', 'Solar Geyser'], hourlyCost: 190, commissionPct: 4,
    },
  });
  const ruan = await prisma.user.create({
    data: {
      companyId: cid, email: 'ruan@aquaflow.co.za', passwordHash, firstName: 'Ruan', lastName: 'Steyn',
      role: 'TECHNICIAN', status: 'ACTIVE', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ruan',
      skills: ['Geyser Installation', 'Geyser Repair', 'Gas Installation', 'Compliance Certificate (CoC)'],
      permissions: { canIssueCoC: true }, hourlyCost: 210, commissionPct: 5,
    },
  });
  const techs = [sipho, pieter, kagiso, ruan];
  const staff = [admin, office, csr, sales, dispatcher];
  console.log('👷 Added 2 technicians (Kagiso, Ruan)');

  // ── Customers + properties ──
  type Cust = { id: string; name: string; propertyIds: string[]; createdAt: Date; commercial: boolean; pta: boolean };
  const customers: Cust[] = [];
  const customerRows: Prisma.CustomerCreateManyInput[] = [];
  const propertyRows: Prisma.PropertyCreateManyInput[] = [];
  const usedNames = new Set<string>();

  function makeProperty(customerId: string, sub: Suburb, unit?: string): string {
    const id = uuid();
    propertyRows.push({
      id, companyId: cid, customerId,
      addressLine1: `${int(1, 240)} ${pick(STREETS)}`, addressLine2: unit ?? null,
      city: sub.city, state: 'Gauteng', zip: sub.zip,
      geoLat: sub.lat + (rand() - 0.5) * 0.02, geoLng: sub.lng + (rand() - 0.5) * 0.02,
    });
    return id;
  }

  function addCustomer(opts: { commercial: boolean; createdDaysAgo: number; status: 'ACTIVE' | 'LEAD' | 'ARCHIVED'; leadStage?: string }) {
    let name: string; let email: string;
    if (opts.commercial) {
      name = BUSINESSES.find((b) => !usedNames.has(b)) ?? `${pick(LAST)} Holdings`;
      email = `accounts@${name.toLowerCase().replace(/[^a-z]+/g, '')}.co.za`;
    } else {
      do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (usedNames.has(name));
      email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@${pick(EMAIL_DOMAINS)}`;
    }
    usedNames.add(name);
    const sub = pick(SUBURBS);
    const id = uuid();
    const createdAt = dayAt(-opts.createdDaysAgo, int(8, 17), int(0, 59));
    const ls = leadSources.length ? pick(leadSources) : null;
    customerRows.push({
      id, companyId: cid, name, email,
      phone: `+27 ${pick(['82', '83', '84', '72', '73', '76', '79', '81', '11', '12'])} ${int(100, 999)} ${int(1000, 9999)}`,
      status: opts.status, leadStage: (opts.leadStage ?? (opts.status === 'ACTIVE' ? 'WON' : 'NEW')) as any,
      leadSourceId: ls?.id ?? null,
      leadValue: opts.status === 'LEAD' ? int(15, 250) * 100 : null,
      wonAt: opts.status === 'ACTIVE' ? createdAt : null,
      lostAt: opts.leadStage === 'LOST' ? addMin(createdAt, 60 * 24 * int(3, 20)) : null,
      lostReason: opts.leadStage === 'LOST' ? pick(['Went with cheaper quote', 'Did the work themselves', 'No response after quote', 'Out of service area']) : null,
      branchId: (sub.pta ? branchPta?.id : branchJhb?.id) ?? null,
      tags: opts.commercial ? ['commercial', ...(chance(0.4) ? ['contract'] : [])] : chance(0.25) ? ['vip'] : [],
      deletedAt: opts.status === 'ARCHIVED' ? dayAt(-int(1, 30), 10) : null,
      createdAt,
    });
    const propertyIds = [makeProperty(id, sub)];
    if (opts.commercial && chance(0.5)) propertyIds.push(makeProperty(id, pick(SUBURBS), `Building ${pick(['B', 'C', '2'])}`));
    if (!opts.commercial && chance(0.08)) propertyIds.push(makeProperty(id, pick(SUBURBS), 'Rental unit'));
    if (opts.status === 'ACTIVE') customers.push({ id, name, propertyIds, createdAt, commercial: opts.commercial, pta: !!sub.pta });
  }

  // Growth curve: more customers signed recently
  for (let i = 0; i < 18; i++) addCustomer({ commercial: true, createdDaysAgo: int(30, 330), status: 'ACTIVE' });
  for (let i = 0; i < 95; i++) addCustomer({ commercial: false, createdDaysAgo: Math.floor(Math.pow(rand(), 1.4) * 200), status: 'ACTIVE' });
  const leadStages = ['NEW', 'NEW', 'CONTACTED', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'LOST'];
  for (let i = 0; i < 22; i++) addCustomer({ commercial: i < 4, createdDaysAgo: int(0, 40), status: 'LEAD', leadStage: pick(leadStages) });
  for (let i = 0; i < 5; i++) addCustomer({ commercial: false, createdDaysAgo: int(120, 300), status: 'ARCHIVED' });

  await prisma.customer.createMany({ data: customerRows });
  await prisma.property.createMany({ data: propertyRows });
  console.log(`👥 Added ${customerRows.length} customers, ${propertyRows.length} properties`);

  // ── Jobs ──
  const jobRows: Prisma.JobCreateManyInput[] = [];
  const lineRows: Prisma.JobLineItemCreateManyInput[] = [];
  const sigRows: Prisma.JobSignatureCreateManyInput[] = [];
  const timeRows: Prisma.TimeEntryCreateManyInput[] = [];
  const expenseRows: Prisma.ExpenseCreateManyInput[] = [];
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const completed: { jobId: string; end: Date; subtotal: number; items: Item[]; customer: Cust }[] = [];

  const taxRate = Number(settings.taxRate ?? 15);
  const HISTORY_DAYS = 180;

  function pickCustomer(at: Date): Cust {
    const eligible = customers.filter((c) => c.createdAt <= at);
    const pool = eligible.length ? eligible : customers;
    // commercial clients book more often
    return chance(0.3) ? pick(pool.filter((c) => c.commercial).concat(pool.slice(0, 1))) : pick(pool);
  }

  function addJob(opts: { tech: typeof sipho | null; start: Date; status: string; recipe?: Recipe; customer?: Cust }) {
    const recipe = opts.recipe ?? pick(RECIPE_BAG);
    const customer = opts.customer ?? pickCustomer(opts.start);
    const id = uuid();
    const scheduledEnd = addMin(opts.start, recipe.mins);
    const isDone = opts.status === 'COMPLETED';
    const started = ['COMPLETED', 'ON_SITE', 'PAUSED'].includes(opts.status);
    const actualStart = started ? addMin(opts.start, int(-10, 25)) : null;
    const actualEnd = isDone ? addMin(actualStart!, Math.round(recipe.mins * (0.75 + rand() * 0.5))) : null;
    const items = recipe.items();
    jobRows.push({
      id, companyId: cid, customerId: customer.id, propertyId: pick(customer.propertyIds), techId: opts.tech?.id ?? null,
      branchId: (customer.pta ? branchPta?.id : branchJhb?.id) ?? null,
      title: recipe.title, description: recipe.desc, status: opts.status as any, priority: recipe.priority,
      requiredSkills: recipe.skill ? [recipe.skill] : [],
      scheduledStart: opts.start, scheduledEnd, actualStart, actualEnd,
      onMyWaySentAt: opts.status !== 'ASSIGNED' && opts.status !== 'REQUESTED' && opts.status !== 'CANCELED' ? addMin(opts.start, -35) : null,
      reviewRequestSentAt: isDone && chance(0.7) ? addMin(actualEnd!, 120) : null,
      reminder24hSentAt: opts.status !== 'REQUESTED' ? addMin(opts.start, -24 * 60) : null,
      createdAt: addMin(opts.start, -60 * 24 * int(1, 10)),
    });
    for (const it of items) lineRows.push({ id: uuid(), jobId: id, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, total: money(it.quantity * it.unitPrice), type: it.type });
    if (isDone) {
      const subtotal = money(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
      completed.push({ jobId: id, end: actualEnd!, subtotal, items, customer });
      if (chance(0.88)) sigRows.push({ id: uuid(), jobId: id, signerName: customer.commercial ? `${pick(FIRST)} ${pick(LAST)}` : customer.name, signedAt: actualEnd! });
      if (opts.tech) {
        timeRows.push({ companyId: cid, userId: opts.tech.id, jobId: id, type: 'TRAVEL', startTime: addMin(actualStart!, -int(20, 45)), endTime: actualStart!, duration: 0, description: `Drive to ${customer.name}` });
        timeRows.push({ companyId: cid, userId: opts.tech.id, jobId: id, type: 'WRENCH', startTime: actualStart!, endTime: actualEnd!, duration: Math.round((actualEnd!.getTime() - actualStart!.getTime()) / 1000), description: recipe.title });
        const travel = timeRows[timeRows.length - 2];
        travel.duration = Math.round(((travel.endTime as Date).getTime() - (travel.startTime as Date).getTime()) / 1000);
      }
      if (chance(0.22)) {
        const e = pick([
          { d: 'Parking', a: int(30, 120), c: 'TRAVEL' }, { d: 'Fuel top-up', a: int(350, 900), c: 'TRAVEL' },
          { d: 'Fittings from Plumblink', a: int(80, 650), c: 'PARTS_PURCHASE' }, { d: 'Sealant & PTFE tape', a: int(45, 160), c: 'MATERIALS' },
          { d: 'Drill bit replacement', a: int(120, 380), c: 'TOOLS' }, { d: 'Toll fees N1', a: int(25, 90), c: 'TRAVEL' },
        ]);
        expenseRows.push({ companyId: cid, jobId: id, userId: opts.tech?.id ?? null, description: e.d, amount: e.a, category: e.c as any, date: actualEnd! });
      }
    }
    return id;
  }

  // Past: Mon–Sat, workload grows over time (business growing)
  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const date = dayAt(-d, 12);
    const dow = date.getDay();
    if (dow === 0) continue;
    const growth = 0.55 + 0.45 * (1 - d / HISTORY_DAYS);
    for (const tech of techs) {
      if (tech === kagiso && d > 120) continue; // Kagiso joined ~4 months ago
      if (tech === ruan && d > 75) continue;    // Ruan joined ~2.5 months ago
      if (chance(0.06)) continue;               // leave / sick day
      const n = dow === 6 ? int(0, 2) : Math.max(1, Math.round((2 + rand() * 2.2) * growth));
      let hour = 7 + rand();
      for (let k = 0; k < n; k++) {
        const start = dayAt(-d, Math.floor(hour), chance(0.5) ? 0 : 30);
        const status = chance(0.05) ? 'CANCELED' : 'COMPLETED';
        const recipe = pick(RECIPE_BAG);
        addJob({ tech, start, status, recipe });
        hour += recipe.mins / 60 + 0.75;
        if (hour > 16.5) break;
      }
    }
  }

  // Today: a live board — finished, in-progress, en-route, still to come
  const todayPlan: Record<string, string[]> = {
    [sipho.id]: ['COMPLETED', 'ON_SITE', 'ASSIGNED'],
    [pieter.id]: ['COMPLETED', 'EN_ROUTE', 'ASSIGNED', 'ASSIGNED'],
    [kagiso.id]: ['COMPLETED', 'COMPLETED', 'ON_SITE', 'ASSIGNED'],
    [ruan.id]: ['COMPLETED', 'PAUSED', 'ASSIGNED'],
  };
  for (const tech of techs) {
    let hour = 7.5;
    for (const status of todayPlan[tech.id]) {
      const recipe = pick(RECIPES.filter((r) => r.mins <= 180));
      addJob({ tech, start: dayAt(0, Math.floor(hour), hour % 1 ? 30 : 0), status, recipe });
      hour += recipe.mins / 60 + 0.5;
    }
  }
  // Unassigned requests waiting on dispatch
  for (let i = 0; i < 7; i++) addJob({ tech: null, start: dayAt(int(0, 3), int(8, 15)), status: 'REQUESTED', customer: pick(customers) });

  // Next two weeks: booked work (lighter further out)
  for (let d = 1; d <= 14; d++) {
    const date = dayAt(d, 12);
    if (date.getDay() === 0) continue;
    for (const tech of techs) {
      const n = date.getDay() === 6 ? int(0, 1) : Math.max(0, Math.round((3.2 - d * 0.15) * rand() + 0.5));
      let hour = 8;
      for (let k = 0; k < n; k++) {
        const recipe = pick(RECIPE_BAG);
        addJob({ tech, start: dayAt(d, Math.floor(hour), hour % 1 ? 30 : 0), status: 'ASSIGNED', recipe, customer: pick(customers) });
        hour += recipe.mins / 60 + 1;
        if (hour > 16) break;
      }
    }
  }

  // ── Invoices + payments for completed work ──
  const existingCount = await prisma.invoice.count({ where: { companyId: cid } });
  let seq = 100 + existingCount;
  completed.sort((a, b) => a.end.getTime() - b.end.getTime());
  const now = Date.now();
  for (const c of completed) {
    if (chance(0.03)) continue; // a few warranty callbacks never invoiced
    const id = uuid();
    const createdAt = addMin(c.end, int(30, 240));
    const ageDays = (now - createdAt.getTime()) / 86_400_000;
    const dueDate = addMin(createdAt, 60 * 24 * (c.customer.commercial ? 30 : 7));
    const tax = money(c.subtotal * taxRate / 100);
    const total = money(c.subtotal + tax);
    const r = rand();
    let status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'VOID';
    if (ageDays > 45) status = r < 0.93 ? 'PAID' : r < 0.97 ? 'OVERDUE' : 'VOID';
    else if (ageDays > 10) status = r < 0.72 ? 'PAID' : r < 0.82 ? 'PARTIAL' : 'OVERDUE';
    else if (ageDays > 1) status = r < 0.45 ? 'PAID' : r < 0.9 ? 'SENT' : 'PARTIAL';
    else status = r < 0.35 ? 'PAID' : r < 0.7 ? 'SENT' : 'DRAFT';
    if (status === 'OVERDUE' && dueDate.getTime() > now) status = 'SENT';

    let balance = total;
    let paidAt: Date | null = null;
    const method = () => pick(['EFT', 'EFT', 'EFT', 'CARD', 'CARD', 'PAYFAST', 'CASH'] as const);
    if (status === 'PAID') {
      paidAt = new Date(Math.min(now - 3_600_000, createdAt.getTime() + 86_400_000 * rand() * (c.customer.commercial ? 25 : 6)));
      if (paidAt < createdAt) paidAt = addMin(createdAt, 30);
      const m = method();
      paymentRows.push({ companyId: cid, invoiceId: id, amount: total, method: m, status: 'SUCCEEDED', createdAt: paidAt, metadata: m === 'EFT' ? { reference: `INV${seq}` } : m === 'CARD' ? { last4: String(int(1000, 9999)) } : {} });
      balance = 0;
    } else if (status === 'PARTIAL') {
      const part = money(total * pick([0.3, 0.4, 0.5]));
      paymentRows.push({ companyId: cid, invoiceId: id, amount: part, method: method(), status: 'SUCCEEDED', createdAt: addMin(createdAt, 60 * int(1, 72)), metadata: { note: 'Deposit / part payment' } });
      balance = money(total - part);
    } else if (status === 'OVERDUE' && chance(0.3)) {
      paymentRows.push({ companyId: cid, invoiceId: id, amount: total, method: 'EFT', status: 'FAILED', failureReason: 'Insufficient funds', createdAt: addMin(dueDate, 60 * 24), metadata: {} });
    } else if (status === 'VOID') balance = 0;

    invoiceRows.push({
      id, companyId: cid, jobId: c.jobId, invoiceNumber: `INV-${createdAt.getFullYear()}-${String(seq++).padStart(4, '0')}`,
      status, subtotal: c.subtotal, tax, total, balance, taxRate, taxLabel: String(settings.taxLabel ?? 'VAT'),
      taxNumber: (settings.taxNumber as string) ?? null, supplierName: company.name,
      supplierCompanyRegistration: (settings.companyRegistration as string) ?? null,
      items: c.items.map((it) => ({ name: it.name, qty: it.quantity, unitPrice: it.unitPrice, total: money(it.quantity * it.unitPrice) })),
      dueDate, paidAt, publicToken: crypto.randomBytes(24).toString('hex'),
      dunningLevel: status === 'OVERDUE' ? int(1, 3) : 0,
      dunningLastSentAt: status === 'OVERDUE' ? dayAt(-int(1, 7), 9) : null,
      reconciledAt: status === 'PAID' && ageDays > 30 ? addMin(paidAt!, 60 * 24 * 3) : null,
      createdAt,
    });
  }

  // ── Estimates ──
  const estimateRows: Prisma.EstimateCreateManyInput[] = [];
  const leadIds = customerRows.filter((c) => c.status === 'LEAD').map((c) => c.id as string);
  for (let i = 0; i < 95; i++) {
    const ago = Math.floor(Math.pow(rand(), 1.3) * 150);
    const createdAt = dayAt(-ago, int(8, 17), int(0, 59));
    const customerId = ago < 30 && chance(0.4) && leadIds.length ? pick(leadIds) : pickCustomer(createdAt).id;
    const recipe = pick(RECIPES.filter((r) => r.weight <= 7)); // bigger-ticket work gets quoted
    const items = recipe.items().map((it) => ({ name: it.name, qty: it.quantity, unitPrice: it.unitPrice, total: money(it.quantity * it.unitPrice) }));
    const subtotal = items.reduce((s, it) => s + it.total, 0);
    const total = money(subtotal * (1 + taxRate / 100));
    const r = rand();
    let status: 'DRAFT' | 'SENT' | 'APPROVED' | 'DECLINED' | 'EXPIRED';
    if (ago > 30) status = r < 0.55 ? 'APPROVED' : r < 0.75 ? 'DECLINED' : 'EXPIRED';
    else if (ago > 3) status = r < 0.4 ? 'APPROVED' : r < 0.85 ? 'SENT' : 'DECLINED';
    else status = r < 0.5 ? 'DRAFT' : 'SENT';
    const sentAt = status === 'DRAFT' ? null : addMin(createdAt, 45);
    const decidedAt = addMin(createdAt, 60 * 24 * int(1, 9));
    estimateRows.push({
      companyId: cid, customerId, status, items, total,
      depositRequired: total > 8000, depositAmount: total > 8000 ? money(total * 0.5) : null,
      publicToken: crypto.randomBytes(24).toString('hex'), sentAt,
      validUntil: addMin(createdAt, 60 * 24 * 30),
      approvedAt: status === 'APPROVED' ? decidedAt : null,
      signedAt: status === 'APPROVED' ? decidedAt : null,
      signerName: status === 'APPROVED' ? 'Customer' : null,
      declinedAt: status === 'DECLINED' ? decidedAt : null,
      followupCount: status === 'SENT' ? int(0, 2) : 0,
      createdAt,
    });
  }

  // ── Customer timeline notes ──
  const noteRows: Prisma.CustomerNoteCreateManyInput[] = [];
  for (let i = 0; i < 180; i++) {
    const c = pick(customers);
    const n = pick(NOTE_BODIES);
    const ageMax = Math.max(0, Math.floor((now - c.createdAt.getTime()) / 86_400_000));
    noteRows.push({
      companyId: cid, customerId: c.id, userId: pick(staff).id, type: n.type, subject: n.subject ?? null, body: n.body,
      duration: n.type.startsWith('CALL') ? int(60, 600) : null, createdAt: dayAt(-int(0, ageMax), int(8, 17), int(0, 59)),
    });
  }

  // ── Write in dependency order ──
  const chunk = async <T>(rows: T[], fn: (d: T[]) => Promise<unknown>) => { for (let i = 0; i < rows.length; i += 1000) await fn(rows.slice(i, i + 1000)); };
  await chunk(jobRows, (d) => prisma.job.createMany({ data: d }));
  await chunk(lineRows, (d) => prisma.jobLineItem.createMany({ data: d }));
  await chunk(sigRows, (d) => prisma.jobSignature.createMany({ data: d }));
  await chunk(timeRows, (d) => prisma.timeEntry.createMany({ data: d }));
  await chunk(expenseRows, (d) => prisma.expense.createMany({ data: d }));
  await chunk(invoiceRows, (d) => prisma.invoice.createMany({ data: d }));
  await chunk(paymentRows, (d) => prisma.payment.createMany({ data: d }));
  await chunk(estimateRows, (d) => prisma.estimate.createMany({ data: d }));
  await chunk(noteRows, (d) => prisma.customerNote.createMany({ data: d }));

  const revenue = paymentRows.filter((p) => p.status === 'SUCCEEDED').reduce((s, p) => s + Number(p.amount), 0);
  console.log(`🔧 Added ${jobRows.length} jobs (${completed.length} completed), ${lineRows.length} line items`);
  console.log(`🧾 Added ${invoiceRows.length} invoices, ${paymentRows.length} payments (R${Math.round(revenue).toLocaleString('en-ZA')} collected)`);
  console.log(`📋 Added ${estimateRows.length} estimates, ${noteRows.length} customer notes, ${expenseRows.length} expenses, ${timeRows.length} time entries`);
  console.log('\nExtra logins (password123):');
  console.log('  kagiso@aquaflow.co.za       TECHNICIAN');
  console.log('  ruan@aquaflow.co.za         TECHNICIAN (can issue CoC)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
