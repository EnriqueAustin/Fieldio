
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
  await prisma.propertyAsset.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.userLocationPing.deleteMany();
  await prisma.property.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.xeroConnection.deleteMany();
  await prisma.user.deleteMany();
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
    },
  });

  console.log('👤 Created 6 users (admin, dispatcher, office, 3 techs)');

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

  await prisma.estimate.create({
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
    ],
  });

  console.log('📝 Created 12 audit logs');

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
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n✅ Seed completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Company:      AquaFlow Plumbing Solutions (ZAR)');
  console.log('Users:        6 (admin, dispatcher, office, 3 techs)');
  console.log('Customers:    12 (9 active, 2 leads, 1 archived)');
  console.log('Properties:   11');
  console.log('Assets:       6');
  console.log('Price Book:   20 items');
  console.log('Suppliers:    4');
  console.log('Inventory:    20 items (warehouse + 2 vans)');
  console.log('Jobs:         15 (9 completed, 1 cancelled, 1 on-site, 1 en-route, 1 assigned today, 2 scheduled)');
  console.log('Estimates:    4 (2 approved, 1 sent, 1 draft)');
  console.log('Invoices:     8 (3 paid, 2 sent, 1 partial, 1 draft, 1 overdue)');
  console.log('Payments:     5 (4 succeeded, 1 failed)');
  console.log('Expenses:     6');
  console.log('Signatures:   9');
  console.log('POs:          3 (2 received, 1 sent)');
  console.log('Recurring:    2 plans');
  console.log('Bookings:     4 (2 new, 2 contacted)');
  console.log('Notifications: 11');
  console.log('Notif. Logs:  11 (email/SMS/WhatsApp)');
  console.log('Audit Logs:   12');
  console.log('GPS Pings:    16');
  console.log('Portal Tokens: 3');
  console.log('Xero:         Connected');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Login: admin@aquaflow.co.za / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
