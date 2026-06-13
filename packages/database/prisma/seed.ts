
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function daysAgo(n: number, hour = 8, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNow(n: number, hour = 8, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function hoursAfter(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function randomToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function main() {
  console.log('🌱 Starting comprehensive seed...');

  // ── Cleanup (order matters for FK constraints) ──
  // V2 expansion leaves (nothing references these) — delete first
  await prisma.kpiSnapshot.deleteMany();
  await prisma.documentFile.deleteMany();
  await prisma.customerStatement.deleteMany();
  await prisma.creditNote.deleteMany();
  await prisma.dunningEvent.deleteMany();
  await prisma.dunningRule.deleteMany();
  await prisma.jobTimelineEvent.deleteMany();
  await prisma.geofenceEvent.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.smsMessage.deleteMany();
  await prisma.smsThread.deleteMany();
  await prisma.inventoryAlert.deleteMany();
  await prisma.vanInventoryTarget.deleteMany();
  await prisma.vanServiceLog.deleteMany();
  await prisma.vanMember.deleteMany();
  await prisma.warrantyClaim.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.techCertification.deleteMany();
  await prisma.markupRule.deleteMany();
  await prisma.flatRateBundle.deleteMany();
  await prisma.financingApplication.deleteMany();
  await prisma.financingOption.deleteMany();
  await prisma.subcontractorAssignment.deleteMany();
  await prisma.subcontractor.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.permit.deleteMany();
  await prisma.campaignSend.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.membershipTier.deleteMany();
  await prisma.inventoryTransfer.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.digitalFormSubmission.deleteMany();
  await prisma.digitalFormTemplate.deleteMany();
  await prisma.estimateOption.deleteMany();
  await prisma.project.deleteMany();
  await prisma.customerPortalToken.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.priceBookItem.deleteMany();
  await prisma.bookingRequest.deleteMany();
  await prisma.recurringPlan.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.jobSignature.deleteMany();
  await prisma.jobPhoto.deleteMany();
  await prisma.jobChecklist.deleteMany();
  await prisma.jobLineItem.deleteMany();
  await prisma.job.deleteMany();
  await prisma.jobTemplate.deleteMany();
  await prisma.propertyAsset.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.van.deleteMany();
  await prisma.userLocationPing.deleteMany();
  await prisma.property.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.xeroConnection.deleteMany();
  await prisma.user.deleteMany();
  await prisma.leadSource.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.company.deleteMany();

  console.log('🧹 Cleaned up old data.');

  const passwordHash = await bcrypt.hash('password123', 10);

  // ════════════════════════════════════════════════════════════════════════════
  // COMPANY
  // ════════════════════════════════════════════════════════════════════════════
  const company = await prisma.company.create({
    data: {
      name: 'AquaFlow Plumbing Solutions',
      settings: {
        currency: 'ZAR',
        timezone: 'Africa/Johannesburg',
        locale: 'en-ZA',
        taxRate: 15,
        taxLabel: 'VAT',
        taxNumber: '4120298765',
        companyRegistration: '2019/456789/07',
        address: '42 Commissioner St, Johannesburg CBD, Gauteng, 2001',
        phone: '+27 11 234 5678',
        email: 'info@aquaflowplumbing.co.za',
        brandColor: '#0066CC',
        modules: {
          scheduling: true,
          inventory: true,
          invoicing: true,
          estimates: true,
          customerPortal: true,
          gpsTracking: true,
          recurring: true,
          bookingWidget: true,
          priceBook: true,
          purchaseOrders: true,
        },
      },
    },
  });

  const cid = company.id;
  console.log(`🏢 Created company: ${company.name}`);

  // ════════════════════════════════════════════════════════════════════════════
  // USERS (6 team members)
  // ════════════════════════════════════════════════════════════════════════════
  const admin = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'admin@aquaflow.co.za',
      passwordHash,
      firstName: 'Thabo',
      lastName: 'Mokoena',
      role: 'ADMIN',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Thabo',
      // Owner/admin can issue Certificates of Compliance
      permissions: { canIssueCoC: true },
    },
  });

  const dispatcher = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'dispatch@aquaflow.co.za',
      passwordHash,
      firstName: 'Naledi',
      lastName: 'Dlamini',
      role: 'DISPATCHER',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Naledi',
    },
  });

  const office = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'office@aquaflow.co.za',
      passwordHash,
      firstName: 'Zanele',
      lastName: 'Nkosi',
      role: 'OFFICE',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zanele',
    },
  });

  const tech1 = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'sipho@aquaflow.co.za',
      passwordHash,
      firstName: 'Sipho',
      lastName: 'Ndaba',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sipho',
      // Senior plumber — qualified to sign off Certificates of Compliance
      skills: ['Geyser Installation', 'Geyser Repair', 'Leak Detection', 'Burst Pipe Repair', 'Compliance Certificate (CoC)'],
      permissions: { canIssueCoC: true },
      hourlyCost: 220,
      commissionPct: 5,
    },
  });

  const tech2 = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'pieter@aquaflow.co.za',
      passwordHash,
      firstName: 'Pieter',
      lastName: 'van der Merwe',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Pieter',
      skills: ['Blocked Drains', 'CCTV Drain Inspection', 'Bathroom Renovation', 'Gas Installation'],
      hourlyCost: 195,
      commissionPct: 4,
    },
  });

  const tech3 = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'bongani@aquaflow.co.za',
      passwordHash,
      firstName: 'Bongani',
      lastName: 'Mthembu',
      role: 'TECHNICIAN',
      status: 'INVITED',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bongani',
      skills: ['Geyser Installation', 'Solar Geyser', 'Backflow Prevention'],
      hourlyCost: 180,
    },
  });

  // ── Customer-facing & back-office roles (each has its own dashboard/nav) ──
  const csr = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'csr@aquaflow.co.za',
      passwordHash,
      firstName: 'Lerato',
      lastName: 'Khumalo',
      role: 'CSR',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lerato',
    },
  });

  const sales = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'sales@aquaflow.co.za',
      passwordHash,
      firstName: 'Johan',
      lastName: 'Botha',
      role: 'SALES',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Johan',
      commissionPct: 7.5,
    },
  });

  const accountant = await prisma.user.create({
    data: {
      companyId: cid,
      email: 'accountant@aquaflow.co.za',
      passwordHash,
      firstName: 'Priya',
      lastName: 'Naidoo',
      role: 'ACCOUNTANT',
      status: 'ACTIVE',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
    },
  });

  console.log('👤 Created 9 users (admin, dispatcher, office, 3 techs, CSR, sales, accountant)');

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOMERS (12 — mix of active, leads, one archived)
  // ════════════════════════════════════════════════════════════════════════════
  const cust1 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Sandton City Mall — Facilities',
      email: 'facilities@sandtoncity.co.za', phone: '+27 11 783 4000',
      notes: 'Large commercial client. Key contact: Mark Gillmore (facilities manager). After-hours access via security desk.',
      status: 'ACTIVE',
    },
  });

  const cust2 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Maria van Wyk',
      email: 'maria.vw@gmail.com', phone: '+27 82 345 6789',
      notes: 'Elderly resident. Prefers morning appointments. Gate code: 4521#',
      status: 'ACTIVE',
    },
  });

  const cust3 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Greenstone Shopping Centre',
      email: 'ops@greenstone.co.za', phone: '+27 11 452 8900',
      notes: 'Monthly maintenance contract. Invoice via Xero. PO required for work over R5,000.',
      status: 'ACTIVE',
    },
  });

  const cust4 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'David Pretorius',
      email: 'david.pretorius@outlook.com', phone: '+27 83 567 8901',
      status: 'ACTIVE',
    },
  });

  const cust5 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Anisha Patel',
      email: 'anisha.p@icloud.com', phone: '+27 84 123 4567',
      notes: 'Referred by David Pretorius.',
      status: 'ACTIVE',
    },
  });

  const cust6 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Braamfontein Body Corporate',
      email: 'admin@braambc.co.za', phone: '+27 11 339 2200',
      notes: 'Body corporate — 48-unit complex. Contact via property manager Linda Fourie.',
      status: 'ACTIVE',
    },
  });

  const cust7 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Thomas Mahlangu',
      email: 'thomas.m@vodamail.co.za', phone: '+27 76 890 1234',
      status: 'ACTIVE',
    },
  });

  const cust8 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Café Botanica',
      email: 'owner@cafebotanica.co.za', phone: '+27 11 447 3300',
      notes: 'Restaurant — work must be done before 10am or after 9pm to avoid disrupting service.',
      status: 'ACTIVE',
    },
  });

  const cust9 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Peter Okonkwo',
      email: 'peter.ok@gmail.com', phone: '+27 72 555 0001',
      status: 'LEAD',
    },
  });

  const cust10 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Sunshine Crèche',
      email: 'info@sunshinecrèche.co.za', phone: '+27 11 678 5432',
      status: 'LEAD',
    },
  });

  const cust11 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Rebecca Moyo',
      email: 'rebecca.m@yahoo.com', phone: '+27 81 222 3333',
      notes: 'Moved out of area. No longer needs service.',
      status: 'ARCHIVED', deletedAt: daysAgo(10),
    },
  });

  const cust12 = await prisma.customer.create({
    data: {
      companyId: cid, name: 'Luthando Estates',
      email: 'maintenance@luthando.co.za', phone: '+27 11 502 7700',
      notes: 'Residential estate. 120 houses. Guard gate entry — technician must provide ID.',
      status: 'ACTIVE',
    },
  });

  console.log('👥 Created 12 customers');

  // ════════════════════════════════════════════════════════════════════════════
  // PROPERTIES (15+)
  // ════════════════════════════════════════════════════════════════════════════
  const prop_sandton = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust1.id,
      addressLine1: '83 Rivonia Road', addressLine2: 'Sandton City Complex',
      city: 'Sandton', state: 'Gauteng', zip: '2196',
      geoLat: -26.1076, geoLng: 28.0567,
    },
  });

  const prop_maria = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust2.id,
      addressLine1: '14 Jacaranda Crescent',
      city: 'Randburg', state: 'Gauteng', zip: '2194',
      geoLat: -26.0936, geoLng: 28.0064,
    },
  });

  const prop_greenstone = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust3.id,
      addressLine1: 'Cnr Modderfontein & Van Riebeeck Ave',
      city: 'Edenvale', state: 'Gauteng', zip: '1609',
      geoLat: -26.1268, geoLng: 28.1454,
    },
  });

  const prop_david = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust4.id,
      addressLine1: '7 Protea Lane', addressLine2: 'Northcliff Ridge Estate',
      city: 'Northcliff', state: 'Gauteng', zip: '2195',
      geoLat: -26.1330, geoLng: 27.9680,
    },
  });

  const prop_anisha = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust5.id,
      addressLine1: '22 Sunbird Close',
      city: 'Fourways', state: 'Gauteng', zip: '2191',
      geoLat: -26.0194, geoLng: 28.0125,
    },
  });

  const prop_braam1 = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust6.id,
      addressLine1: '150 Smit Street', addressLine2: 'Braamfontein Towers Block A',
      city: 'Braamfontein', state: 'Gauteng', zip: '2001',
      geoLat: -26.1920, geoLng: 28.0345,
    },
  });

  const prop_braam2 = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust6.id,
      addressLine1: '152 Smit Street', addressLine2: 'Braamfontein Towers Block B',
      city: 'Braamfontein', state: 'Gauteng', zip: '2001',
      geoLat: -26.1922, geoLng: 28.0347,
    },
  });

  const prop_thomas = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust7.id,
      addressLine1: '38 Magnolia Drive',
      city: 'Centurion', state: 'Gauteng', zip: '0157',
      geoLat: -25.8603, geoLng: 28.1894,
    },
  });

  const prop_cafe = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust8.id,
      addressLine1: '4 Keyes Avenue', addressLine2: 'Shop 3, Rosebank Mall',
      city: 'Rosebank', state: 'Gauteng', zip: '2196',
      geoLat: -26.1460, geoLng: 28.0436,
    },
  });

  const prop_luthando = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust12.id,
      addressLine1: 'Luthando Estate Clubhouse', addressLine2: 'Plot 1, Main Road',
      city: 'Midrand', state: 'Gauteng', zip: '1685',
      geoLat: -25.9883, geoLng: 28.1272,
    },
  });

  const prop_david2 = await prisma.property.create({
    data: {
      companyId: cid, customerId: cust4.id,
      addressLine1: '12 Industrial Rd', addressLine2: 'Unit 5, Kya Sands Business Park',
      city: 'Randburg', state: 'Gauteng', zip: '2163',
      geoLat: -26.0410, geoLng: 27.9530,
    },
  });

  console.log('🏠 Created 11 properties');

  // ════════════════════════════════════════════════════════════════════════════
  // PROPERTY ASSETS (equipment at customer sites)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.propertyAsset.createMany({
    data: [
      {
        companyId: cid, propertyId: prop_sandton.id,
        name: 'Main Water Pump', category: 'Pump', manufacturer: 'Grundfos',
        model: 'CM 5-4', serialNumber: 'GF-2021-88432',
        installedAt: new Date('2021-03-15'), lastServicedAt: daysAgo(45),
        warrantyUntil: new Date('2026-03-15'), status: 'ACTIVE',
      },
      {
        companyId: cid, propertyId: prop_sandton.id,
        name: 'Hot Water Boiler — East Wing', category: 'Geyser', manufacturer: 'Kwikot',
        model: '200L Super', serialNumber: 'KW-200-19934',
        installedAt: new Date('2019-11-20'), lastServicedAt: daysAgo(90),
        warrantyUntil: new Date('2024-11-20'), status: 'NEEDS_SERVICE',
        notes: 'Warranty expired. Showing signs of anode rod degradation.',
      },
      {
        companyId: cid, propertyId: prop_maria.id,
        name: 'Geyser — 150L', category: 'Geyser', manufacturer: 'Franke',
        model: 'Titan 150', serialNumber: 'FR-150-44210',
        installedAt: new Date('2022-06-01'), lastServicedAt: daysAgo(120),
        warrantyUntil: new Date('2027-06-01'), status: 'ACTIVE',
      },
      {
        companyId: cid, propertyId: prop_greenstone.id,
        name: 'Grease Trap — Food Court', category: 'Drainage', manufacturer: 'Eco Traps SA',
        model: 'GT-500', serialNumber: 'ET-500-77281',
        installedAt: new Date('2020-08-10'), lastServicedAt: daysAgo(30),
        status: 'ACTIVE',
        notes: 'Requires monthly cleaning per City of Joburg bylaws.',
      },
      {
        companyId: cid, propertyId: prop_cafe.id,
        name: 'Under-counter Water Heater', category: 'Geyser', manufacturer: 'Ariston',
        model: 'Andris Lux 15L', serialNumber: 'AR-15-99102',
        installedAt: new Date('2023-01-15'), status: 'ACTIVE',
      },
      {
        companyId: cid, propertyId: prop_braam1.id,
        name: 'Communal Pressure Pump', category: 'Pump', manufacturer: 'DAB',
        model: 'E.sybox Mini 3', serialNumber: 'DAB-M3-55410',
        installedAt: new Date('2020-02-28'), lastServicedAt: daysAgo(60),
        status: 'ACTIVE',
      },
    ],
  });

  console.log('🔩 Created 6 property assets');

  // ════════════════════════════════════════════════════════════════════════════
  // PRICE BOOK (service catalog — 20 items)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.priceBookItem.createMany({
    data: [
      { companyId: cid, name: 'Call-out Fee', description: 'Standard site visit / call-out charge', unitPrice: 450, type: 'SERVICE', category: 'General' },
      { companyId: cid, name: 'Emergency Call-out Fee', description: 'After-hours / weekend / holiday call-out', unitPrice: 850, type: 'SERVICE', category: 'General' },
      { companyId: cid, name: 'Leak Detection', description: 'Electronic leak detection per zone', unitPrice: 1200, type: 'SERVICE', category: 'Leak Detection' },
      { companyId: cid, name: 'Burst Pipe Repair', description: 'Cut, replace & join burst section', unitPrice: 1800, type: 'SERVICE', category: 'Repairs' },
      { companyId: cid, name: 'Drain Unblocking — Standard', description: 'Manual rodding / snake up to 15m', unitPrice: 950, type: 'SERVICE', category: 'Drainage' },
      { companyId: cid, name: 'Drain Unblocking — High Pressure Jetting', description: 'HP jetting up to 30m', unitPrice: 2500, type: 'SERVICE', category: 'Drainage' },
      { companyId: cid, name: 'Geyser Installation — 150L', description: 'Supply & install 150L electric geyser incl. valves & drip tray', unitPrice: 8500, type: 'SERVICE', category: 'Geysers' },
      { companyId: cid, name: 'Geyser Installation — 200L', description: 'Supply & install 200L electric geyser incl. valves & drip tray', unitPrice: 11500, type: 'SERVICE', category: 'Geysers' },
      { companyId: cid, name: 'Geyser Element Replacement', description: 'Replace element & thermostat', unitPrice: 1800, type: 'SERVICE', category: 'Geysers' },
      { companyId: cid, name: 'Toilet Repair — Cistern', description: 'Replace flush mechanism / inlet valve', unitPrice: 750, type: 'SERVICE', category: 'Repairs' },
      { companyId: cid, name: 'Toilet Installation', description: 'Supply & install new toilet suite', unitPrice: 3500, type: 'SERVICE', category: 'Installations' },
      { companyId: cid, name: 'Tap Repair / Washer Replacement', description: 'Re-seat or replace tap washers', unitPrice: 350, type: 'SERVICE', category: 'Repairs' },
      { companyId: cid, name: 'Mixer Tap Installation', description: 'Supply & install basin or kitchen mixer', unitPrice: 1800, type: 'SERVICE', category: 'Installations' },
      { companyId: cid, name: 'Grease Trap Cleaning', description: 'Pump out & clean commercial grease trap', unitPrice: 3200, type: 'SERVICE', category: 'Drainage' },
      { companyId: cid, name: 'Labour — Per Hour', description: 'Qualified plumber hourly rate', unitPrice: 550, type: 'LABOR', category: 'Labour' },
      { companyId: cid, name: 'Apprentice Labour — Per Hour', description: 'Apprentice / assistant hourly rate', unitPrice: 280, type: 'LABOR', category: 'Labour' },
      { companyId: cid, name: '15mm Copper Pipe (per metre)', unitPrice: 85, type: 'MATERIAL', category: 'Piping', sku: 'COP-15M' },
      { companyId: cid, name: '22mm Copper Pipe (per metre)', unitPrice: 145, type: 'MATERIAL', category: 'Piping', sku: 'COP-22M' },
      { companyId: cid, name: '110mm PVC Drain Pipe (per metre)', unitPrice: 120, type: 'MATERIAL', category: 'Drainage', sku: 'PVC-110M' },
      { companyId: cid, name: 'PTFE Tape Roll', unitPrice: 25, type: 'MATERIAL', category: 'Consumables', sku: 'PTFE-01' },
    ],
  });

  console.log('📖 Created 20 price book items');

  // ════════════════════════════════════════════════════════════════════════════
  // SUPPLIERS (4)
  // ════════════════════════════════════════════════════════════════════════════
  const supplier1 = await prisma.supplier.create({
    data: {
      companyId: cid, name: 'Builders Warehouse Fourways',
      contactName: 'Johan Erasmus', email: 'trade@builderswarehouse.co.za',
      phone: '+27 11 465 8300', accountNumber: 'BW-TRD-90021',
      notes: 'Trade account — 30-day terms. 10% trade discount on copper fittings.',
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      companyId: cid, name: 'Makro Woodmead',
      contactName: 'Sales Desk', email: 'woodmead@makro.co.za',
      phone: '+27 11 797 1000', accountNumber: 'MAK-55678',
    },
  });

  const supplier3 = await prisma.supplier.create({
    data: {
      companyId: cid, name: 'Plumblink JHB South',
      contactName: 'Thandi Khumalo', email: 'jhbsouth@plumblink.co.za',
      phone: '+27 11 613 4000', accountNumber: 'PL-2024-1120',
      notes: 'Specialist plumbing supplier. Same-day delivery within Gauteng for orders before 10am.',
    },
  });

  const supplier4 = await prisma.supplier.create({
    data: {
      companyId: cid, name: 'Geyser Guys Wholesale',
      contactName: 'Derek Botha', email: 'derek@geyserguyswholesale.co.za',
      phone: '+27 82 300 1000', accountNumber: 'GGW-AF-0044',
      notes: 'Kwikot & Franke authorised distributor. Extended warranty registration on our behalf.',
    },
  });

  console.log('🏭 Created 4 suppliers');

  // ════════════════════════════════════════════════════════════════════════════
  // INVENTORY (van stock + warehouse)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.inventoryItem.createMany({
    data: [
      { companyId: cid, name: '15mm Copper Pipe', sku: 'COP-15M', quantity: 48, minLevel: 20, location: 'WAREHOUSE' },
      { companyId: cid, name: '22mm Copper Pipe', sku: 'COP-22M', quantity: 30, minLevel: 15, location: 'WAREHOUSE' },
      { companyId: cid, name: '110mm PVC Drain Pipe', sku: 'PVC-110M', quantity: 25, minLevel: 10, location: 'WAREHOUSE' },
      { companyId: cid, name: 'PTFE Tape', sku: 'PTFE-01', quantity: 50, minLevel: 20, location: 'WAREHOUSE' },
      { companyId: cid, name: '15mm Copper Elbows (pack of 10)', sku: 'COP-ELB-15', quantity: 12, minLevel: 5, location: 'WAREHOUSE' },
      { companyId: cid, name: '22mm Gate Valve', sku: 'GV-22', quantity: 8, minLevel: 4, location: 'WAREHOUSE' },
      { companyId: cid, name: 'Tap Washer Assortment Kit', sku: 'WSH-KIT', quantity: 15, minLevel: 5, location: 'WAREHOUSE' },
      { companyId: cid, name: 'Cistern Inlet Valve — Universal', sku: 'CIS-INV', quantity: 6, minLevel: 4, location: 'WAREHOUSE' },
      { companyId: cid, name: 'Geyser Element 2kW', sku: 'GEY-EL-2K', quantity: 4, minLevel: 2, location: 'WAREHOUSE' },
      { companyId: cid, name: 'Geyser Thermostat', sku: 'GEY-THERM', quantity: 5, minLevel: 3, location: 'WAREHOUSE' },
      { companyId: cid, name: 'Franke Titan 150L Geyser', sku: 'GEY-FR150', quantity: 2, minLevel: 1, location: 'WAREHOUSE' },
      // Sipho's van
      { companyId: cid, name: '15mm Copper Pipe', sku: 'COP-15M', quantity: 8, minLevel: 3, location: 'VAN', assignedUserId: tech1.id },
      { companyId: cid, name: 'PTFE Tape', sku: 'PTFE-01', quantity: 6, minLevel: 3, location: 'VAN', assignedUserId: tech1.id },
      { companyId: cid, name: 'Tap Washer Assortment Kit', sku: 'WSH-KIT', quantity: 3, minLevel: 1, location: 'VAN', assignedUserId: tech1.id },
      { companyId: cid, name: 'Cistern Inlet Valve — Universal', sku: 'CIS-INV', quantity: 2, minLevel: 1, location: 'VAN', assignedUserId: tech1.id },
      // Pieter's van
      { companyId: cid, name: '15mm Copper Pipe', sku: 'COP-15M', quantity: 6, minLevel: 3, location: 'VAN', assignedUserId: tech2.id },
      { companyId: cid, name: '22mm Copper Pipe', sku: 'COP-22M', quantity: 4, minLevel: 2, location: 'VAN', assignedUserId: tech2.id },
      { companyId: cid, name: 'PTFE Tape', sku: 'PTFE-01', quantity: 4, minLevel: 3, location: 'VAN', assignedUserId: tech2.id },
      { companyId: cid, name: 'Geyser Element 2kW', sku: 'GEY-EL-2K', quantity: 1, minLevel: 1, location: 'VAN', assignedUserId: tech2.id },
      { companyId: cid, name: 'Drain Snake 15m', sku: 'SNK-15M', quantity: 1, minLevel: 1, location: 'VAN', assignedUserId: tech2.id },
    ],
  });

  console.log('📦 Created 20 inventory items (warehouse + 2 vans)');

  // ════════════════════════════════════════════════════════════════════════════
  // JOBS (15 jobs across 5 days of activity)
  // ════════════════════════════════════════════════════════════════════════════

  // ── Day -4: Two completed jobs ──
  const job1 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust2.id, propertyId: prop_maria.id, techId: tech1.id,
      title: 'Dripping kitchen tap', description: 'Kitchen mixer tap dripping from spout when turned off. Customer says it started 2 weeks ago.',
      status: 'COMPLETED', priority: 'MEDIUM',
      scheduledStart: daysAgo(4, 9, 0), scheduledEnd: daysAgo(4, 10, 30),
      actualStart: daysAgo(4, 9, 15), actualEnd: daysAgo(4, 10, 10),
      reviewRequestSentAt: daysAgo(4, 14, 0),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Tap Washer Replacement', quantity: 1, unitPrice: 350, total: 350, type: 'SERVICE' },
          { name: 'Tap Washer Kit', quantity: 1, unitPrice: 35, total: 35, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Isolate water supply', isCompleted: true, completedAt: daysAgo(4, 9, 20) },
          { label: 'Remove tap headgear', isCompleted: true, completedAt: daysAgo(4, 9, 35) },
          { label: 'Replace washers & O-rings', isCompleted: true, completedAt: daysAgo(4, 9, 50) },
          { label: 'Re-seat valve if scored', isCompleted: true, completedAt: daysAgo(4, 9, 55) },
          { label: 'Test — no drips after 5 min', isCompleted: true, completedAt: daysAgo(4, 10, 5) },
        ],
      },
    },
  });

  const job2 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust4.id, propertyId: prop_david.id, techId: tech2.id,
      title: 'Blocked shower drain', description: 'Master bathroom shower draining very slowly. Tried drain cleaner with no result.',
      status: 'COMPLETED', priority: 'MEDIUM',
      scheduledStart: daysAgo(4, 11, 0), scheduledEnd: daysAgo(4, 13, 0),
      actualStart: daysAgo(4, 11, 10), actualEnd: daysAgo(4, 12, 30),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Drain Unblocking — Standard', quantity: 1, unitPrice: 950, total: 950, type: 'SERVICE' },
        ],
      },
      checklist: {
        create: [
          { label: 'Inspect drain cover & trap', isCompleted: true, completedAt: daysAgo(4, 11, 20) },
          { label: 'Rod drain to clear blockage', isCompleted: true, completedAt: daysAgo(4, 12, 0) },
          { label: 'CCTV inspection if required', isCompleted: false },
          { label: 'Test drainage flow', isCompleted: true, completedAt: daysAgo(4, 12, 20) },
        ],
      },
    },
  });

  // ── Day -3: Three jobs (one completed, one completed, one cancelled) ──
  const job3 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust1.id, propertyId: prop_sandton.id, techId: tech1.id,
      title: 'Restroom leak — Level 2 Food Court', description: 'Water pooling under basin vanity in mens restroom. Possible supply line leak.',
      status: 'COMPLETED', priority: 'HIGH',
      scheduledStart: daysAgo(3, 7, 0), scheduledEnd: daysAgo(3, 10, 0),
      actualStart: daysAgo(3, 7, 15), actualEnd: daysAgo(3, 9, 45),
      lineItems: {
        create: [
          { name: 'Emergency Call-out Fee', quantity: 1, unitPrice: 850, total: 850, type: 'SERVICE' },
          { name: 'Burst Pipe Repair', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
          { name: '15mm Copper Pipe', description: '2.5m section replaced', quantity: 2.5, unitPrice: 85, total: 212.50, type: 'MATERIAL' },
          { name: '15mm Copper Elbows', quantity: 4, unitPrice: 18, total: 72, type: 'MATERIAL' },
          { name: 'Labour — Per Hour', description: '2.5 hrs additional', quantity: 2.5, unitPrice: 550, total: 1375, type: 'LABOR' },
        ],
      },
      checklist: {
        create: [
          { label: 'Isolate water to affected zone', isCompleted: true, completedAt: daysAgo(3, 7, 25) },
          { label: 'Locate leak source', isCompleted: true, completedAt: daysAgo(3, 7, 40) },
          { label: 'Cut out damaged section', isCompleted: true, completedAt: daysAgo(3, 8, 10) },
          { label: 'Solder new pipe section', isCompleted: true, completedAt: daysAgo(3, 8, 50) },
          { label: 'Pressure test', isCompleted: true, completedAt: daysAgo(3, 9, 15) },
          { label: 'Clean up & restore water', isCompleted: true, completedAt: daysAgo(3, 9, 40) },
        ],
      },
    },
  });

  const job4 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust6.id, propertyId: prop_braam1.id, techId: tech2.id,
      title: 'Toilet running constantly — Unit 14', description: 'Toilet cistern fills and runs non-stop. Likely faulty inlet valve or flapper.',
      status: 'COMPLETED', priority: 'MEDIUM',
      scheduledStart: daysAgo(3, 10, 0), scheduledEnd: daysAgo(3, 11, 30),
      actualStart: daysAgo(3, 10, 5), actualEnd: daysAgo(3, 11, 15),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Toilet Repair — Cistern', quantity: 1, unitPrice: 750, total: 750, type: 'SERVICE' },
          { name: 'Cistern Inlet Valve — Universal', quantity: 1, unitPrice: 120, total: 120, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Diagnose — inlet valve or flapper', isCompleted: true, completedAt: daysAgo(3, 10, 15) },
          { label: 'Replace faulty component', isCompleted: true, completedAt: daysAgo(3, 10, 50) },
          { label: 'Adjust float level', isCompleted: true, completedAt: daysAgo(3, 11, 0) },
          { label: 'Test 3 flush cycles', isCompleted: true, completedAt: daysAgo(3, 11, 10) },
        ],
      },
    },
  });

  const job5 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust7.id, propertyId: prop_thomas.id, techId: tech1.id,
      title: 'Install outdoor tap', description: 'Customer wants a new garden tap installed on north-facing wall near driveway.',
      status: 'CANCELED', priority: 'LOW',
      scheduledStart: daysAgo(3, 14, 0), scheduledEnd: daysAgo(3, 16, 0),
    },
  });

  // ── Day -2: Three jobs ──
  const job6 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust3.id, propertyId: prop_greenstone.id, techId: tech2.id,
      title: 'Monthly grease trap service', description: 'Scheduled monthly grease trap cleaning for food court. Part of maintenance contract.',
      status: 'COMPLETED', priority: 'MEDIUM',
      scheduledStart: daysAgo(2, 6, 0), scheduledEnd: daysAgo(2, 9, 0),
      actualStart: daysAgo(2, 6, 10), actualEnd: daysAgo(2, 8, 45),
      lineItems: {
        create: [
          { name: 'Grease Trap Cleaning', quantity: 1, unitPrice: 3200, total: 3200, type: 'SERVICE' },
          { name: 'Labour — Per Hour', description: 'Additional time for deep clean', quantity: 1, unitPrice: 550, total: 550, type: 'LABOR' },
        ],
      },
      checklist: {
        create: [
          { label: 'Pump out grease trap', isCompleted: true, completedAt: daysAgo(2, 6, 45) },
          { label: 'Scrape & clean baffles', isCompleted: true, completedAt: daysAgo(2, 7, 30) },
          { label: 'Check inlet/outlet pipes', isCompleted: true, completedAt: daysAgo(2, 7, 50) },
          { label: 'Flush with clean water', isCompleted: true, completedAt: daysAgo(2, 8, 10) },
          { label: 'Record grease volume for compliance log', isCompleted: true, completedAt: daysAgo(2, 8, 30) },
        ],
      },
    },
  });

  const job7 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust5.id, propertyId: prop_anisha.id, techId: tech1.id,
      title: 'No hot water — geyser fault', description: 'No hot water since yesterday morning. Geyser making clicking sound but not heating.',
      status: 'COMPLETED', priority: 'HIGH',
      scheduledStart: daysAgo(2, 10, 0), scheduledEnd: daysAgo(2, 13, 0),
      actualStart: daysAgo(2, 10, 20), actualEnd: daysAgo(2, 12, 30),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Geyser Element Replacement', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
          { name: 'Geyser Element 2kW', quantity: 1, unitPrice: 320, total: 320, type: 'MATERIAL' },
          { name: 'Geyser Thermostat', quantity: 1, unitPrice: 180, total: 180, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Isolate electrical supply to geyser', isCompleted: true, completedAt: daysAgo(2, 10, 30) },
          { label: 'Test element with multimeter', isCompleted: true, completedAt: daysAgo(2, 10, 40) },
          { label: 'Drain geyser', isCompleted: true, completedAt: daysAgo(2, 11, 10) },
          { label: 'Replace element & thermostat', isCompleted: true, completedAt: daysAgo(2, 11, 50) },
          { label: 'Refill & bleed air', isCompleted: true, completedAt: daysAgo(2, 12, 10) },
          { label: 'Test hot water at taps', isCompleted: true, completedAt: daysAgo(2, 12, 25) },
        ],
      },
    },
  });

  const job8 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust8.id, propertyId: prop_cafe.id, techId: tech2.id,
      title: 'Dishwasher water supply connection', description: 'Connect new commercial dishwasher to existing plumbing. Dishwasher already on site.',
      status: 'COMPLETED', priority: 'MEDIUM',
      scheduledStart: daysAgo(2, 19, 0), scheduledEnd: daysAgo(2, 21, 0),
      actualStart: daysAgo(2, 19, 10), actualEnd: daysAgo(2, 20, 45),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Labour — Per Hour', quantity: 1.5, unitPrice: 550, total: 825, type: 'LABOR' },
          { name: '15mm Copper Pipe', quantity: 3, unitPrice: 85, total: 255, type: 'MATERIAL' },
          { name: '22mm Gate Valve', quantity: 1, unitPrice: 95, total: 95, type: 'MATERIAL' },
          { name: 'PTFE Tape', quantity: 1, unitPrice: 25, total: 25, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Locate nearest supply & waste points', isCompleted: true, completedAt: daysAgo(2, 19, 25) },
          { label: 'Install isolation valve', isCompleted: true, completedAt: daysAgo(2, 19, 50) },
          { label: 'Run supply line to dishwasher', isCompleted: true, completedAt: daysAgo(2, 20, 15) },
          { label: 'Connect waste to drain', isCompleted: true, completedAt: daysAgo(2, 20, 30) },
          { label: 'Test — run full cycle', isCompleted: true, completedAt: daysAgo(2, 20, 40) },
        ],
      },
    },
  });

  // ── Day -1: (Yesterday) — Three jobs ──
  const job9 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust12.id, propertyId: prop_luthando.id, techId: tech1.id,
      title: 'Irrigation system leak — Common area', description: 'Estate manager reports wet patch on lawn near clubhouse. Possible underground irrigation leak.',
      status: 'COMPLETED', priority: 'MEDIUM',
      scheduledStart: daysAgo(1, 8, 0), scheduledEnd: daysAgo(1, 12, 0),
      actualStart: daysAgo(1, 8, 20), actualEnd: daysAgo(1, 11, 30),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Leak Detection', quantity: 1, unitPrice: 1200, total: 1200, type: 'SERVICE' },
          { name: 'Burst Pipe Repair', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
          { name: '22mm Copper Pipe', quantity: 4, unitPrice: 145, total: 580, type: 'MATERIAL' },
          { name: 'Labour — Per Hour', quantity: 2, unitPrice: 550, total: 1100, type: 'LABOR' },
        ],
      },
      checklist: {
        create: [
          { label: 'Walk site to identify affected area', isCompleted: true, completedAt: daysAgo(1, 8, 35) },
          { label: 'Electronic leak detection', isCompleted: true, completedAt: daysAgo(1, 9, 15) },
          { label: 'Excavate to expose pipe', isCompleted: true, completedAt: daysAgo(1, 9, 50) },
          { label: 'Repair / replace damaged section', isCompleted: true, completedAt: daysAgo(1, 10, 45) },
          { label: 'Pressure test system', isCompleted: true, completedAt: daysAgo(1, 11, 10) },
          { label: 'Backfill & restore area', isCompleted: true, completedAt: daysAgo(1, 11, 25) },
        ],
      },
    },
  });

  const job10 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust6.id, propertyId: prop_braam2.id, techId: tech2.id,
      title: 'Low water pressure — Block B', description: 'Multiple units in Block B reporting very low water pressure. Possible pump issue.',
      status: 'COMPLETED', priority: 'HIGH',
      scheduledStart: daysAgo(1, 8, 0), scheduledEnd: daysAgo(1, 11, 0),
      actualStart: daysAgo(1, 8, 5), actualEnd: daysAgo(1, 10, 30),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Labour — Per Hour', description: 'Diagnosis & repair', quantity: 2, unitPrice: 550, total: 1100, type: 'LABOR' },
          { name: 'Pressure Switch', quantity: 1, unitPrice: 450, total: 450, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Check pressure at pump outlet', isCompleted: true, completedAt: daysAgo(1, 8, 20) },
          { label: 'Inspect pressure switch & settings', isCompleted: true, completedAt: daysAgo(1, 8, 40) },
          { label: 'Replace pressure switch', isCompleted: true, completedAt: daysAgo(1, 9, 30) },
          { label: 'Calibrate cut-in / cut-out pressures', isCompleted: true, completedAt: daysAgo(1, 9, 50) },
          { label: 'Test pressure at multiple units', isCompleted: true, completedAt: daysAgo(1, 10, 20) },
        ],
      },
    },
  });

  const job11 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust4.id, propertyId: prop_david2.id, techId: tech1.id,
      title: 'Bathroom renovation — rough-in plumbing', description: 'New bathroom in warehouse office conversion. First fix: waste & water points for basin, toilet, shower.',
      status: 'ON_SITE', priority: 'MEDIUM',
      scheduledStart: daysAgo(1, 13, 0), scheduledEnd: daysAgo(0, 17, 0),
      actualStart: daysAgo(1, 13, 15),
      lineItems: {
        create: [
          { name: 'Labour — Per Hour', description: 'Estimated 10 hours over 2 days', quantity: 10, unitPrice: 550, total: 5500, type: 'LABOR' },
          { name: 'Apprentice Labour — Per Hour', quantity: 10, unitPrice: 280, total: 2800, type: 'LABOR' },
          { name: '110mm PVC Drain Pipe', quantity: 8, unitPrice: 120, total: 960, type: 'MATERIAL' },
          { name: '15mm Copper Pipe', quantity: 12, unitPrice: 85, total: 1020, type: 'MATERIAL' },
          { name: '22mm Copper Pipe', quantity: 6, unitPrice: 145, total: 870, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Mark out positions per plan', isCompleted: true, completedAt: daysAgo(1, 13, 30) },
          { label: 'Break floor for waste runs', isCompleted: true, completedAt: daysAgo(1, 15, 0) },
          { label: 'Lay 110mm waste to sewer connection', isCompleted: true, completedAt: daysAgo(1, 16, 30) },
          { label: 'Run hot & cold supply lines', isCompleted: false },
          { label: 'Install isolation valves at each point', isCompleted: false },
          { label: 'Pressure test all lines', isCompleted: false },
          { label: 'Cap off for tiling phase', isCompleted: false },
        ],
      },
    },
  });

  // ── Today: Active jobs ──
  const job12 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust1.id, propertyId: prop_sandton.id, techId: tech2.id,
      title: 'Replace geyser — East Wing', description: 'Follow-up from previous inspection. Old 200L Kwikot geyser needs full replacement. Anode rod shot, signs of internal corrosion.',
      status: 'EN_ROUTE', priority: 'HIGH',
      scheduledStart: daysAgo(0, 8, 0), scheduledEnd: daysAgo(0, 14, 0),
      lineItems: {
        create: [
          { name: 'Geyser Installation — 200L', quantity: 1, unitPrice: 11500, total: 11500, type: 'SERVICE' },
          { name: 'Labour — Per Hour', description: 'Estimated 4 hrs', quantity: 4, unitPrice: 550, total: 2200, type: 'LABOR' },
          { name: 'Kwikot 200L Geyser', quantity: 1, unitPrice: 6800, total: 6800, type: 'MATERIAL' },
          { name: 'Pressure Control Valve', quantity: 1, unitPrice: 350, total: 350, type: 'MATERIAL' },
          { name: 'Vacuum Breaker', quantity: 1, unitPrice: 180, total: 180, type: 'MATERIAL' },
        ],
      },
      checklist: {
        create: [
          { label: 'Isolate water & electrical', isCompleted: false },
          { label: 'Drain old geyser', isCompleted: false },
          { label: 'Remove old unit', isCompleted: false },
          { label: 'Install drip tray & new geyser', isCompleted: false },
          { label: 'Connect plumbing — T&P valve, vacuum breaker', isCompleted: false },
          { label: 'Connect electrical', isCompleted: false },
          { label: 'Fill, bleed & test', isCompleted: false },
          { label: 'Issue CoC if required', isCompleted: false },
        ],
      },
    },
  });

  const job13 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust2.id, propertyId: prop_maria.id, techId: tech1.id,
      title: 'Leaking toilet — guest bathroom', description: 'Water seeping from base of toilet onto floor tiles.',
      status: 'ASSIGNED', priority: 'MEDIUM',
      scheduledStart: daysAgo(0, 14, 0), scheduledEnd: daysAgo(0, 15, 30),
      lineItems: {
        create: [
          { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
          { name: 'Toilet Repair — Cistern', quantity: 1, unitPrice: 750, total: 750, type: 'SERVICE' },
        ],
      },
      checklist: {
        create: [
          { label: 'Identify leak source (base seal or cistern)', isCompleted: false },
          { label: 'Replace wax ring / pan connector if needed', isCompleted: false },
          { label: 'Check cistern for cracks', isCompleted: false },
          { label: 'Test flush & inspect for leaks', isCompleted: false },
        ],
      },
    },
  });

  // ── Tomorrow & future: Scheduled jobs ──
  const job14 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust8.id, propertyId: prop_cafe.id, techId: tech2.id,
      title: 'Install mixer tap — kitchen prep area', description: 'New commercial mixer tap for prep station. Customer supplying the tap.',
      status: 'ASSIGNED', priority: 'LOW',
      scheduledStart: daysFromNow(1, 19, 0), scheduledEnd: daysFromNow(1, 20, 30),
      lineItems: {
        create: [
          { name: 'Mixer Tap Installation', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
          { name: 'PTFE Tape', quantity: 1, unitPrice: 25, total: 25, type: 'MATERIAL' },
        ],
      },
    },
  });

  const job15 = await prisma.job.create({
    data: {
      companyId: cid, customerId: cust12.id, propertyId: prop_luthando.id, techId: tech1.id,
      title: 'Geyser inspections — Houses 1-10', description: 'Annual geyser safety inspections for first 10 houses in estate. Part of maintenance contract.',
      status: 'REQUESTED', priority: 'LOW',
      scheduledStart: daysFromNow(3, 8, 0), scheduledEnd: daysFromNow(3, 17, 0),
    },
  });

  console.log('🔧 Created 15 jobs across 5 days');

  // Required skills per job — drives dispatch skill-matching ("suggest a tech")
  await Promise.all([
    prisma.job.update({ where: { id: job1.id }, data: { requiredSkills: ['Leak Detection'] } }),
    prisma.job.update({ where: { id: job2.id }, data: { requiredSkills: ['Blocked Drains'] } }),
    prisma.job.update({ where: { id: job3.id }, data: { requiredSkills: ['Leak Detection', 'Burst Pipe Repair'] } }),
    prisma.job.update({ where: { id: job6.id }, data: { requiredSkills: ['Blocked Drains', 'CCTV Drain Inspection'] } }),
    prisma.job.update({ where: { id: job7.id }, data: { requiredSkills: ['Geyser Repair'] } }),
    prisma.job.update({ where: { id: job9.id }, data: { requiredSkills: ['Leak Detection'] } }),
    prisma.job.update({ where: { id: job11.id }, data: { requiredSkills: ['Bathroom Renovation', 'Gas Installation'] } }),
    prisma.job.update({ where: { id: job12.id }, data: { requiredSkills: ['Geyser Installation', 'Compliance Certificate (CoC)'] } }),
    prisma.job.update({ where: { id: job15.id }, data: { requiredSkills: ['Geyser Installation', 'Compliance Certificate (CoC)'] } }),
  ]);

  console.log('🎯 Set required skills on 9 jobs');

  // ════════════════════════════════════════════════════════════════════════════
  // ESTIMATES (4)
  // ════════════════════════════════════════════════════════════════════════════
  const est1 = await prisma.estimate.create({
    data: {
      companyId: cid, customerId: cust1.id, jobId: job12.id,
      status: 'APPROVED', total: 21030,
      approvedAt: daysAgo(2, 15, 0),
      signerName: 'Mark Gillmore',
      signedAt: daysAgo(2, 15, 0),
      items: [
        { name: 'Geyser Installation — 200L', qty: 1, unitPrice: 11500, total: 11500 },
        { name: 'Labour — Per Hour (est. 4 hrs)', qty: 4, unitPrice: 550, total: 2200 },
        { name: 'Kwikot 200L Geyser', qty: 1, unitPrice: 6800, total: 6800 },
        { name: 'Pressure Control Valve', qty: 1, unitPrice: 350, total: 350 },
        { name: 'Vacuum Breaker', qty: 1, unitPrice: 180, total: 180 },
      ],
      validUntil: daysFromNow(28),
      createdAt: daysAgo(3, 14, 0),
    },
  });

  await prisma.estimate.create({
    data: {
      companyId: cid, customerId: cust4.id, jobId: job11.id,
      status: 'APPROVED', total: 11150,
      approvedAt: daysAgo(5, 10, 0),
      signerName: 'David Pretorius',
      signedAt: daysAgo(5, 10, 0),
      items: [
        { name: 'Labour — Qualified Plumber (10 hrs)', qty: 10, unitPrice: 550, total: 5500 },
        { name: 'Labour — Apprentice (10 hrs)', qty: 10, unitPrice: 280, total: 2800 },
        { name: '110mm PVC Drain Pipe (8m)', qty: 8, unitPrice: 120, total: 960 },
        { name: '15mm Copper Pipe (12m)', qty: 12, unitPrice: 85, total: 1020 },
        { name: '22mm Copper Pipe (6m)', qty: 6, unitPrice: 145, total: 870 },
      ],
      validUntil: daysFromNow(14),
      createdAt: daysAgo(7),
    },
  });

  const est2 = await prisma.estimate.create({
    data: {
      companyId: cid, customerId: cust9.id,
      status: 'SENT', total: 9450,
      items: [
        { name: 'Geyser Installation — 150L', qty: 1, unitPrice: 8500, total: 8500 },
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Geyser Mounting Brackets', qty: 1, unitPrice: 500, total: 500 },
      ],
      validUntil: daysFromNow(14),
      createdAt: daysAgo(1, 16, 0),
    },
  });

  await prisma.estimate.create({
    data: {
      companyId: cid, customerId: cust10.id,
      status: 'DRAFT', total: 4700,
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Toilet Installation (x2)', qty: 2, unitPrice: 1800, total: 3600 },
        { name: 'Basin Mixer Tap', qty: 1, unitPrice: 650, total: 650 },
      ],
      createdAt: daysAgo(0, 10, 0),
    },
  });

  console.log('📋 Created 4 estimates');

  // ════════════════════════════════════════════════════════════════════════════
  // INVOICES (8 — various statuses)
  // ════════════════════════════════════════════════════════════════════════════
  const inv1 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job1.id,
      invoiceNumber: 'INV-2026-001',
      status: 'PAID', subtotal: 835, tax: 125.25, total: 960.25, balance: 0,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Tap Washer Replacement', qty: 1, unitPrice: 350, total: 350 },
        { name: 'Tap Washer Kit', qty: 1, unitPrice: 35, total: 35 },
      ],
      dueDate: daysAgo(0),
      publicToken: randomToken(),
      paidAt: daysAgo(3, 10, 0),
      createdAt: daysAgo(4, 11, 0),
    },
  });

  const inv2 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job2.id,
      invoiceNumber: 'INV-2026-002',
      status: 'PAID', subtotal: 1400, tax: 210, total: 1610, balance: 0,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Drain Unblocking — Standard', qty: 1, unitPrice: 950, total: 950 },
      ],
      dueDate: daysAgo(0),
      publicToken: randomToken(),
      paidAt: daysAgo(2, 9, 0),
      createdAt: daysAgo(4, 13, 0),
    },
  });

  const inv3 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job3.id,
      invoiceNumber: 'INV-2026-003',
      status: 'SENT', subtotal: 4309.50, tax: 646.43, total: 4955.93, balance: 4955.93,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Emergency Call-out Fee', qty: 1, unitPrice: 850, total: 850 },
        { name: 'Burst Pipe Repair', qty: 1, unitPrice: 1800, total: 1800 },
        { name: '15mm Copper Pipe (2.5m)', qty: 2.5, unitPrice: 85, total: 212.50 },
        { name: '15mm Copper Elbows (x4)', qty: 4, unitPrice: 18, total: 72 },
        { name: 'Labour — 2.5 hrs', qty: 2.5, unitPrice: 550, total: 1375 },
      ],
      dueDate: daysFromNow(7),
      publicToken: randomToken(),
      createdAt: daysAgo(3, 10, 0),
    },
  });

  const inv4 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job4.id,
      invoiceNumber: 'INV-2026-004',
      status: 'PAID', subtotal: 1320, tax: 198, total: 1518, balance: 0,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Toilet Repair — Cistern', qty: 1, unitPrice: 750, total: 750 },
        { name: 'Cistern Inlet Valve', qty: 1, unitPrice: 120, total: 120 },
      ],
      dueDate: daysAgo(0),
      publicToken: randomToken(),
      paidAt: daysAgo(2, 14, 0),
      createdAt: daysAgo(3, 12, 0),
    },
  });

  const inv5 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job6.id,
      invoiceNumber: 'INV-2026-005',
      status: 'SENT', subtotal: 3750, tax: 562.50, total: 4312.50, balance: 4312.50,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Grease Trap Cleaning', qty: 1, unitPrice: 3200, total: 3200 },
        { name: 'Labour — Additional 1 hr', qty: 1, unitPrice: 550, total: 550 },
      ],
      dueDate: daysFromNow(14),
      publicToken: randomToken(),
      paymentReference: 'PO-GS-2026-0145',
      createdAt: daysAgo(2, 9, 0),
    },
  });

  const inv6 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job7.id,
      invoiceNumber: 'INV-2026-006',
      status: 'PARTIAL', subtotal: 2750, tax: 412.50, total: 3162.50, balance: 1162.50,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Geyser Element Replacement', qty: 1, unitPrice: 1800, total: 1800 },
        { name: 'Geyser Element 2kW', qty: 1, unitPrice: 320, total: 320 },
        { name: 'Geyser Thermostat', qty: 1, unitPrice: 180, total: 180 },
      ],
      dueDate: daysFromNow(7),
      publicToken: randomToken(),
      createdAt: daysAgo(2, 13, 0),
    },
  });

  const inv7 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job9.id,
      invoiceNumber: 'INV-2026-007',
      status: 'DRAFT', subtotal: 5130, tax: 769.50, total: 5899.50, balance: 5899.50,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Leak Detection', qty: 1, unitPrice: 1200, total: 1200 },
        { name: 'Burst Pipe Repair', qty: 1, unitPrice: 1800, total: 1800 },
        { name: '22mm Copper Pipe (4m)', qty: 4, unitPrice: 145, total: 580 },
        { name: 'Labour — 2 hrs', qty: 2, unitPrice: 550, total: 1100 },
      ],
      createdAt: daysAgo(1, 12, 0),
    },
  });

  const inv8 = await prisma.invoice.create({
    data: {
      companyId: cid, jobId: job10.id,
      invoiceNumber: 'INV-2026-008',
      status: 'OVERDUE', subtotal: 2000, tax: 300, total: 2300, balance: 2300,
      taxRate: 15, taxLabel: 'VAT', taxNumber: '4120298765',
      supplierName: 'AquaFlow Plumbing Solutions', supplierCompanyRegistration: '2019/456789/07',
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Labour — 2 hrs', qty: 2, unitPrice: 550, total: 1100 },
        { name: 'Pressure Switch', qty: 1, unitPrice: 450, total: 450 },
      ],
      dueDate: daysAgo(1),
      publicToken: randomToken(),
      createdAt: daysAgo(1, 11, 0),
    },
  });

  console.log('🧾 Created 8 invoices');

  // ════════════════════════════════════════════════════════════════════════════
  // PAYMENTS (5)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.payment.createMany({
    data: [
      {
        companyId: cid, invoiceId: inv1.id,
        amount: 960.25, method: 'EFT', status: 'SUCCEEDED',
        metadata: { reference: 'FNB-REF-44210' },
        createdAt: daysAgo(3, 10, 0),
      },
      {
        companyId: cid, invoiceId: inv2.id,
        amount: 1610, method: 'CARD', status: 'SUCCEEDED',
        metadata: { last4: '4532' },
        createdAt: daysAgo(2, 9, 0),
      },
      {
        companyId: cid, invoiceId: inv4.id,
        amount: 1518, method: 'EFT', status: 'SUCCEEDED',
        metadata: { reference: 'ABSA-REF-88123' },
        createdAt: daysAgo(2, 14, 0),
      },
      {
        companyId: cid, invoiceId: inv6.id,
        amount: 2000, method: 'CASH', status: 'SUCCEEDED',
        metadata: { note: 'Partial payment on site' },
        createdAt: daysAgo(2, 12, 30),
      },
      {
        companyId: cid, invoiceId: inv8.id,
        amount: 2300, method: 'EFT', status: 'FAILED',
        failureReason: 'Insufficient funds',
        metadata: { reference: 'STD-REF-FAILED-001' },
        createdAt: daysAgo(1, 15, 0),
      },
    ],
  });

  console.log('💳 Created 5 payments');

  // ════════════════════════════════════════════════════════════════════════════
  // EXPENSES (job-related costs)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.expense.createMany({
    data: [
      { companyId: cid, jobId: job3.id, description: 'Parking — Sandton City underground', amount: 85, date: daysAgo(3, 7, 0) },
      { companyId: cid, jobId: job6.id, description: 'Waste disposal fee — grease trap sludge', amount: 650, date: daysAgo(2, 9, 0) },
      { companyId: cid, jobId: job9.id, description: 'Petrol — site visit Midrand', amount: 320, date: daysAgo(1, 7, 30) },
      { companyId: cid, jobId: job9.id, description: 'Hire — mini excavator 4 hrs', amount: 1200, date: daysAgo(1, 8, 0) },
      { companyId: cid, jobId: job11.id, description: 'Building materials — sand & cement', amount: 480, date: daysAgo(1, 12, 0) },
      { companyId: cid, jobId: job12.id, description: 'Geyser purchase — Kwikot 200L (from Geyser Guys)', amount: 6800, date: daysAgo(1, 15, 0) },
    ],
  });

  console.log('💰 Created 6 expenses');

  // ════════════════════════════════════════════════════════════════════════════
  // JOB SIGNATURES (completed jobs)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.jobSignature.createMany({
    data: [
      { jobId: job1.id, signerName: 'Maria van Wyk', signedAt: daysAgo(4, 10, 10) },
      { jobId: job2.id, signerName: 'David Pretorius', signedAt: daysAgo(4, 12, 30) },
      { jobId: job3.id, signerName: 'Mark Gillmore', signedAt: daysAgo(3, 9, 45) },
      { jobId: job4.id, signerName: 'Linda Fourie', signedAt: daysAgo(3, 11, 15) },
      { jobId: job6.id, signerName: 'Mpho Segalo', signedAt: daysAgo(2, 8, 45) },
      { jobId: job7.id, signerName: 'Anisha Patel', signedAt: daysAgo(2, 12, 30) },
      { jobId: job8.id, signerName: 'Chef Lorenzo', signedAt: daysAgo(2, 20, 45) },
      { jobId: job9.id, signerName: 'Estate Manager — J. Moloi', signedAt: daysAgo(1, 11, 30) },
      { jobId: job10.id, signerName: 'Linda Fourie', signedAt: daysAgo(1, 10, 30) },
    ],
  });

  console.log('✍️ Created 9 job signatures');

  // ════════════════════════════════════════════════════════════════════════════
  // PURCHASE ORDERS (3)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.purchaseOrder.create({
    data: {
      companyId: cid, supplierId: supplier4.id, jobId: job12.id,
      orderNumber: 'PO-2026-001', status: 'RECEIVED',
      items: [
        { name: 'Kwikot 200L Super Geyser', qty: 1, unitPrice: 6800, total: 6800 },
        { name: 'Pressure Control Valve', qty: 1, unitPrice: 350, total: 350 },
        { name: 'Vacuum Breaker', qty: 1, unitPrice: 180, total: 180 },
      ],
      subtotal: 7330, tax: 1099.50, total: 8429.50,
      notes: 'Deliver to warehouse by 7am for loading onto van.',
      expectedDate: daysAgo(0, 7, 0), receivedAt: daysAgo(0, 6, 45),
      createdAt: daysAgo(2, 16, 0),
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      companyId: cid, supplierId: supplier3.id, jobId: job11.id,
      orderNumber: 'PO-2026-002', status: 'RECEIVED',
      items: [
        { name: '110mm PVC Drain Pipe (8m)', qty: 8, unitPrice: 120, total: 960 },
        { name: '15mm Copper Pipe (12m)', qty: 12, unitPrice: 85, total: 1020 },
        { name: '22mm Copper Pipe (6m)', qty: 6, unitPrice: 145, total: 870 },
        { name: 'PVC Fittings Kit', qty: 1, unitPrice: 450, total: 450 },
      ],
      subtotal: 3300, tax: 495, total: 3795,
      expectedDate: daysAgo(2, 10, 0), receivedAt: daysAgo(2, 9, 30),
      createdAt: daysAgo(3, 10, 0),
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      companyId: cid, supplierId: supplier1.id,
      orderNumber: 'PO-2026-003', status: 'SENT',
      items: [
        { name: '15mm Copper Pipe (50m roll)', qty: 2, unitPrice: 3800, total: 7600 },
        { name: '22mm Copper Pipe (25m roll)', qty: 1, unitPrice: 3200, total: 3200 },
        { name: '15mm Copper Elbows (box of 50)', qty: 2, unitPrice: 750, total: 1500 },
        { name: 'PTFE Tape (box of 24)', qty: 2, unitPrice: 480, total: 960 },
      ],
      subtotal: 13260, tax: 1989, total: 15249,
      notes: 'Monthly stock replenishment. Trade discount should apply.',
      expectedDate: daysFromNow(3),
      createdAt: daysAgo(0, 9, 0),
    },
  });

  console.log('📝 Created 3 purchase orders');

  // ════════════════════════════════════════════════════════════════════════════
  // RECURRING PLANS (2 maintenance contracts)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.recurringPlan.create({
    data: {
      companyId: cid, customerId: cust3.id, propertyId: prop_greenstone.id,
      title: 'Monthly Grease Trap Service',
      description: 'Monthly grease trap cleaning for food court per City of Joburg compliance.',
      frequency: 'MONTHLY',
      startDate: new Date('2025-01-01'),
      nextRunAt: daysFromNow(28),
      active: true,
      template: [
        { name: 'Grease Trap Cleaning', qty: 1, unitPrice: 3200, total: 3200, type: 'SERVICE' },
        { name: 'Labour — 1 hr', qty: 1, unitPrice: 550, total: 550, type: 'LABOR' },
      ],
    },
  });

  await prisma.recurringPlan.create({
    data: {
      companyId: cid, customerId: cust12.id, propertyId: prop_luthando.id,
      title: 'Quarterly Geyser Inspections',
      description: 'Quarterly geyser safety inspections across the estate. Covers all 120 units in batches of 10.',
      frequency: 'QUARTERLY',
      startDate: new Date('2025-04-01'),
      nextRunAt: daysFromNow(60),
      active: true,
      template: [
        { name: 'Geyser Inspection', qty: 10, unitPrice: 350, total: 3500, type: 'SERVICE' },
        { name: 'Labour — Per Hour', qty: 8, unitPrice: 550, total: 4400, type: 'LABOR' },
      ],
    },
  });

  console.log('🔄 Created 2 recurring plans');

  // ════════════════════════════════════════════════════════════════════════════
  // BOOKING REQUESTS (public form submissions — 4)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.bookingRequest.createMany({
    data: [
      {
        companyId: cid, customerId: cust9.id,
        name: 'Peter Okonkwo', email: 'peter.ok@gmail.com', phone: '+27 72 555 0001',
        addressLine1: '88 Ferndale Drive', city: 'Randburg', state: 'Gauteng', zip: '2194',
        serviceType: 'Geyser Installation', description: 'Need a new geyser installed. Old one is leaking. House is a 3-bed so probably 150L.',
        preferredDate: daysFromNow(5),
        status: 'CONTACTED',
        createdAt: daysAgo(2, 20, 0),
      },
      {
        companyId: cid,
        name: 'Sarah Ngcobo', email: 'sarah.n@gmail.com', phone: '+27 73 444 5555',
        addressLine1: '12 Hibiscus Rd', city: 'Roodepoort', state: 'Gauteng', zip: '1724',
        serviceType: 'Burst Pipe', description: 'Pipe burst in garden. Water spraying everywhere. Please come urgently!',
        preferredDate: daysAgo(0),
        status: 'NEW',
        createdAt: daysAgo(0, 7, 30),
      },
      {
        companyId: cid,
        name: 'Jabu Sithole', phone: '+27 61 888 2222',
        serviceType: 'Blocked Drain', description: 'Kitchen drain blocked. Water backing up into sink.',
        status: 'NEW',
        createdAt: daysAgo(0, 11, 0),
      },
      {
        companyId: cid, customerId: cust10.id,
        name: 'Sunshine Crèche', email: 'info@sunshinecrèche.co.za', phone: '+27 11 678 5432',
        addressLine1: '5 Daisy Lane', city: 'Linden', state: 'Gauteng', zip: '2195',
        serviceType: 'Toilet Installation', description: 'We need 2 new child-height toilets installed in the toddler bathroom. Can you quote?',
        preferredDate: daysFromNow(10),
        status: 'CONTACTED',
        createdAt: daysAgo(3, 14, 0),
      },
    ],
  });

  console.log('📬 Created 4 booking requests');

  // ════════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS (in-app alerts)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.notification.createMany({
    data: [
      { companyId: cid, userId: tech1.id, type: 'JOB_ASSIGNED', title: 'New Job Assigned', message: 'You have been assigned: Leaking toilet — guest bathroom at 14 Jacaranda Cres, Randburg. Scheduled for today at 2:00 PM.', createdAt: daysAgo(0, 8, 0) },
      { companyId: cid, userId: tech2.id, type: 'JOB_ASSIGNED', title: 'New Job Assigned', message: 'You have been assigned: Replace geyser — East Wing at Sandton City. Scheduled for today at 8:00 AM.', createdAt: daysAgo(0, 7, 0) },
      { companyId: cid, userId: admin.id, type: 'ALERT', title: 'Overdue Invoice', message: 'Invoice INV-2026-008 for Braamfontein Body Corporate (R2,300.00) is overdue. Payment attempt failed: insufficient funds.', readAt: daysAgo(0, 9, 0), createdAt: daysAgo(0, 8, 0) },
      { companyId: cid, userId: admin.id, type: 'SYSTEM', title: 'New Booking Request', message: 'Sarah Ngcobo submitted an urgent booking request for a burst pipe at 12 Hibiscus Rd, Roodepoort.', createdAt: daysAgo(0, 7, 35) },
      { companyId: cid, userId: admin.id, type: 'SYSTEM', title: 'New Booking Request', message: 'Jabu Sithole submitted a booking request for a blocked drain.', createdAt: daysAgo(0, 11, 5) },
      { companyId: cid, userId: dispatcher.id, type: 'ALERT', title: 'Low Inventory Alert', message: 'Geyser Element 2kW (SKU: GEY-EL-2K) is below minimum level. Warehouse: 4, Min: 2. Pieter\'s van: 1, Min: 1. Consider restocking.', createdAt: daysAgo(2, 13, 0) },
      { companyId: cid, userId: tech1.id, type: 'JOB_ASSIGNED', title: 'Job Updated', message: 'Bathroom renovation rough-in at 12 Industrial Rd continues today. Checklist items remaining: Run hot & cold supply lines, Install isolation valves, Pressure test, Cap off.', readAt: daysAgo(0, 7, 30), createdAt: daysAgo(0, 7, 0) },
      { companyId: cid, userId: office.id, type: 'SYSTEM', title: 'Purchase Order Received', message: 'PO-2026-001 from Geyser Guys Wholesale has been received. 1x Kwikot 200L Geyser + fittings.', readAt: daysAgo(0, 7, 0), createdAt: daysAgo(0, 6, 50) },
      { companyId: cid, userId: admin.id, type: 'SYSTEM', title: 'Estimate Approved', message: 'Mark Gillmore (Sandton City Mall) approved estimate for geyser replacement — R21,030.00. Job scheduled for today.', readAt: daysAgo(2, 15, 30), createdAt: daysAgo(2, 15, 5) },
      { companyId: cid, userId: tech2.id, type: 'JOB_ASSIGNED', title: 'New Job Assigned', message: 'You have been assigned: Install mixer tap at Café Botanica. Scheduled for tomorrow at 7:00 PM.', createdAt: daysAgo(0, 10, 0) },
      { companyId: cid, userId: dispatcher.id, type: 'SYSTEM', title: 'Payment Failed', message: 'EFT payment of R2,300.00 for INV-2026-008 (Braamfontein Body Corporate) failed: Insufficient funds. Follow up required.', createdAt: daysAgo(1, 15, 5) },
    ],
  });

  console.log('🔔 Created 11 notifications');

  // ════════════════════════════════════════════════════════════════════════════
  // NOTIFICATION LOGS (email/SMS delivery tracking)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.notificationLog.createMany({
    data: [
      { companyId: cid, channel: 'EMAIL', toAddress: 'maria.vw@gmail.com', template: 'invoice_sent', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-001' }, createdAt: daysAgo(4, 11, 5) },
      { companyId: cid, channel: 'SMS', toAddress: '+27 82 345 6789', template: 'job_complete_review', status: 'DELIVERED', payload: { jobTitle: 'Dripping kitchen tap' }, createdAt: daysAgo(4, 14, 0) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'david.pretorius@outlook.com', template: 'invoice_sent', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-002' }, createdAt: daysAgo(4, 13, 5) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'facilities@sandtoncity.co.za', template: 'invoice_sent', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-003' }, createdAt: daysAgo(3, 10, 5) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'admin@braambc.co.za', template: 'invoice_sent', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-004' }, createdAt: daysAgo(3, 12, 5) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'ops@greenstone.co.za', template: 'invoice_sent', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-005' }, createdAt: daysAgo(2, 9, 5) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'anisha.p@icloud.com', template: 'invoice_sent', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-006' }, createdAt: daysAgo(2, 13, 5) },
      { companyId: cid, channel: 'WHATSAPP', toAddress: '+27 84 123 4567', template: 'payment_reminder', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-006', balance: 'R1,162.50' }, createdAt: daysAgo(0, 9, 0) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'peter.ok@gmail.com', template: 'estimate_sent', status: 'DELIVERED', payload: { total: 'R9,450.00' }, createdAt: daysAgo(1, 16, 5) },
      { companyId: cid, channel: 'SMS', toAddress: '+27 73 444 5555', template: 'booking_confirmation', status: 'QUEUED', payload: { name: 'Sarah Ngcobo' }, createdAt: daysAgo(0, 7, 40) },
      { companyId: cid, channel: 'EMAIL', toAddress: 'admin@braambc.co.za', template: 'payment_overdue', status: 'DELIVERED', payload: { invoiceNumber: 'INV-2026-008', balance: 'R2,300.00' }, createdAt: daysAgo(0, 8, 0) },
    ],
  });

  console.log('📤 Created 11 notification logs');

  // ════════════════════════════════════════════════════════════════════════════
  // AUDIT LOGS (activity trail)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.auditLog.createMany({
    data: [
      { companyId: cid, userId: admin.id, action: 'company.create', entityId: cid, entityType: 'Company', metadata: { name: 'AquaFlow Plumbing Solutions' }, createdAt: daysAgo(30) },
      { companyId: cid, userId: dispatcher.id, action: 'job.create', entityId: job1.id, entityType: 'Job', metadata: { title: 'Dripping kitchen tap' }, createdAt: daysAgo(4, 8, 0) },
      { companyId: cid, userId: dispatcher.id, action: 'job.assign', entityId: job1.id, entityType: 'Job', metadata: { techId: tech1.id, techName: 'Sipho Ndaba' }, createdAt: daysAgo(4, 8, 5) },
      { companyId: cid, userId: tech1.id, action: 'job.complete', entityId: job1.id, entityType: 'Job', createdAt: daysAgo(4, 10, 10) },
      { companyId: cid, userId: office.id, action: 'invoice.create', entityId: inv1.id, entityType: 'Invoice', metadata: { invoiceNumber: 'INV-2026-001' }, createdAt: daysAgo(4, 11, 0) },
      { companyId: cid, userId: office.id, action: 'invoice.send', entityId: inv1.id, entityType: 'Invoice', createdAt: daysAgo(4, 11, 5) },
      { companyId: cid, userId: dispatcher.id, action: 'job.create', entityId: job3.id, entityType: 'Job', metadata: { title: 'Restroom leak — Level 2 Food Court', priority: 'HIGH' }, createdAt: daysAgo(3, 6, 30) },
      { companyId: cid, userId: tech1.id, action: 'job.complete', entityId: job3.id, entityType: 'Job', createdAt: daysAgo(3, 9, 45) },
      { companyId: cid, userId: dispatcher.id, action: 'job.cancel', entityId: job5.id, entityType: 'Job', metadata: { reason: 'Customer postponed — wants to wait until after renovations' }, createdAt: daysAgo(3, 12, 0) },
      { companyId: cid, userId: admin.id, action: 'estimate.approve', entityId: est1.id, entityType: 'Estimate', metadata: { total: 21030, approvedBy: 'Mark Gillmore' }, createdAt: daysAgo(2, 15, 0) },
      { companyId: cid, userId: office.id, action: 'payment.record', entityId: inv6.id, entityType: 'Invoice', metadata: { amount: 2000, method: 'CASH', note: 'Partial payment on site' }, createdAt: daysAgo(2, 12, 30) },
      { companyId: cid, userId: office.id, action: 'po.create', entityId: 'PO-2026-003', entityType: 'PurchaseOrder', metadata: { supplier: 'Builders Warehouse Fourways', total: 15249 }, createdAt: daysAgo(0, 9, 0) },
      { companyId: cid, userId: csr.id, action: 'booking.create', entityId: job2.id, entityType: 'Job', metadata: { source: 'Phone call', customer: 'Sandton City Management' }, createdAt: daysAgo(2, 10, 15) },
      { companyId: cid, userId: sales.id, action: 'estimate.create', entityId: est2.id, entityType: 'Estimate', metadata: { total: 9450 }, createdAt: daysAgo(1, 16, 0) },
      { companyId: cid, userId: accountant.id, action: 'creditNote.issue', entityId: 'CN-2026-001', entityType: 'CreditNote', metadata: { amount: 1500, reason: 'Goodwill adjustment' }, createdAt: daysAgo(1, 14, 30) },
    ],
  });

  console.log('📝 Created 15 audit logs');

  // ════════════════════════════════════════════════════════════════════════════
  // GPS LOCATION PINGS (simulating today's movements)
  // ════════════════════════════════════════════════════════════════════════════
  const now = new Date();
  const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const pings = [];
  // Sipho's route today: warehouse → Kya Sands (job11) → Randburg (job13)
  const siphoRoute = [
    { hour: 7, min: 0, lat: -26.1350, lng: 28.0200, acc: 5 },   // Warehouse
    { hour: 7, min: 30, lat: -26.0800, lng: 27.9700, acc: 15 },  // En route
    { hour: 8, min: 0, lat: -26.0410, lng: 27.9530, acc: 8 },    // Kya Sands (job11)
    { hour: 9, min: 0, lat: -26.0410, lng: 27.9530, acc: 5 },
    { hour: 10, min: 0, lat: -26.0410, lng: 27.9530, acc: 6 },
    { hour: 11, min: 0, lat: -26.0410, lng: 27.9530, acc: 5 },
    { hour: 12, min: 0, lat: -26.0410, lng: 27.9530, acc: 7 },
    { hour: 13, min: 0, lat: -26.0700, lng: 27.9900, acc: 20 },  // En route to Randburg
    { hour: 13, min: 30, lat: -26.0936, lng: 28.0064, acc: 8 },  // Maria's house (job13)
  ];

  for (const p of siphoRoute) {
    pings.push({
      userId: tech1.id, companyId: cid,
      lat: p.lat, lng: p.lng, accuracy: p.acc,
      createdAt: new Date(todayBase.getTime() + p.hour * 3600000 + p.min * 60000),
    });
  }

  // Pieter's route today: warehouse → Sandton (job12 geyser replacement)
  const pieterRoute = [
    { hour: 6, min: 30, lat: -26.1350, lng: 28.0200, acc: 5 },   // Warehouse (loading geyser)
    { hour: 7, min: 0, lat: -26.1250, lng: 28.0300, acc: 18 },   // En route
    { hour: 7, min: 30, lat: -26.1150, lng: 28.0450, acc: 15 },
    { hour: 8, min: 0, lat: -26.1076, lng: 28.0567, acc: 8 },    // Sandton City
    { hour: 9, min: 0, lat: -26.1076, lng: 28.0567, acc: 5 },
    { hour: 10, min: 0, lat: -26.1076, lng: 28.0567, acc: 6 },
    { hour: 11, min: 0, lat: -26.1076, lng: 28.0567, acc: 5 },
  ];

  for (const p of pieterRoute) {
    pings.push({
      userId: tech2.id, companyId: cid,
      lat: p.lat, lng: p.lng, accuracy: p.acc,
      createdAt: new Date(todayBase.getTime() + p.hour * 3600000 + p.min * 60000),
    });
  }

  await prisma.userLocationPing.createMany({ data: pings });

  console.log(`📍 Created ${pings.length} GPS location pings`);

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOMER PORTAL TOKENS
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.customerPortalToken.createMany({
    data: [
      { companyId: cid, customerId: cust1.id, token: randomToken(), expiresAt: daysFromNow(30) },
      { companyId: cid, customerId: cust5.id, token: randomToken(), expiresAt: daysFromNow(7) },
      { companyId: cid, customerId: cust6.id, token: randomToken(), expiresAt: daysFromNow(14) },
    ],
  });

  console.log('🔑 Created 3 customer portal tokens');

  // ════════════════════════════════════════════════════════════════════════════
  // XERO CONNECTION
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.xeroConnection.create({
    data: {
      companyId: cid, tenantId: 'xero-tenant-aquaflow-001',
      tenantName: 'AquaFlow Plumbing Solutions',
      status: 'CONNECTED', lastSyncedAt: daysAgo(0, 6, 0),
      metadata: { invoicesSynced: 8, lastInvoiceSynced: 'INV-2026-008' },
    },
  });

  console.log('📊 Created Xero connection');

  // ════════════════════════════════════════════════════════════════════════════
  // JOB PHOTOS (completed jobs)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.jobPhoto.createMany({
    data: [
      { jobId: job1.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job1-before.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job1-before.jpg', caption: 'Before — dripping kitchen tap', uploadedById: tech1.id, createdAt: daysAgo(4, 9, 20) },
      { jobId: job1.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job1-after.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job1-after.jpg', caption: 'After — new washers installed, no drip', uploadedById: tech1.id, createdAt: daysAgo(4, 10, 5) },
      { jobId: job3.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job3-leak.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job3-leak.jpg', caption: 'Water pooling under vanity — supply line burst', uploadedById: tech1.id, createdAt: daysAgo(3, 7, 30) },
      { jobId: job3.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job3-repair.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job3-repair.jpg', caption: 'New copper section soldered in place', uploadedById: tech1.id, createdAt: daysAgo(3, 8, 55) },
      { jobId: job7.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job7-element.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job7-element.jpg', caption: 'Failed geyser element — burnt out', uploadedById: tech1.id, createdAt: daysAgo(2, 10, 45) },
      { jobId: job9.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job9-excavation.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job9-excavation.jpg', caption: 'Excavation showing burst irrigation pipe', uploadedById: tech1.id, createdAt: daysAgo(1, 9, 55) },
      { jobId: job9.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job9-complete.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job9-complete.jpg', caption: 'Repaired and backfilled — area restored', uploadedById: tech1.id, createdAt: daysAgo(1, 11, 25) },
      { jobId: job11.id, companyId: cid, url: 'https://storage.aquaflow.co.za/photos/job11-roughin.jpg', thumbnailUrl: 'https://storage.aquaflow.co.za/photos/thumb/job11-roughin.jpg', caption: 'Waste runs laid in floor — day 1 progress', uploadedById: tech1.id, createdAt: daysAgo(1, 16, 0) },
    ],
  });

  console.log('📸 Created 8 job photos');

  // ════════════════════════════════════════════════════════════════════════════
  // ESTIMATE OPTIONS (multi-option estimates)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.estimateOption.createMany({
    data: [
      {
        estimateId: est1.id,
        name: 'Standard — Kwikot 200L',
        description: 'Replace with like-for-like Kwikot 200L electric geyser',
        items: [
          { name: 'Kwikot 200L Geyser', qty: 1, unitPrice: 6800, total: 6800 },
          { name: 'Installation Labour (4 hrs)', qty: 4, unitPrice: 550, total: 2200 },
          { name: 'Pressure Control Valve', qty: 1, unitPrice: 350, total: 350 },
          { name: 'Vacuum Breaker', qty: 1, unitPrice: 180, total: 180 },
        ],
        total: 21030,
        accepted: true,
      },
      {
        estimateId: est1.id,
        name: 'Premium — Solar Hybrid 200L',
        description: 'Upgrade to solar-assisted geyser with evacuated tubes. Higher upfront cost, lower running costs.',
        items: [
          { name: 'Solar Hybrid 200L System', qty: 1, unitPrice: 18500, total: 18500 },
          { name: 'Installation Labour (8 hrs)', qty: 8, unitPrice: 550, total: 4400 },
          { name: 'Roof Mounting Kit', qty: 1, unitPrice: 2200, total: 2200 },
          { name: 'Pressure Control Valve', qty: 1, unitPrice: 350, total: 350 },
        ],
        total: 25450,
        accepted: false,
      },
    ],
  });

  console.log('📋 Created 2 estimate options');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECTS (multi-job projects)
  // ════════════════════════════════════════════════════════════════════════════
  const project1 = await prisma.project.create({
    data: {
      companyId: cid, customerId: cust4.id, propertyId: prop_david2.id,
      name: 'Warehouse Office Bathroom Renovation',
      description: 'Full bathroom installation in converted warehouse office space. Includes rough-in plumbing, tiling prep, and second-fix installation.',
      status: 'IN_PROGRESS',
      budget: 35000,
      startDate: daysAgo(1),
      endDate: daysFromNow(14),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      companyId: cid, customerId: cust12.id, propertyId: prop_luthando.id,
      name: 'Luthando Estate Annual Maintenance',
      description: 'Annual geyser inspections, irrigation maintenance, and ad-hoc plumbing repairs across 120-house estate.',
      status: 'IN_PROGRESS',
      budget: 120000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    },
  });

  const project3 = await prisma.project.create({
    data: {
      companyId: cid, customerId: cust1.id, propertyId: prop_sandton.id,
      name: 'Sandton City Geyser Upgrade Programme',
      description: 'Phased replacement of all ageing geysers in the complex. Phase 1: East Wing.',
      status: 'PLANNING',
      budget: 250000,
      startDate: daysAgo(0),
      endDate: daysFromNow(90),
    },
  });

  console.log('📁 Created 3 projects');

  // ════════════════════════════════════════════════════════════════════════════
  // TIME ENTRIES (technician time tracking)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.timeEntry.createMany({
    data: [
      { companyId: cid, userId: tech1.id, jobId: job1.id, type: 'TRAVEL', startTime: daysAgo(4, 8, 30), endTime: daysAgo(4, 9, 15), duration: 2700, description: 'Drive to Randburg' },
      { companyId: cid, userId: tech1.id, jobId: job1.id, type: 'WRENCH', startTime: daysAgo(4, 9, 15), endTime: daysAgo(4, 10, 10), duration: 3300, description: 'Tap washer replacement' },
      { companyId: cid, userId: tech2.id, jobId: job2.id, type: 'TRAVEL', startTime: daysAgo(4, 10, 30), endTime: daysAgo(4, 11, 10), duration: 2400, description: 'Drive to Northcliff' },
      { companyId: cid, userId: tech2.id, jobId: job2.id, type: 'WRENCH', startTime: daysAgo(4, 11, 10), endTime: daysAgo(4, 12, 30), duration: 4800, description: 'Drain unblocking' },
      { companyId: cid, userId: tech1.id, jobId: job3.id, type: 'TRAVEL', startTime: daysAgo(3, 6, 30), endTime: daysAgo(3, 7, 15), duration: 2700, description: 'Drive to Sandton City' },
      { companyId: cid, userId: tech1.id, jobId: job3.id, type: 'WRENCH', startTime: daysAgo(3, 7, 15), endTime: daysAgo(3, 9, 45), duration: 9000, description: 'Emergency burst pipe repair' },
      { companyId: cid, userId: tech1.id, jobId: job7.id, type: 'WRENCH', startTime: daysAgo(2, 10, 20), endTime: daysAgo(2, 12, 30), duration: 7800, description: 'Geyser element replacement' },
      { companyId: cid, userId: tech2.id, jobId: job6.id, type: 'WRENCH', startTime: daysAgo(2, 6, 10), endTime: daysAgo(2, 8, 45), duration: 9300, description: 'Grease trap service' },
      { companyId: cid, userId: tech1.id, jobId: job9.id, type: 'TRAVEL', startTime: daysAgo(1, 7, 30), endTime: daysAgo(1, 8, 20), duration: 3000, description: 'Drive to Midrand estate' },
      { companyId: cid, userId: tech1.id, jobId: job9.id, type: 'WRENCH', startTime: daysAgo(1, 8, 20), endTime: daysAgo(1, 11, 30), duration: 11400, description: 'Irrigation leak detection & repair' },
      { companyId: cid, userId: tech1.id, jobId: job11.id, type: 'WRENCH', startTime: daysAgo(1, 13, 15), endTime: daysAgo(1, 17, 0), duration: 13500, description: 'Bathroom rough-in — day 1' },
      { companyId: cid, userId: tech1.id, type: 'ADMIN', startTime: daysAgo(1, 17, 0), endTime: daysAgo(1, 17, 30), duration: 1800, description: 'End-of-day paperwork and van restocking' },
      { companyId: cid, userId: tech2.id, jobId: job10.id, type: 'WRENCH', startTime: daysAgo(1, 8, 5), endTime: daysAgo(1, 10, 30), duration: 8700, description: 'Pressure switch diagnosis & replacement' },
      { companyId: cid, userId: tech1.id, type: 'BREAK', startTime: daysAgo(1, 12, 0), endTime: daysAgo(1, 13, 0), duration: 3600, description: 'Lunch break' },
    ],
  });

  console.log('⏱️ Created 14 time entries');

  // ════════════════════════════════════════════════════════════════════════════
  // INVENTORY TRANSFERS (warehouse ↔ van movements)
  // ════════════════════════════════════════════════════════════════════════════
  const invItems = await prisma.inventoryItem.findMany({ where: { companyId: cid } });
  const getInvItem = (sku: string, location: string) => invItems.find(i => i.sku === sku && i.location === location)!;

  await prisma.inventoryTransfer.createMany({
    data: [
      { companyId: cid, inventoryItemId: getInvItem('COP-15M', 'WAREHOUSE').id, userId: tech1.id, fromLocation: 'WAREHOUSE', toLocation: 'VAN', quantity: 5, status: 'COMPLETED', notes: 'Restocking van for the week', createdAt: daysAgo(5, 7, 0) },
      { companyId: cid, inventoryItemId: getInvItem('PTFE-01', 'WAREHOUSE').id, userId: tech1.id, fromLocation: 'WAREHOUSE', toLocation: 'VAN', quantity: 3, status: 'COMPLETED', notes: 'Low on tape', createdAt: daysAgo(5, 7, 5) },
      { companyId: cid, inventoryItemId: getInvItem('COP-22M', 'WAREHOUSE').id, userId: tech2.id, fromLocation: 'WAREHOUSE', toLocation: 'VAN', quantity: 4, status: 'COMPLETED', createdAt: daysAgo(3, 6, 30) },
      { companyId: cid, inventoryItemId: getInvItem('GEY-EL-2K', 'WAREHOUSE').id, userId: tech2.id, fromLocation: 'WAREHOUSE', toLocation: 'VAN', quantity: 1, status: 'COMPLETED', notes: 'For Anisha Patel geyser job', createdAt: daysAgo(2, 6, 30) },
      { companyId: cid, inventoryItemId: getInvItem('WSH-KIT', 'WAREHOUSE').id, userId: tech1.id, fromLocation: 'WAREHOUSE', toLocation: 'VAN', quantity: 2, status: 'PENDING', notes: 'Pickup tomorrow morning', createdAt: daysAgo(0, 16, 0) },
    ],
  });

  console.log('🔄 Created 5 inventory transfers');

  // ════════════════════════════════════════════════════════════════════════════
  // MEMBERSHIP TIERS (3 tiers)
  // ════════════════════════════════════════════════════════════════════════════
  const tierBronze = await prisma.membershipTier.create({
    data: {
      companyId: cid, name: 'Bronze', description: 'Basic maintenance cover with priority booking',
      price: 299, interval: 'MONTHLY',
      laborDiscountPct: 5, materialDiscountPct: 0,
      priorityBooking: true, includedVisits: 1,
      benefits: ['Priority booking', '5% labour discount', '1 free maintenance visit per year', '24/7 emergency line access'],
      sortOrder: 1,
    },
  });

  const tierSilver = await prisma.membershipTier.create({
    data: {
      companyId: cid, name: 'Silver', description: 'Enhanced cover with discounts on parts and labour',
      price: 549, interval: 'MONTHLY',
      laborDiscountPct: 10, materialDiscountPct: 5,
      priorityBooking: true, includedVisits: 2,
      benefits: ['Priority booking', '10% labour discount', '5% materials discount', '2 free maintenance visits per year', '24/7 emergency line access', 'Annual geyser inspection included'],
      sortOrder: 2,
    },
  });

  const tierGold = await prisma.membershipTier.create({
    data: {
      companyId: cid, name: 'Gold', description: 'Premium all-inclusive cover for peace of mind',
      price: 899, interval: 'MONTHLY',
      laborDiscountPct: 15, materialDiscountPct: 10,
      priorityBooking: true, includedVisits: 4,
      benefits: ['Priority booking — guaranteed same-day', '15% labour discount', '10% materials discount', '4 free maintenance visits per year', '24/7 emergency line — 2hr response guarantee', 'Annual geyser inspection included', 'Free call-out fee on all visits'],
      sortOrder: 3,
    },
  });

  console.log('🏅 Created 3 membership tiers');

  // ════════════════════════════════════════════════════════════════════════════
  // MEMBERSHIPS (active customer memberships)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.membership.createMany({
    data: [
      {
        companyId: cid, customerId: cust1.id, tierId: tierGold.id,
        status: 'ACTIVE', startDate: new Date('2025-06-01'),
        nextBillingDate: daysFromNow(28), lastBillingDate: daysAgo(2),
        autoRenew: true, visitsUsed: 3,
        notes: 'Key commercial client — VIP treatment',
      },
      {
        companyId: cid, customerId: cust3.id, tierId: tierSilver.id,
        status: 'ACTIVE', startDate: new Date('2025-01-01'),
        nextBillingDate: daysFromNow(28), lastBillingDate: daysAgo(2),
        autoRenew: true, visitsUsed: 8,
      },
      {
        companyId: cid, customerId: cust5.id, tierId: tierBronze.id,
        status: 'ACTIVE', startDate: new Date('2026-01-15'),
        nextBillingDate: daysFromNow(12), lastBillingDate: daysAgo(18),
        autoRenew: true, visitsUsed: 1,
      },
      {
        companyId: cid, customerId: cust12.id, tierId: tierGold.id,
        status: 'ACTIVE', startDate: new Date('2025-04-01'),
        nextBillingDate: daysFromNow(28), lastBillingDate: daysAgo(2),
        autoRenew: true, visitsUsed: 2,
        notes: 'Estate-wide membership — covers common areas',
      },
      {
        companyId: cid, customerId: cust2.id, tierId: tierBronze.id,
        status: 'PAST_DUE', startDate: new Date('2025-09-01'),
        nextBillingDate: daysAgo(5), lastBillingDate: daysAgo(35),
        autoRenew: true, visitsUsed: 0,
        notes: 'Payment bounced — follow up with Maria',
      },
    ],
  });

  console.log('🤝 Created 5 memberships');

  // ════════════════════════════════════════════════════════════════════════════
  // CAMPAIGNS (automated follow-ups)
  // ════════════════════════════════════════════════════════════════════════════
  const campaign1 = await prisma.campaign.create({
    data: {
      companyId: cid, name: 'Unsold Estimate Follow-up',
      type: 'UNSOLD_ESTIMATE', status: 'ACTIVE',
      trigger: { daysSinceEstimate: 7, estimateStatuses: ['SENT'] },
      template: {
        subject: 'Still thinking about your plumbing quote?',
        body: 'Hi {{customer.name}}, we noticed you haven\'t responded to your estimate of {{estimate.total}}. We\'d love to help — reply to this email or call us at 011 234 5678. This quote is valid until {{estimate.validUntil}}.',
        channel: 'EMAIL',
      },
      channels: ['EMAIL'],
      lastRunAt: daysAgo(1, 8, 0),
      nextRunAt: daysFromNow(1, 8, 0),
    },
  });

  const campaign2 = await prisma.campaign.create({
    data: {
      companyId: cid, name: 'Winter Geyser Check Reminder',
      type: 'SEASONAL_REMINDER', status: 'ACTIVE',
      trigger: { season: 'winter', monthsRange: [5, 6, 7], lastServiceOlderThanDays: 180 },
      template: {
        subject: 'Winter is coming — is your geyser ready?',
        body: 'Hi {{customer.name}}, winter puts extra strain on your geyser. It\'s been over 6 months since your last service. Book a geyser health check today for just R350. Call us at 011 234 5678.',
        channel: 'SMS',
      },
      channels: ['SMS', 'EMAIL'],
      lastRunAt: daysAgo(14),
      nextRunAt: daysFromNow(14),
    },
  });

  const campaign3 = await prisma.campaign.create({
    data: {
      companyId: cid, name: 'Membership Renewal Reminder',
      type: 'MEMBERSHIP_RENEWAL', status: 'DRAFT',
      trigger: { daysBeforeExpiry: 30 },
      template: {
        subject: 'Your AquaFlow membership is up for renewal',
        body: 'Hi {{customer.name}}, your {{membership.tierName}} membership renews on {{membership.nextBillingDate}}. Ensure uninterrupted coverage — update your payment details if needed.',
        channel: 'EMAIL',
      },
      channels: ['EMAIL', 'WHATSAPP'],
    },
  });

  console.log('📣 Created 3 campaigns');

  // ════════════════════════════════════════════════════════════════════════════
  // CAMPAIGN SENDS (delivery history)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.campaignSend.createMany({
    data: [
      { campaignId: campaign1.id, customerId: cust9.id, channel: 'EMAIL', sentAt: daysAgo(1, 8, 5), status: 'DELIVERED', metadata: { estimateTotal: 'R9,450.00' } },
      { campaignId: campaign2.id, customerId: cust2.id, channel: 'SMS', sentAt: daysAgo(14, 9, 0), status: 'DELIVERED', metadata: { phone: '+27 82 345 6789' } },
      { campaignId: campaign2.id, customerId: cust4.id, channel: 'EMAIL', sentAt: daysAgo(14, 9, 0), status: 'OPENED', metadata: { openedAt: daysAgo(14, 11, 30) } },
      { campaignId: campaign2.id, customerId: cust7.id, channel: 'SMS', sentAt: daysAgo(14, 9, 0), status: 'FAILED', metadata: { error: 'Invalid phone number format' } },
      { campaignId: campaign2.id, customerId: cust5.id, channel: 'EMAIL', sentAt: daysAgo(14, 9, 0), status: 'CLICKED', metadata: { clickedLink: 'booking-page' } },
    ],
  });

  console.log('📨 Created 5 campaign sends');

  // ════════════════════════════════════════════════════════════════════════════
  // PERMITS & INSPECTIONS
  // ════════════════════════════════════════════════════════════════════════════
  const permit1 = await prisma.permit.create({
    data: {
      companyId: cid, jobId: job12.id,
      permitNumber: 'COJ-PLB-2026-04421',
      permitType: 'Plumbing', authority: 'City of Johannesburg — Building Control',
      status: 'ISSUED',
      applicationDate: daysAgo(5),
      issueDate: daysAgo(3),
      expirationDate: daysFromNow(90),
      fee: 850,
      notes: 'Geyser replacement requires CoC — inspector must verify installation',
    },
  });

  const permit2 = await prisma.permit.create({
    data: {
      companyId: cid, jobId: job11.id,
      permitNumber: 'COJ-PLB-2026-04398',
      permitType: 'Plumbing', authority: 'City of Johannesburg — Building Control',
      status: 'INSPECTION_SCHEDULED',
      applicationDate: daysAgo(8),
      issueDate: daysAgo(5),
      expirationDate: daysFromNow(85),
      fee: 1200,
      notes: 'New bathroom rough-in — full inspection required before close-up',
    },
  });

  await prisma.permit.create({
    data: {
      companyId: cid, jobId: job9.id,
      permitType: 'Drainage', authority: 'City of Johannesburg — Water & Sanitation',
      status: 'APPLIED',
      applicationDate: daysAgo(1),
      fee: 450,
      notes: 'Underground pipe repair on estate common area — may need retroactive approval',
    },
  });

  console.log('📜 Created 3 permits');

  // Inspections
  await prisma.inspection.createMany({
    data: [
      {
        permitId: permit1.id,
        scheduledDate: daysFromNow(1, 10, 0),
        inspectorName: 'Mnr. J. van Tonder',
        inspectorPhone: '+27 11 407 6611',
        notes: 'Inspect geyser installation, pressure relief, and electrical CoC',
      },
      {
        permitId: permit2.id,
        scheduledDate: daysFromNow(3, 9, 0),
        inspectorName: 'Ms. P. Dube',
        inspectorPhone: '+27 11 407 6620',
        notes: 'Rough-in inspection — waste falls, vent pipes, water supply lines',
      },
      {
        permitId: permit2.id,
        scheduledDate: daysAgo(6, 14, 0),
        completedDate: daysAgo(6, 15, 0),
        inspectorName: 'Ms. P. Dube',
        inspectorPhone: '+27 11 407 6620',
        result: 'CONDITIONAL',
        notes: 'Initial site visit — approved to proceed with rough-in. Full inspection after completion.',
        followUpRequired: true,
      },
    ],
  });

  console.log('🔍 Created 3 inspections');

  // ════════════════════════════════════════════════════════════════════════════
  // SUBCONTRACTORS & ASSIGNMENTS
  // ════════════════════════════════════════════════════════════════════════════
  const sub1 = await prisma.subcontractor.create({
    data: {
      companyId: cid, name: 'Vusi Electrical Services',
      contactName: 'Vusi Mabaso', email: 'vusi@vusielectrical.co.za', phone: '+27 82 900 1234',
      specialty: 'Electrical — Certificates of Compliance',
      licenseNumber: 'EC-GP-2019-44210', licenseExpiry: daysFromNow(180),
      insuranceProvider: 'Hollard Business Insurance', insurancePolicyNumber: 'HBI-88421-EC',
      insuranceExpiry: daysFromNow(300),
      hourlyRate: 650,
      notes: 'Reliable electrician for geyser CoC work. Same-day availability most weeks.',
      status: 'ACTIVE',
    },
  });

  const sub2 = await prisma.subcontractor.create({
    data: {
      companyId: cid, name: 'TileRight Installations',
      contactName: 'Ahmed Moosa', email: 'ahmed@tileright.co.za', phone: '+27 83 456 7890',
      specialty: 'Tiling & Waterproofing',
      licenseNumber: 'NHBRC-GP-TI-8832',
      insuranceProvider: 'Santam', insurancePolicyNumber: 'SAN-COM-55123',
      insuranceExpiry: daysFromNow(200),
      hourlyRate: 450,
      notes: 'Handles bathroom tiling after our plumbing rough-in. Good quality, punctual.',
      status: 'ACTIVE',
    },
  });

  await prisma.subcontractor.create({
    data: {
      companyId: cid, name: 'Jozi Drain Solutions',
      contactName: 'Lucky Sithole', email: 'lucky@jozidrain.co.za', phone: '+27 71 800 5555',
      specialty: 'CCTV Drain Surveys & Relining',
      licenseNumber: 'PIRB-GP-2021-11200', licenseExpiry: daysFromNow(90),
      insuranceProvider: 'Discovery Insure', insurancePolicyNumber: 'DI-BUS-33210',
      insuranceExpiry: daysFromNow(150),
      hourlyRate: 750,
      notes: 'Specialist drain camera and relining. Minimum 4-hour call-out.',
      status: 'ACTIVE',
    },
  });

  console.log('👷 Created 3 subcontractors');

  // Subcontractor assignments
  await prisma.subcontractorAssignment.createMany({
    data: [
      {
        subcontractorId: sub1.id, jobId: job12.id,
        description: 'Electrical Certificate of Compliance for new geyser installation',
        agreedRate: 1200,
        notes: 'Scheduled for after plumbing completion — same day if possible',
      },
      {
        subcontractorId: sub2.id, jobId: job11.id,
        description: 'Bathroom tiling and waterproofing after plumbing rough-in complete',
        agreedRate: 8500,
        notes: 'Will start once our rough-in passes inspection. Estimated 3 days.',
      },
    ],
  });

  console.log('📋 Created 2 subcontractor assignments');

  // ════════════════════════════════════════════════════════════════════════════
  // FINANCING OPTIONS & APPLICATIONS
  // ════════════════════════════════════════════════════════════════════════════
  const fin1 = await prisma.financingOption.create({
    data: {
      companyId: cid, name: '6-Month Interest Free',
      provider: 'In-House', termMonths: 6, interestRate: 0,
      minAmount: 2000, maxAmount: 15000, active: true,
    },
  });

  const fin2 = await prisma.financingOption.create({
    data: {
      companyId: cid, name: '12-Month Payment Plan',
      provider: 'In-House', termMonths: 12, interestRate: 8.5,
      minAmount: 5000, maxAmount: 50000, active: true,
    },
  });

  await prisma.financingOption.create({
    data: {
      companyId: cid, name: '24-Month Extended Plan',
      provider: 'PayJustNow', termMonths: 24, interestRate: 12,
      minAmount: 10000, maxAmount: 100000, active: true,
    },
  });

  console.log('💰 Created 3 financing options');

  // Financing applications
  await prisma.financingApplication.createMany({
    data: [
      {
        companyId: cid, customerId: cust5.id, financingOptionId: fin1.id,
        amount: 3162.50, status: 'ACTIVE',
        monthlyPayment: 527.08, approvedAt: daysAgo(2, 13, 0),
        notes: 'Geyser element replacement — customer requested payment plan',
      },
      {
        companyId: cid, customerId: cust4.id, financingOptionId: fin2.id,
        amount: 11150, status: 'APPROVED',
        monthlyPayment: 1009.79, approvedAt: daysAgo(5, 11, 0),
        notes: 'Bathroom renovation — approved for 12-month plan',
      },
      {
        companyId: cid, customerId: cust9.id, financingOptionId: fin1.id,
        amount: 9450, status: 'OFFERED',
        monthlyPayment: 1575,
        notes: 'Offered with geyser installation estimate — awaiting customer response',
      },
    ],
  });

  console.log('📄 Created 3 financing applications');

  // ════════════════════════════════════════════════════════════════════════════
  // FLAT RATE BUNDLES
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.flatRateBundle.createMany({
    data: [
      {
        companyId: cid, name: 'Kitchen Tap Replacement', category: 'Repairs',
        description: 'All-inclusive: remove old tap, supply & install new mixer, test for leaks',
        flatPrice: 2200, laborMinutes: 60,
        items: [
          { name: 'Kitchen Mixer Tap', qty: 1, cost: 650, type: 'MATERIAL' },
          { name: 'PTFE Tape', qty: 1, cost: 25, type: 'MATERIAL' },
          { name: 'Labour', qty: 1, cost: 550, type: 'LABOR' },
          { name: 'Call-out Fee', qty: 1, cost: 450, type: 'SERVICE' },
        ],
      },
      {
        companyId: cid, name: 'Toilet Suite Replacement', category: 'Installations',
        description: 'Remove old toilet, supply & install new close-coupled suite, incl. new pan connector and cistern fittings',
        flatPrice: 4500, laborMinutes: 120,
        items: [
          { name: 'Close-coupled Toilet Suite', qty: 1, cost: 1800, type: 'MATERIAL' },
          { name: 'Pan Connector', qty: 1, cost: 85, type: 'MATERIAL' },
          { name: 'Cistern Fittings Kit', qty: 1, cost: 150, type: 'MATERIAL' },
          { name: 'Labour (2 hrs)', qty: 2, cost: 550, type: 'LABOR' },
          { name: 'Call-out Fee', qty: 1, cost: 450, type: 'SERVICE' },
        ],
      },
      {
        companyId: cid, name: 'Geyser Health Check', category: 'Geysers',
        description: 'Full geyser inspection: anode rod, element, thermostat, pressure valve, drip tray',
        flatPrice: 650, laborMinutes: 45,
        items: [
          { name: 'Inspection Labour', qty: 1, cost: 350, type: 'LABOR' },
          { name: 'Call-out Fee', qty: 1, cost: 450, type: 'SERVICE' },
        ],
      },
      {
        companyId: cid, name: 'Emergency Burst Pipe Repair', category: 'Repairs',
        description: 'Emergency response: locate burst, isolate, cut out and replace damaged section (up to 2m copper)',
        flatPrice: 3500, laborMinutes: 150,
        items: [
          { name: 'Emergency Call-out', qty: 1, cost: 850, type: 'SERVICE' },
          { name: 'Copper Pipe 15mm (2m)', qty: 2, cost: 85, type: 'MATERIAL' },
          { name: 'Fittings', qty: 1, cost: 120, type: 'MATERIAL' },
          { name: 'Labour (2 hrs)', qty: 2, cost: 550, type: 'LABOR' },
        ],
      },
      {
        companyId: cid, name: 'Drain Clearing — Basic', category: 'Drainage',
        description: 'Standard drain clearing with manual snake (up to 15m). Includes call-out.',
        flatPrice: 1400, laborMinutes: 60,
        items: [
          { name: 'Drain Snake Service', qty: 1, cost: 950, type: 'SERVICE' },
          { name: 'Call-out Fee', qty: 1, cost: 450, type: 'SERVICE' },
        ],
      },
    ],
  });

  console.log('📦 Created 5 flat rate bundles');

  // ════════════════════════════════════════════════════════════════════════════
  // MARKUP RULES (auto-markup by material category)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.markupRule.createMany({
    data: [
      { companyId: cid, category: 'Piping', markupType: 'PERCENTAGE', markupValue: 35 },
      { companyId: cid, category: 'Drainage', markupType: 'PERCENTAGE', markupValue: 30 },
      { companyId: cid, category: 'Geysers', markupType: 'PERCENTAGE', markupValue: 25 },
      { companyId: cid, category: 'Consumables', markupType: 'PERCENTAGE', markupValue: 50 },
      { companyId: cid, category: 'Fixtures', markupType: 'PERCENTAGE', markupValue: 30 },
      { companyId: cid, category: 'Pumps', markupType: 'PERCENTAGE', markupValue: 20 },
    ],
  });

  console.log('💲 Created 6 markup rules');

  // ════════════════════════════════════════════════════════════════════════════
  // TECHNICIAN CERTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.techCertification.createMany({
    data: [
      {
        userId: tech1.id, companyId: cid,
        name: 'PIRB Registered Plumber', issuingBody: 'Plumbing Industry Registration Board',
        certificateNumber: 'PIRB-GP-2018-22410',
        issuedDate: new Date('2018-03-15'), expiryDate: new Date('2027-03-15'),
        verified: true,
      },
      {
        userId: tech1.id, companyId: cid,
        name: 'First Aid Level 1', issuingBody: 'St John Ambulance SA',
        certificateNumber: 'STJA-FA1-2025-8840',
        issuedDate: new Date('2025-02-10'), expiryDate: new Date('2028-02-10'),
        verified: true,
      },
      {
        userId: tech2.id, companyId: cid,
        name: 'PIRB Registered Plumber', issuingBody: 'Plumbing Industry Registration Board',
        certificateNumber: 'PIRB-GP-2019-33021',
        issuedDate: new Date('2019-07-01'), expiryDate: new Date('2028-07-01'),
        verified: true,
      },
      {
        userId: tech2.id, companyId: cid,
        name: 'Gas Installation Certificate', issuingBody: 'LP Gas Safety Association of Southern Africa',
        certificateNumber: 'LPGSASA-2023-5501',
        issuedDate: new Date('2023-05-20'), expiryDate: new Date('2026-05-20'),
        verified: true,
      },
      {
        userId: tech2.id, companyId: cid,
        name: 'Working at Heights', issuingBody: 'SafeWork Training Academy',
        certificateNumber: 'SWTA-WAH-2024-1122',
        issuedDate: new Date('2024-09-01'), expiryDate: new Date('2026-09-01'),
        verified: true,
      },
      {
        userId: tech3.id, companyId: cid,
        name: 'PIRB Apprentice Registration', issuingBody: 'Plumbing Industry Registration Board',
        certificateNumber: 'PIRB-APP-2025-9980',
        issuedDate: new Date('2025-01-15'), expiryDate: new Date('2029-01-15'),
        verified: false,
      },
    ],
  });

  console.log('🎓 Created 6 technician certifications');

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOMER NOTES (communication timeline)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.customerNote.createMany({
    data: [
      { companyId: cid, customerId: cust1.id, userId: admin.id, type: 'MEETING', subject: 'Quarterly review with Mark Gillmore', body: 'Discussed geyser upgrade programme. Mark wants all East Wing units done by end of Q2. Agreed on phased approach — 4 geysers per month. Budget approved by Sandton City management.', duration: 2700, createdAt: daysAgo(10, 10, 0) },
      { companyId: cid, customerId: cust1.id, userId: dispatcher.id, type: 'CALL_INBOUND', subject: 'Geyser replacement scheduling', body: 'Mark called to confirm East Wing geyser replacement can proceed. Security will provide access from 7am. Loading dock available for geyser delivery.', duration: 180, createdAt: daysAgo(3, 9, 0) },
      { companyId: cid, customerId: cust2.id, userId: office.id, type: 'CALL_OUTBOUND', subject: 'Payment follow-up', body: 'Called Maria about overdue membership payment. She said she\'ll sort it out with the bank this week. Follow up Friday if not resolved.', duration: 120, createdAt: daysAgo(2, 11, 0) },
      { companyId: cid, customerId: cust5.id, userId: tech1.id, type: 'NOTE', body: 'Customer very happy with geyser repair. Asked about solar geyser options for future. Send info pack.', createdAt: daysAgo(2, 12, 35) },
      { companyId: cid, customerId: cust6.id, userId: dispatcher.id, type: 'EMAIL_SENT', subject: 'Invoice INV-2026-008 — Payment overdue', body: 'Sent formal reminder to Linda Fourie about overdue invoice. Mentioned failed EFT attempt. Requested alternative payment method or updated banking details.', createdAt: daysAgo(0, 10, 0) },
      { companyId: cid, customerId: cust8.id, userId: dispatcher.id, type: 'CALL_OUTBOUND', subject: 'Mixer tap install scheduling', body: 'Called Chef Lorenzo to confirm tomorrow\'s after-hours mixer tap installation. He confirmed we can arrive at 7pm. Kitchen will be cleaned and cleared by then.', duration: 90, createdAt: daysAgo(0, 14, 0) },
      { companyId: cid, customerId: cust9.id, userId: office.id, type: 'EMAIL_SENT', subject: 'Estimate for geyser installation', body: 'Sent estimate for 150L geyser installation (R9,450). Included financing option — 6-month interest-free plan available.', createdAt: daysAgo(1, 16, 0) },
      { companyId: cid, customerId: cust12.id, userId: admin.id, type: 'MEETING', subject: 'Estate maintenance contract renewal', body: 'Met with estate manager J. Moloi to review maintenance contract performance. Discussed adding irrigation system to quarterly inspections. Will prepare updated proposal.', duration: 3600, createdAt: daysAgo(7, 14, 0) },
    ],
  });

  console.log('📝 Created 8 customer notes');

  // ════════════════════════════════════════════════════════════════════════════
  // WARRANTY CLAIMS
  // ════════════════════════════════════════════════════════════════════════════
  const assets = await prisma.propertyAsset.findMany({ where: { companyId: cid } });
  const getAsset = (name: string) => assets.find(a => a.name.includes(name))!;

  await prisma.warrantyClaim.createMany({
    data: [
      {
        companyId: cid, propertyAssetId: getAsset('Hot Water Boiler').id,
        claimNumber: 'WC-2026-001', manufacturer: 'Kwikot',
        status: 'DENIED',
        issueDescription: 'Internal corrosion and anode rod degradation causing discoloured water and reduced heating efficiency.',
        submittedDate: daysAgo(30), resolvedDate: daysAgo(15),
        resolution: 'Claim denied — warranty expired November 2024. Anode rod maintenance is customer responsibility per warranty terms.',
        notes: 'This led to the full geyser replacement job (job12)',
      },
      {
        companyId: cid, propertyAssetId: getAsset('Geyser — 150L').id,
        claimNumber: 'WC-2026-002', manufacturer: 'Franke',
        status: 'SUBMITTED',
        issueDescription: 'Thermostat intermittently failing to cut off at set temperature. Water occasionally overheating to 70°C+.',
        submittedDate: daysAgo(2),
        notes: 'Under warranty until June 2027. Franke support ticket #FR-44210-SA submitted. Awaiting response.',
      },
      {
        companyId: cid, propertyAssetId: getAsset('Communal Pressure Pump').id,
        claimNumber: 'WC-2026-003', manufacturer: 'DAB',
        status: 'APPROVED',
        issueDescription: 'Pressure switch failed prematurely after 3 years. DAB warranty covers 5 years on electronics.',
        submittedDate: daysAgo(5), resolvedDate: daysAgo(1),
        resolution: 'DAB approved replacement pressure switch under warranty. Part shipped, expected in 3 business days.',
        notes: 'Related to job10 — pressure switch was replaced with our stock. DAB will reimburse parts cost.',
      },
    ],
  });

  console.log('🛡️ Created 3 warranty claims');

  // ════════════════════════════════════════════════════════════════════════════
  // DIGITAL FORM TEMPLATES & SUBMISSIONS
  // ════════════════════════════════════════════════════════════════════════════
  const formTemplate1 = await prisma.digitalFormTemplate.create({
    data: {
      companyId: cid, name: 'Geyser Inspection Report',
      description: 'Standard geyser safety inspection checklist and report form',
      schema: {
        fields: [
          { name: 'geyserType', label: 'Geyser Type', type: 'select', options: ['Electric', 'Gas', 'Solar', 'Heat Pump'], required: true },
          { name: 'capacity', label: 'Capacity (litres)', type: 'number', required: true },
          { name: 'manufacturer', label: 'Manufacturer', type: 'text', required: true },
          { name: 'serialNumber', label: 'Serial Number', type: 'text', required: true },
          { name: 'anodeRodCondition', label: 'Anode Rod Condition', type: 'select', options: ['Good', 'Fair', 'Poor', 'Not Checked'], required: true },
          { name: 'elementCondition', label: 'Element Condition', type: 'select', options: ['Good', 'Fair', 'Poor', 'N/A'], required: true },
          { name: 'thermostatWorking', label: 'Thermostat Working Correctly', type: 'boolean', required: true },
          { name: 'pressureValveWorking', label: 'T&P Relief Valve Working', type: 'boolean', required: true },
          { name: 'dripTrayPresent', label: 'Drip Tray Present & Draining', type: 'boolean', required: true },
          { name: 'waterTemperature', label: 'Water Temperature at Outlet (°C)', type: 'number', required: true },
          { name: 'notes', label: 'Additional Notes', type: 'textarea', required: false },
          { name: 'overallCondition', label: 'Overall Condition', type: 'select', options: ['Pass', 'Conditional Pass', 'Fail'], required: true },
        ],
      },
      active: true,
    },
  });

  const formTemplate2 = await prisma.digitalFormTemplate.create({
    data: {
      companyId: cid, name: 'Job Completion Report',
      description: 'Standard completion report signed by customer on job completion',
      schema: {
        fields: [
          { name: 'workDescription', label: 'Work Performed', type: 'textarea', required: true },
          { name: 'partsUsed', label: 'Parts/Materials Used', type: 'textarea', required: false },
          { name: 'testResults', label: 'Test Results', type: 'textarea', required: true },
          { name: 'customerSatisfied', label: 'Customer Satisfied', type: 'boolean', required: true },
          { name: 'followUpRequired', label: 'Follow-up Required', type: 'boolean', required: true },
          { name: 'followUpNotes', label: 'Follow-up Notes', type: 'textarea', required: false },
          { name: 'customerSignature', label: 'Customer Signature', type: 'signature', required: true },
        ],
      },
      active: true,
    },
  });

  await prisma.digitalFormTemplate.create({
    data: {
      companyId: cid, name: 'Site Safety Assessment',
      description: 'Pre-work safety assessment for all job sites',
      schema: {
        fields: [
          { name: 'accessSafe', label: 'Safe Access to Work Area', type: 'boolean', required: true },
          { name: 'hazardsIdentified', label: 'Hazards Identified', type: 'textarea', required: false },
          { name: 'ppeRequired', label: 'PPE Required', type: 'multiselect', options: ['Gloves', 'Safety Glasses', 'Hard Hat', 'Steel-toe Boots', 'Ear Protection', 'Respirator'], required: true },
          { name: 'electricalIsolation', label: 'Electrical Isolation Required', type: 'boolean', required: true },
          { name: 'waterIsolation', label: 'Water Isolation Required', type: 'boolean', required: true },
          { name: 'confinedSpace', label: 'Confined Space Entry', type: 'boolean', required: true },
          { name: 'workAtHeight', label: 'Working at Height Required', type: 'boolean', required: true },
          { name: 'siteReadyForWork', label: 'Site Ready for Work', type: 'boolean', required: true },
          { name: 'notes', label: 'Additional Safety Notes', type: 'textarea', required: false },
        ],
      },
      active: true,
    },
  });

  // Plumbing Certificate of Compliance — restricted: schema.requiresCoc gates
  // submission to users with the canIssueCoC permission (admin + senior techs).
  const formTemplateCoC = await prisma.digitalFormTemplate.create({
    data: {
      companyId: cid, name: 'Plumbing Certificate of Compliance (PIRB CoC)',
      description: 'Statutory plumbing Certificate of Compliance — only qualified, authorised plumbers may issue',
      schema: {
        requiresCoc: true,
        fields: [
          { name: 'cocNumber', label: 'CoC Number', type: 'text', required: true },
          { name: 'pirbRegNumber', label: 'PIRB Registration Number', type: 'text', required: true },
          { name: 'propertyDescription', label: 'Property Description', type: 'text', required: true },
          { name: 'workCovered', label: 'Plumbing Work Covered', type: 'textarea', required: true },
          { name: 'waterMeterTested', label: 'Water Meter & Connection Tested', type: 'boolean', required: true },
          { name: 'pressureCompliant', label: 'Water Pressure Within SANS Limits', type: 'boolean', required: true },
          { name: 'geyserCompliant', label: 'Geyser Installation SANS 10254 Compliant', type: 'boolean', required: true },
          { name: 'noCrossConnection', label: 'No Cross-Connection / Backflow Risk', type: 'boolean', required: true },
          { name: 'compliant', label: 'Overall Compliant', type: 'boolean', required: true },
          { name: 'plumberSignature', label: 'Qualified Plumber Signature', type: 'signature', required: true },
        ],
      },
      active: true,
    },
  });

  console.log('📋 Created 4 digital form templates (incl. restricted CoC)');

  // Digital form submissions
  await prisma.digitalFormSubmission.createMany({
    data: [
      {
        companyId: cid, templateId: formTemplate1.id, jobId: job7.id,
        customerId: cust5.id, propertyAssetId: getAsset('Geyser — 150L').id,
        userId: tech1.id,
        data: {
          geyserType: 'Electric', capacity: 150, manufacturer: 'Franke', serialNumber: 'FR-150-44210',
          anodeRodCondition: 'Fair', elementCondition: 'Poor', thermostatWorking: false,
          pressureValveWorking: true, dripTrayPresent: true, waterTemperature: 25,
          notes: 'Element burnt out. Thermostat also faulty — replaced both. Anode rod showing wear but still functional.',
          overallCondition: 'Conditional Pass',
        },
        createdAt: daysAgo(2, 12, 25),
      },
      {
        companyId: cid, templateId: formTemplate2.id, jobId: job3.id,
        customerId: cust1.id, userId: tech1.id,
        data: {
          workDescription: 'Located burst supply line under basin vanity. Cut out 2.5m damaged copper section and replaced with new 15mm pipe. Soldered 4 elbow joints. Pressure tested at 6 bar for 15 minutes — no leaks.',
          partsUsed: '2.5m 15mm copper pipe, 4x 15mm elbows, PTFE tape',
          testResults: 'Pressure test passed. No leaks detected. Water restored to affected zone.',
          customerSatisfied: true, followUpRequired: false,
          customerSignature: 'signed-by-mark-gillmore',
        },
        createdAt: daysAgo(3, 9, 50),
      },
      {
        companyId: cid, templateId: formTemplate2.id, jobId: job6.id,
        customerId: cust3.id, userId: tech2.id,
        data: {
          workDescription: 'Monthly grease trap cleaning — food court. Pumped out approximately 180L of grease and sludge. Cleaned all baffles. Checked inlet and outlet pipes for blockages.',
          partsUsed: 'None',
          testResults: 'Free-flowing drainage confirmed. Grease level within compliance limits.',
          customerSatisfied: true, followUpRequired: false,
          customerSignature: 'signed-by-mpho-segalo',
        },
        createdAt: daysAgo(2, 8, 45),
      },
      {
        companyId: cid, templateId: formTemplateCoC.id, jobId: job7.id,
        customerId: cust5.id, propertyAssetId: getAsset('Geyser — 150L').id,
        userId: tech1.id,
        data: {
          cocNumber: 'COC-2026-0042', pirbRegNumber: 'PIRB-118734',
          propertyDescription: '14 Acacia Road, Bryanston — single residential dwelling',
          workCovered: 'Replacement of 150L electric geyser, new T&P valve, vacuum breaker and drip tray. Re-routed overflow to exterior.',
          waterMeterTested: true, pressureCompliant: true, geyserCompliant: true,
          noCrossConnection: true, compliant: true,
          plumberSignature: 'signed-by-sipho-ndaba',
        },
        createdAt: daysAgo(2, 13, 10),
      },
    ],
  });

  console.log('📝 Created 4 digital form submissions (incl. CoC)');

  // ════════════════════════════════════════════════════════════════════════════
  // BRANCHES (multi-location)
  // ════════════════════════════════════════════════════════════════════════════
  const branchJhb = await prisma.branch.create({
    data: {
      companyId: cid, name: 'Johannesburg CBD (HQ)', code: 'JHB',
      address: '42 Commissioner St, Johannesburg CBD', city: 'Johannesburg',
      phone: '+27 11 234 5678', active: true,
    },
  });
  const branchPta = await prisma.branch.create({
    data: {
      companyId: cid, name: 'Pretoria Branch', code: 'PTA',
      address: '110 Lynnwood Road, Pretoria', city: 'Pretoria',
      phone: '+27 12 348 9900', active: true,
    },
  });

  // Attach existing staff + a couple of customers to branches
  await prisma.user.updateMany({ where: { companyId: cid }, data: { branchId: branchJhb.id } });
  await prisma.user.update({ where: { id: tech3.id }, data: { branchId: branchPta.id } });
  await prisma.customer.update({ where: { id: cust7.id }, data: { branchId: branchPta.id } });

  console.log('🏬 Created 2 branches');

  // ════════════════════════════════════════════════════════════════════════════
  // LEAD SOURCES (CRM attribution)
  // ════════════════════════════════════════════════════════════════════════════
  const lsGoogle = await prisma.leadSource.create({ data: { companyId: cid, name: 'Google Ads', costPerMonth: 8500 } });
  const lsReferral = await prisma.leadSource.create({ data: { companyId: cid, name: 'Customer Referral', costPerMonth: 0 } });
  const lsFacebook = await prisma.leadSource.create({ data: { companyId: cid, name: 'Facebook', costPerMonth: 3200 } });
  const lsWalkin = await prisma.leadSource.create({ data: { companyId: cid, name: 'Walk-in / Signage', costPerMonth: 1500 } });
  const lsHelloPeter = await prisma.leadSource.create({ data: { companyId: cid, name: 'HelloPeter', costPerMonth: 500 } });

  // Attribute customers + booking requests to sources
  await prisma.customer.update({ where: { id: cust5.id }, data: { leadSourceId: lsReferral.id } });
  await prisma.customer.update({ where: { id: cust9.id }, data: { leadSourceId: lsGoogle.id } });
  await prisma.customer.update({ where: { id: cust10.id }, data: { leadSourceId: lsFacebook.id } });
  await prisma.customer.update({ where: { id: cust4.id }, data: { leadSourceId: lsWalkin.id } });
  await prisma.customer.update({ where: { id: cust11.id }, data: { leadSourceId: lsHelloPeter.id } });

  console.log('📡 Created 5 lead sources');

  // ════════════════════════════════════════════════════════════════════════════
  // VANS / FLEET (vans, crew membership, service logs, par levels, alerts)
  // ════════════════════════════════════════════════════════════════════════════
  const van1 = await prisma.van.create({
    data: {
      companyId: cid, branchId: branchJhb.id, name: 'Van 1 — Sipho', registration: 'JHB 123 GP',
      odometerKm: 84200, fuelType: 'Diesel', serviceIntervalKm: 15000,
      lastServiceKm: 80000, lastServiceAt: daysAgo(40), nextServiceKm: 95000, nextServiceAt: daysFromNow(55),
    },
  });
  const van2 = await prisma.van.create({
    data: {
      companyId: cid, branchId: branchJhb.id, name: 'Van 2 — Pieter', registration: 'JHB 456 GP',
      odometerKm: 112400, fuelType: 'Petrol', serviceIntervalKm: 15000,
      lastServiceKm: 105000, lastServiceAt: daysAgo(70), nextServiceKm: 120000, nextServiceAt: daysFromNow(18),
    },
  });
  const van3 = await prisma.van.create({
    data: {
      companyId: cid, branchId: branchPta.id, name: 'Van 3 — Pretoria Crew', registration: 'JHB 789 GP',
      odometerKm: 45100, fuelType: 'Diesel', serviceIntervalKm: 20000,
      lastServiceKm: 40000, lastServiceAt: daysAgo(15), nextServiceKm: 60000, nextServiceAt: daysFromNow(120),
    },
  });

  // Crew membership
  await prisma.vanMember.createMany({
    data: [
      { vanId: van1.id, userId: tech1.id, role: 'DRIVER' },
      { vanId: van2.id, userId: tech2.id, role: 'DRIVER' },
      { vanId: van3.id, userId: tech3.id, role: 'DRIVER' },
      { vanId: van3.id, userId: tech1.id, role: 'MEMBER' },
    ],
  });

  // Link existing VAN inventory to the physical vans
  await prisma.inventoryItem.updateMany({ where: { companyId: cid, location: 'VAN', assignedUserId: tech1.id }, data: { vanId: van1.id } });
  await prisma.inventoryItem.updateMany({ where: { companyId: cid, location: 'VAN', assignedUserId: tech2.id }, data: { vanId: van2.id } });

  // Service logs
  await prisma.vanServiceLog.createMany({
    data: [
      { companyId: cid, vanId: van1.id, userId: tech1.id, type: 'SERVICE', odometerKm: 80000, cost: 2850, description: 'Major service — oil, filters, brake pads', nextServiceKm: 95000, nextServiceAt: daysFromNow(55), createdAt: daysAgo(40) },
      { companyId: cid, vanId: van1.id, userId: tech1.id, type: 'FUEL', odometerKm: 83900, cost: 1200, description: 'Diesel fill-up', createdAt: daysAgo(3) },
      { companyId: cid, vanId: van1.id, userId: tech1.id, type: 'ODOMETER', odometerKm: 84200, description: 'End-of-week odometer reading', createdAt: daysAgo(0) },
      { companyId: cid, vanId: van2.id, userId: tech2.id, type: 'REPAIR', odometerKm: 110200, cost: 1850, description: 'Replaced alternator', createdAt: daysAgo(12) },
      { companyId: cid, vanId: van2.id, userId: tech2.id, type: 'FUEL', odometerKm: 112100, cost: 1400, description: 'Petrol fill-up', createdAt: daysAgo(2) },
      { companyId: cid, vanId: van3.id, userId: tech3.id, type: 'SERVICE', odometerKm: 40000, cost: 3200, description: 'Service + new tyres', nextServiceKm: 60000, nextServiceAt: daysFromNow(120), createdAt: daysAgo(15) },
    ],
  });

  // Van inventory par-level targets + a low-stock alert
  const van1Inv = await prisma.inventoryItem.findMany({ where: { companyId: cid, vanId: van1.id } });
  const van2Inv = await prisma.inventoryItem.findMany({ where: { companyId: cid, vanId: van2.id } });
  await prisma.vanInventoryTarget.createMany({
    data: [
      ...van1Inv.map((it) => ({ companyId: cid, vanId: van1.id, inventoryItemId: it.id, parLevel: Math.max(it.minLevel + 2, 4) })),
      ...van2Inv.map((it) => ({ companyId: cid, vanId: van2.id, inventoryItemId: it.id, parLevel: Math.max(it.minLevel + 2, 4) })),
    ],
  });

  const geyserElVan = van2Inv.find((it) => it.sku === 'GEY-EL-2K');
  if (geyserElVan) {
    await prisma.inventoryAlert.create({
      data: {
        companyId: cid, vanId: van2.id, inventoryItemId: geyserElVan.id,
        message: 'Geyser Element 2kW below par level on Van 2 — restock from warehouse',
        currentQty: geyserElVan.quantity, targetQty: 4, status: 'OPEN',
      },
    });
  }

  console.log('🚐 Created 3 vans, 4 crew members, 6 service logs, par targets + alert');

  // ════════════════════════════════════════════════════════════════════════════
  // JOB TEMPLATES (one-click dispatch presets)
  // ════════════════════════════════════════════════════════════════════════════
  const tplGeyser = await prisma.jobTemplate.create({
    data: {
      companyId: cid, name: 'Geyser Replacement — 150L', defaultDurationMin: 240, defaultPriority: 'HIGH',
      requiredSkills: ['geyser', 'electrical-isolation'],
      defaultDescription: 'Remove old geyser and install new 150L electric geyser incl. valves, drip tray and CoC.',
      defaultLineItems: [
        { name: 'Geyser Installation — 150L', qty: 1, unitPrice: 8500, type: 'SERVICE' },
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, type: 'SERVICE' },
      ],
      defaultChecklist: [
        { label: 'Isolate water & electrical' },
        { label: 'Drain & remove old geyser' },
        { label: 'Install drip tray & new geyser' },
        { label: 'Connect plumbing — T&P valve, vacuum breaker' },
        { label: 'Fill, bleed & test' },
        { label: 'Issue CoC' },
      ],
    },
  });
  const tplDrain = await prisma.jobTemplate.create({
    data: {
      companyId: cid, name: 'Drain Unblocking — Standard', defaultDurationMin: 90, defaultPriority: 'MEDIUM',
      requiredSkills: ['drainage'],
      defaultDescription: 'Manual rodding / snake up to 15m to clear blockage.',
      defaultLineItems: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, type: 'SERVICE' },
        { name: 'Drain Unblocking — Standard', qty: 1, unitPrice: 950, type: 'SERVICE' },
      ],
      defaultChecklist: [
        { label: 'Inspect drain cover & trap' },
        { label: 'Rod drain to clear blockage' },
        { label: 'Test drainage flow' },
      ],
    },
  });
  const tplTap = await prisma.jobTemplate.create({
    data: {
      companyId: cid, name: 'Tap Repair / Washer Replacement', defaultDurationMin: 60, defaultPriority: 'LOW',
      requiredSkills: [],
      defaultDescription: 'Re-seat or replace tap washers and O-rings.',
      defaultLineItems: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, type: 'SERVICE' },
        { name: 'Tap Repair / Washer Replacement', qty: 1, unitPrice: 350, type: 'SERVICE' },
      ],
      defaultChecklist: [
        { label: 'Isolate water supply' },
        { label: 'Replace washers & O-rings' },
        { label: 'Test — no drips after 5 min' },
      ],
    },
  });
  const tplGrease = await prisma.jobTemplate.create({
    data: {
      companyId: cid, name: 'Grease Trap Cleaning (Commercial)', defaultDurationMin: 150, defaultPriority: 'MEDIUM',
      requiredSkills: ['drainage', 'commercial'],
      defaultDescription: 'Pump out & clean commercial grease trap per City of Joburg compliance.',
      defaultLineItems: [
        { name: 'Grease Trap Cleaning', qty: 1, unitPrice: 3200, type: 'SERVICE' },
      ],
      defaultChecklist: [
        { label: 'Pump out grease trap' },
        { label: 'Scrape & clean baffles' },
        { label: 'Flush with clean water' },
        { label: 'Record grease volume for compliance log' },
      ],
    },
  });

  console.log('🧰 Created 4 job templates');

  // ════════════════════════════════════════════════════════════════════════════
  // COMMUNICATIONS INBOX (SMS / WhatsApp threads + messages)
  // ════════════════════════════════════════════════════════════════════════════
  const thread1 = await prisma.smsThread.create({
    data: {
      companyId: cid, customerId: cust2.id, jobId: job13.id, channel: 'SMS', phone: '+27 82 345 6789',
      status: 'OPEN', unreadCount: 1, lastMessageAt: daysAgo(0, 13, 10),
      messages: {
        create: [
          { companyId: cid, direction: 'OUTBOUND', channel: 'SMS', fromNumber: '+27 11 234 5678', toNumber: '+27 82 345 6789', body: 'Hi Maria, this is AquaFlow. Sipho is on his way to your leaking toilet job, ETA 2pm.', authorId: dispatcher.id, status: 'DELIVERED', createdAt: daysAgo(0, 13, 0) },
          { companyId: cid, direction: 'INBOUND', channel: 'SMS', fromNumber: '+27 82 345 6789', toNumber: '+27 11 234 5678', body: 'Thank you, the gate code is 4521#. I will be home.', status: 'READ', createdAt: daysAgo(0, 13, 10) },
        ],
      },
    },
  });
  const thread2 = await prisma.smsThread.create({
    data: {
      companyId: cid, customerId: cust8.id, jobId: job14.id, channel: 'WHATSAPP', phone: '+27 11 447 3300',
      status: 'OPEN', unreadCount: 0, lastMessageAt: daysAgo(0, 14, 5),
      messages: {
        create: [
          { companyId: cid, direction: 'OUTBOUND', channel: 'WHATSAPP', fromNumber: '+27 11 234 5678', toNumber: '+27 11 447 3300', body: 'Hi Chef Lorenzo, confirming the mixer tap install for tomorrow at 7pm. Please have the prep area cleared.', authorId: dispatcher.id, status: 'READ', createdAt: daysAgo(0, 14, 0) },
          { companyId: cid, direction: 'INBOUND', channel: 'WHATSAPP', fromNumber: '+27 11 447 3300', toNumber: '+27 11 234 5678', body: 'Perfect, see you then 👍', status: 'READ', createdAt: daysAgo(0, 14, 5) },
        ],
      },
    },
  });
  await prisma.smsThread.create({
    data: {
      companyId: cid, channel: 'SMS', phone: '+27 73 444 5555', status: 'OPEN', unreadCount: 1, lastMessageAt: daysAgo(0, 7, 32),
      messages: {
        create: [
          { companyId: cid, direction: 'INBOUND', channel: 'SMS', fromNumber: '+27 73 444 5555', toNumber: '+27 11 234 5678', body: 'Hi, pipe burst in my garden in Roodepoort, water everywhere please help urgently!', status: 'DELIVERED', createdAt: daysAgo(0, 7, 32) },
        ],
      },
    },
  });

  console.log('💬 Created 3 SMS/WhatsApp threads');

  // ════════════════════════════════════════════════════════════════════════════
  // CALL LOGS
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.callLog.createMany({
    data: [
      { companyId: cid, customerId: cust1.id, userId: dispatcher.id, direction: 'INBOUND', fromNumber: '+27 11 783 4000', toNumber: '+27 11 234 5678', status: 'COMPLETED', durationSec: 180, startedAt: daysAgo(3, 9, 0), endedAt: daysAgo(3, 9, 3), notes: 'Mark confirmed geyser replacement access from 7am.' },
      { companyId: cid, customerId: cust2.id, userId: office.id, direction: 'OUTBOUND', fromNumber: '+27 11 234 5678', toNumber: '+27 82 345 6789', status: 'COMPLETED', durationSec: 120, startedAt: daysAgo(2, 11, 0), endedAt: daysAgo(2, 11, 2), notes: 'Overdue membership payment follow-up.' },
      { companyId: cid, customerId: cust9.id, direction: 'INBOUND', fromNumber: '+27 72 555 0001', toNumber: '+27 11 234 5678', status: 'MISSED', durationSec: 0, startedAt: daysAgo(1, 17, 30), notes: 'Missed call — chasing geyser quote. Call back.' },
      { companyId: cid, direction: 'INBOUND', fromNumber: '+27 61 888 2222', toNumber: '+27 11 234 5678', status: 'VOICEMAIL', durationSec: 35, startedAt: daysAgo(0, 11, 0), endedAt: daysAgo(0, 11, 1), notes: 'Voicemail — blocked kitchen drain enquiry (Jabu Sithole).' },
      { companyId: cid, customerId: cust8.id, userId: dispatcher.id, direction: 'OUTBOUND', fromNumber: '+27 11 234 5678', toNumber: '+27 11 447 3300', status: 'COMPLETED', durationSec: 90, startedAt: daysAgo(0, 14, 0), endedAt: daysAgo(0, 14, 1), recordingUrl: 'https://storage.aquaflow.co.za/calls/call-cafe-0090.mp3', notes: 'Confirmed after-hours mixer tap install.' },
    ],
  });

  console.log('📞 Created 5 call logs');

  // ════════════════════════════════════════════════════════════════════════════
  // GEOFENCE EVENTS + JOB TIMELINE EVENTS
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.geofenceEvent.createMany({
    data: [
      { companyId: cid, jobId: job3.id, userId: tech1.id, type: 'ENTERED', lat: -26.1076, lng: 28.0567, distanceM: 40, createdAt: daysAgo(3, 7, 12) },
      { companyId: cid, jobId: job3.id, userId: tech1.id, type: 'EXITED', lat: -26.1076, lng: 28.0567, distanceM: 120, createdAt: daysAgo(3, 9, 50) },
      { companyId: cid, jobId: job9.id, userId: tech1.id, type: 'ENTERED', lat: -25.9883, lng: 28.1272, distanceM: 60, createdAt: daysAgo(1, 8, 18) },
      { companyId: cid, jobId: job11.id, userId: tech1.id, type: 'ENTERED', lat: -26.0410, lng: 27.9530, distanceM: 25, createdAt: daysAgo(1, 13, 10) },
      { companyId: cid, jobId: job12.id, userId: tech2.id, type: 'ENTERED', lat: -26.1076, lng: 28.0567, distanceM: 30, createdAt: daysAgo(0, 7, 58) },
    ],
  });

  await prisma.jobTimelineEvent.createMany({
    data: [
      { companyId: cid, jobId: job12.id, type: 'STATUS_CHANGE', message: 'Job assigned to Pieter van der Merwe', actorId: dispatcher.id, metadata: { from: 'REQUESTED', to: 'ASSIGNED' }, createdAt: daysAgo(0, 7, 0) },
      { companyId: cid, jobId: job12.id, type: 'SMS_SENT', message: 'On-my-way SMS sent to customer', actorId: tech2.id, createdAt: daysAgo(0, 7, 40) },
      { companyId: cid, jobId: job12.id, type: 'GEOFENCE_ENTER', message: 'Pieter arrived on site at Sandton City', actorId: tech2.id, createdAt: daysAgo(0, 7, 58) },
      { companyId: cid, jobId: job12.id, type: 'STATUS_CHANGE', message: 'Status changed to EN_ROUTE', actorId: tech2.id, metadata: { from: 'ASSIGNED', to: 'EN_ROUTE' }, createdAt: daysAgo(0, 7, 30) },
      { companyId: cid, jobId: job11.id, type: 'NOTE', message: 'Day 1 rough-in complete — waste runs laid', actorId: tech1.id, createdAt: daysAgo(1, 16, 30) },
      { companyId: cid, jobId: job3.id, type: 'STATUS_CHANGE', message: 'Job completed and signed off by Mark Gillmore', actorId: tech1.id, metadata: { from: 'ON_SITE', to: 'COMPLETED' }, createdAt: daysAgo(3, 9, 45) },
    ],
  });

  console.log('📌 Created 5 geofence events + 6 timeline events');

  // ════════════════════════════════════════════════════════════════════════════
  // DUNNING (AR collection rules + events)
  // ════════════════════════════════════════════════════════════════════════════
  const dunning1 = await prisma.dunningRule.create({
    data: {
      companyId: cid, name: 'Friendly reminder (3 days)', daysAfterDue: 3, channel: 'EMAIL', sortOrder: 1,
      subject: 'Friendly reminder: invoice {{invoice.number}} is due',
      body: 'Hi {{customer.name}}, your invoice {{invoice.number}} for {{invoice.total}} was due on {{invoice.dueDate}}. Please arrange payment at your earliest convenience.',
    },
  });
  const dunning2 = await prisma.dunningRule.create({
    data: {
      companyId: cid, name: 'Second notice (7 days)', daysAfterDue: 7, channel: 'SMS', sortOrder: 2,
      subject: 'Overdue invoice {{invoice.number}}',
      body: 'AquaFlow: invoice {{invoice.number}} ({{invoice.total}}) is now 7 days overdue. Please contact us on 011 234 5678.',
    },
  });
  const dunning3 = await prisma.dunningRule.create({
    data: {
      companyId: cid, name: 'Final demand (14 days)', daysAfterDue: 14, channel: 'EMAIL', sortOrder: 3, attachStatement: true,
      subject: 'FINAL NOTICE: invoice {{invoice.number}} overdue',
      body: 'Hi {{customer.name}}, invoice {{invoice.number}} for {{invoice.total}} remains unpaid 14 days after the due date. A statement is attached. Please settle within 48 hours to avoid further action.',
    },
  });

  await prisma.dunningEvent.createMany({
    data: [
      { companyId: cid, invoiceId: inv8.id, ruleId: dunning1.id, channel: 'EMAIL', status: 'SENT', sentAt: daysAgo(0, 8, 0) },
      { companyId: cid, invoiceId: inv8.id, ruleId: dunning2.id, channel: 'SMS', status: 'FAILED', error: 'Carrier rejected — invalid number', sentAt: daysAgo(0, 8, 5) },
      { companyId: cid, invoiceId: inv3.id, ruleId: dunning1.id, channel: 'EMAIL', status: 'SENT', sentAt: daysAgo(0, 9, 0) },
    ],
  });

  console.log('📨 Created 3 dunning rules + 3 dunning events');

  // ════════════════════════════════════════════════════════════════════════════
  // CREDIT NOTES
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.creditNote.create({
    data: {
      companyId: cid, customerId: cust3.id, invoiceId: inv5.id, number: 'CN-2026-001',
      status: 'ISSUED', reason: 'Goodwill discount — service ran slightly over scheduled window',
      items: [{ name: 'Goodwill adjustment', qty: 1, unitPrice: 300, total: 300 }],
      subtotal: 300, tax: 45, total: 345, issuedAt: daysAgo(1, 10, 0),
    },
  });
  await prisma.creditNote.create({
    data: {
      companyId: cid, customerId: cust1.id, number: 'CN-2026-002',
      status: 'DRAFT', reason: 'Pending — duplicate call-out fee to be credited',
      items: [{ name: 'Call-out Fee reversal', qty: 1, unitPrice: 450, total: 450 }],
      subtotal: 450, tax: 67.5, total: 517.5,
    },
  });

  console.log('🧾 Created 2 credit notes');

  // ════════════════════════════════════════════════════════════════════════════
  // CUSTOMER STATEMENTS (monthly AR statements)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.customerStatement.createMany({
    data: [
      { companyId: cid, customerId: cust1.id, periodStart: daysAgo(30), periodEnd: daysAgo(0), openingBalance: 0, invoicedTotal: 4955.93, paymentsTotal: 0, creditsTotal: 0, closingBalance: 4955.93, emailedAt: daysAgo(0, 6, 30) },
      { companyId: cid, customerId: cust3.id, periodStart: daysAgo(30), periodEnd: daysAgo(0), openingBalance: 0, invoicedTotal: 4312.50, paymentsTotal: 0, creditsTotal: 345, closingBalance: 3967.50, emailedAt: daysAgo(0, 6, 30) },
      { companyId: cid, customerId: cust6.id, periodStart: daysAgo(30), periodEnd: daysAgo(0), openingBalance: 0, invoicedTotal: 3818, paymentsTotal: 1518, creditsTotal: 0, closingBalance: 2300, emailedAt: daysAgo(0, 6, 30) },
    ],
  });

  console.log('📑 Created 3 customer statements');

  // ════════════════════════════════════════════════════════════════════════════
  // DOCUMENT LIBRARY
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.documentFile.createMany({
    data: [
      { companyId: cid, entityType: 'JOB', entityId: job12.id, jobId: job12.id, uploadedById: tech2.id, name: 'Geyser CoC — Sandton East Wing.pdf', url: 'https://storage.aquaflow.co.za/docs/coc-job12.pdf', contentType: 'application/pdf', sizeBytes: 184320, category: 'Certificate' },
      { companyId: cid, entityType: 'JOB', entityId: job11.id, jobId: job11.id, uploadedById: tech1.id, name: 'Bathroom rough-in plan.pdf', url: 'https://storage.aquaflow.co.za/docs/plan-job11.pdf', contentType: 'application/pdf', sizeBytes: 920576, category: 'Plan' },
      { companyId: cid, entityType: 'CUSTOMER', entityId: cust1.id, customerId: cust1.id, uploadedById: admin.id, name: 'Sandton City — Maintenance Contract.pdf', url: 'https://storage.aquaflow.co.za/docs/contract-sandton.pdf', contentType: 'application/pdf', sizeBytes: 256000, category: 'Contract' },
      { companyId: cid, entityType: 'ASSET', entityId: getAsset('Geyser — 150L').id, uploadedById: tech1.id, name: 'Franke Titan 150 — datasheet.pdf', url: 'https://storage.aquaflow.co.za/docs/franke-titan-150.pdf', contentType: 'application/pdf', sizeBytes: 112640, category: 'Datasheet' },
      { companyId: cid, entityType: 'INVOICE', entityId: inv3.id, uploadedById: office.id, name: 'INV-2026-003.pdf', url: 'https://storage.aquaflow.co.za/docs/inv-2026-003.pdf', contentType: 'application/pdf', sizeBytes: 88064, category: 'Invoice' },
    ],
  });

  console.log('📂 Created 5 document files');

  // ════════════════════════════════════════════════════════════════════════════
  // KPI SNAPSHOTS (daily/period business metrics)
  // ════════════════════════════════════════════════════════════════════════════
  await prisma.kpiSnapshot.createMany({
    data: [
      { companyId: cid, capturedAt: daysAgo(60), periodStart: daysAgo(90), periodEnd: daysAgo(60), revenue: 142500, invoicesCount: 38, avgTicket: 3750, closeRate: 0.62, arOpenTotal: 18200, arOver30: 4300, arOver60: 0, arOver90: 0, membersActive: 4, membersChurned: 0, jobsCompleted: 41 },
      { companyId: cid, capturedAt: daysAgo(30), periodStart: daysAgo(60), periodEnd: daysAgo(30), revenue: 168900, invoicesCount: 44, avgTicket: 3838, closeRate: 0.66, arOpenTotal: 21500, arOver30: 5200, arOver60: 1200, arOver90: 0, membersActive: 5, membersChurned: 0, jobsCompleted: 47 },
      { companyId: cid, capturedAt: daysAgo(0), periodStart: daysAgo(30), periodEnd: daysAgo(0), revenue: 152300, invoicesCount: 40, avgTicket: 3807, closeRate: 0.64, arOpenTotal: 17468, arOver30: 2300, arOver60: 0, arOver90: 0, membersActive: 5, membersChurned: 1, jobsCompleted: 43 },
    ],
  });

  console.log('📈 Created 3 KPI snapshots');

  // ════════════════════════════════════════════════════════════════════════════
  // FUTURE JOBS — a full month of scheduled work on top of existing data
  // ════════════════════════════════════════════════════════════════════════════
  const futureSites = [
    { c: cust2.id, p: prop_maria.id },
    { c: cust4.id, p: prop_david.id },
    { c: cust5.id, p: prop_anisha.id },
    { c: cust1.id, p: prop_sandton.id },
    { c: cust3.id, p: prop_greenstone.id },
    { c: cust6.id, p: prop_braam1.id },
    { c: cust6.id, p: prop_braam2.id },
    { c: cust7.id, p: prop_thomas.id },
    { c: cust8.id, p: prop_cafe.id },
    { c: cust12.id, p: prop_luthando.id },
    { c: cust4.id, p: prop_david2.id },
  ];

  type Recipe = {
    title: string; desc: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
    hrs: number; templateId?: string;
    items: { name: string; quantity: number; unitPrice: number; total: number; type: string }[];
    checklist: string[];
  };

  const futureRecipes: Recipe[] = [
    {
      title: 'Leaking basin tap', desc: 'Basin mixer dripping — re-seat or replace washers.', priority: 'LOW', hrs: 1, templateId: tplTap.id,
      items: [
        { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
        { name: 'Tap Repair / Washer Replacement', quantity: 1, unitPrice: 350, total: 350, type: 'SERVICE' },
      ],
      checklist: ['Isolate water supply', 'Replace washers & O-rings', 'Test — no drips after 5 min'],
    },
    {
      title: 'Blocked kitchen drain', desc: 'Kitchen sink draining slowly — rod / snake to clear.', priority: 'MEDIUM', hrs: 1.5, templateId: tplDrain.id,
      items: [
        { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
        { name: 'Drain Unblocking — Standard', quantity: 1, unitPrice: 950, total: 950, type: 'SERVICE' },
      ],
      checklist: ['Inspect drain cover & trap', 'Rod drain to clear blockage', 'Test drainage flow'],
    },
    {
      title: 'Geyser not heating', desc: 'No hot water — test and replace element & thermostat.', priority: 'HIGH', hrs: 2,
      items: [
        { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
        { name: 'Geyser Element Replacement', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
        { name: 'Geyser Element 2kW', quantity: 1, unitPrice: 320, total: 320, type: 'MATERIAL' },
      ],
      checklist: ['Isolate electrical supply', 'Test element with multimeter', 'Replace element & thermostat', 'Refill, bleed & test hot water'],
    },
    {
      title: 'Replace toilet suite', desc: 'Supply & install new close-coupled toilet suite.', priority: 'MEDIUM', hrs: 2,
      items: [
        { name: 'Toilet Installation', quantity: 1, unitPrice: 3500, total: 3500, type: 'SERVICE' },
        { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
      ],
      checklist: ['Isolate & remove old toilet', 'Fit new pan connector', 'Install & seal new suite', 'Test 3 flush cycles'],
    },
    {
      title: 'New geyser installation — 150L', desc: 'Supply & install 150L electric geyser incl. valves and CoC.', priority: 'HIGH', hrs: 4, templateId: tplGeyser.id,
      items: [
        { name: 'Geyser Installation — 150L', quantity: 1, unitPrice: 8500, total: 8500, type: 'SERVICE' },
        { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
      ],
      checklist: ['Isolate water & electrical', 'Drain & remove old geyser', 'Install drip tray & new geyser', 'Connect plumbing — T&P valve, vacuum breaker', 'Fill, bleed & test', 'Issue CoC'],
    },
    {
      title: 'Install kitchen mixer tap', desc: 'Supply & install new kitchen mixer.', priority: 'LOW', hrs: 1,
      items: [
        { name: 'Mixer Tap Installation', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
        { name: 'PTFE Tape', quantity: 1, unitPrice: 25, total: 25, type: 'MATERIAL' },
      ],
      checklist: ['Isolate water supply', 'Remove old tap', 'Install & seal new mixer', 'Test for leaks'],
    },
    {
      title: 'Hidden leak investigation', desc: 'Suspected concealed leak — electronic leak detection.', priority: 'MEDIUM', hrs: 2,
      items: [
        { name: 'Call-out Fee', quantity: 1, unitPrice: 450, total: 450, type: 'SERVICE' },
        { name: 'Leak Detection', quantity: 1, unitPrice: 1200, total: 1200, type: 'SERVICE' },
      ],
      checklist: ['Walk site & isolate zones', 'Electronic leak detection', 'Mark & report leak location'],
    },
    {
      title: 'Monthly grease trap service', desc: 'Scheduled grease trap clean — compliance maintenance.', priority: 'MEDIUM', hrs: 2.5, templateId: tplGrease.id,
      items: [
        { name: 'Grease Trap Cleaning', quantity: 1, unitPrice: 3200, total: 3200, type: 'SERVICE' },
      ],
      checklist: ['Pump out grease trap', 'Scrape & clean baffles', 'Flush with clean water', 'Record grease volume for compliance log'],
    },
    {
      title: 'Burst pipe repair', desc: 'Emergency — locate, isolate and replace burst section.', priority: 'EMERGENCY', hrs: 2,
      items: [
        { name: 'Emergency Call-out Fee', quantity: 1, unitPrice: 850, total: 850, type: 'SERVICE' },
        { name: 'Burst Pipe Repair', quantity: 1, unitPrice: 1800, total: 1800, type: 'SERVICE' },
        { name: '15mm Copper Pipe', quantity: 2, unitPrice: 85, total: 170, type: 'MATERIAL' },
      ],
      checklist: ['Isolate water to affected zone', 'Cut out damaged section', 'Solder new pipe section', 'Pressure test', 'Restore water'],
    },
    {
      title: 'Annual geyser safety inspection', desc: 'Geyser health check — anode, element, T&P valve, drip tray.', priority: 'LOW', hrs: 1,
      items: [
        { name: 'Geyser Health Check', quantity: 1, unitPrice: 650, total: 650, type: 'SERVICE' },
      ],
      checklist: ['Inspect anode rod', 'Test element & thermostat', 'Check T&P relief valve', 'Confirm drip tray draining'],
    },
  ];

  const techVan = [
    { t: tech1.id, v: van1.id },
    { t: tech2.id, v: van2.id },
    { t: tech3.id, v: van3.id },
  ];

  let fjCount = 0;
  let fjIdx = 0;
  const futureJobIds: string[] = [];
  for (let d = 1; d <= 30; d++) {
    const dow = new Date();
    dow.setDate(dow.getDate() + d);
    const weekday = dow.getDay();
    if (weekday === 0) continue; // skip Sundays
    const jobsToday = weekday === 6 ? 1 : (d % 4 === 0 ? 3 : 2); // lighter Saturdays
    const startHours = [8, 11, 14];
    for (let j = 0; j < jobsToday; j++) {
      const site = futureSites[fjIdx % futureSites.length];
      const recipe = futureRecipes[fjIdx % futureRecipes.length];
      const tv = techVan[fjIdx % techVan.length];
      // Later weeks: leave the last slot of the day unassigned (REQUESTED) to populate the dispatch queue
      const unassigned = d > 18 && j === jobsToday - 1;
      const start = daysFromNow(d, startHours[j], 0);
      const end = hoursAfter(start, recipe.hrs);
      const job = await prisma.job.create({
        data: {
          companyId: cid, branchId: branchJhb.id,
          customerId: site.c, propertyId: site.p,
          techId: unassigned ? null : tv.t,
          vanId: unassigned ? null : tv.v,
          templateId: recipe.templateId ?? null,
          title: recipe.title, description: recipe.desc,
          status: unassigned ? 'REQUESTED' : 'ASSIGNED',
          priority: recipe.priority,
          requiredSkills: recipe.priority === 'EMERGENCY' ? ['emergency'] : [],
          scheduledStart: start, scheduledEnd: end,
          lineItems: { create: recipe.items },
          checklist: { create: recipe.checklist.map((label) => ({ label, isCompleted: false })) },
        },
      });
      futureJobIds.push(job.id);
      fjIdx++;
      fjCount++;
    }
  }

  console.log(`📅 Created ${fjCount} future jobs scheduled across the next 30 days`);

  // A couple of pending estimates tied to early future jobs (sales pipeline)
  await prisma.estimate.create({
    data: {
      companyId: cid, customerId: futureSites[0].c, jobId: futureJobIds[0],
      status: 'SENT', total: 920,
      items: [
        { name: 'Call-out Fee', qty: 1, unitPrice: 450, total: 450 },
        { name: 'Tap Repair / Washer Replacement', qty: 1, unitPrice: 350, total: 350 },
        { name: 'Sundries', qty: 1, unitPrice: 120, total: 120 },
      ],
      validUntil: daysFromNow(21),
      createdAt: daysAgo(0, 12, 0),
    },
  });

  console.log('📋 Created 1 future-job estimate');

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n✅ Seed completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Company:       AquaFlow Plumbing Solutions (ZAR)');
  console.log('Users:         9 (admin, dispatcher, office, 3 techs, CSR, sales, accountant)');
  console.log('Customers:     12 (9 active, 2 leads, 1 archived)');
  console.log('Properties:    11');
  console.log('Assets:        6');
  console.log('Price Book:    20 items');
  console.log('Suppliers:     4');
  console.log('Inventory:     20 items (warehouse + 2 vans)');
  console.log('Jobs:          15 (various statuses)');
  console.log('Job Photos:    8');
  console.log('Estimates:     4 (2 approved, 1 sent, 1 draft)');
  console.log('Est. Options:  2 (standard vs premium)');
  console.log('Invoices:      8 (3 paid, 2 sent, 1 partial, 1 draft, 1 overdue)');
  console.log('Payments:      5 (4 succeeded, 1 failed)');
  console.log('Expenses:      6');
  console.log('Signatures:    9');
  console.log('POs:           3 (2 received, 1 sent)');
  console.log('Recurring:     2 plans');
  console.log('Bookings:      4 (2 new, 2 contacted)');
  console.log('Projects:      3 (2 in-progress, 1 planning)');
  console.log('Time Entries:  14');
  console.log('Inv. Transfers: 5 (4 completed, 1 pending)');
  console.log('Membership Tiers: 3 (Bronze, Silver, Gold)');
  console.log('Memberships:   5 (4 active, 1 past due)');
  console.log('Campaigns:     3 (2 active, 1 draft)');
  console.log('Campaign Sends: 5');
  console.log('Permits:       3');
  console.log('Inspections:   3 (1 conditional pass, 2 scheduled)');
  console.log('Subcontractors: 3');
  console.log('Sub. Assignments: 2');
  console.log('Financing Opts: 3');
  console.log('Financing Apps: 3');
  console.log('Flat Rate Bundles: 5');
  console.log('Markup Rules:  6');
  console.log('Tech Certs:    6');
  console.log('Customer Notes: 8');
  console.log('Warranty Claims: 3');
  console.log('Form Templates: 4 (incl. restricted CoC)');
  console.log('Form Submissions: 4 (incl. CoC)');
  console.log('Notifications: 11');
  console.log('Notif. Logs:   11 (email/SMS/WhatsApp)');
  console.log('Audit Logs:    15');
  console.log('GPS Pings:     16');
  console.log('Portal Tokens: 3');
  console.log('Xero:          Connected');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Logins (all password123):');
  console.log('  admin@aquaflow.co.za        ADMIN  (can issue CoC)');
  console.log('  dispatch@aquaflow.co.za     DISPATCHER');
  console.log('  office@aquaflow.co.za       OFFICE');
  console.log('  sipho@aquaflow.co.za        TECHNICIAN (senior, can issue CoC)');
  console.log('  pieter@aquaflow.co.za       TECHNICIAN');
  console.log('  bongani@aquaflow.co.za      TECHNICIAN (invited)');
  console.log('  csr@aquaflow.co.za          CSR');
  console.log('  sales@aquaflow.co.za        SALES');
  console.log('  accountant@aquaflow.co.za   ACCOUNTANT');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
