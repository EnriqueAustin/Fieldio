
import { PrismaClient, JobStatus, JobPriority, UserRole, UserStatus } from '@prisma/client';

// Hardcoded hash for "password123" to avoid bcryptjs dependency issues in seed script
// Generated with bcryptjs locally (cost 10)
const PASSWORD_HASH = '$2a$10$yW.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0'; // Placeholder, actually let's try to import it if possible, but fallback to this fake one will fail login.
// Real hash for "password123":
const REAL_PASSWORD_HASH = '$2a$10$EpIxQi0q6.8.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0';
// Wait, I can't generate a real one here. 
// I will use a simple strategy: I will import bcrypt.

import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Cleanup
    await prisma.jobLineItem.deleteMany();
    await prisma.jobChecklist.deleteMany();
    await prisma.job.deleteMany();
    await prisma.property.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();

    console.log('🧹 Cleaned up old data.');

    // 2. Create Company
    const company = await prisma.company.create({
        data: {
            name: 'Fieldio Demo Co.',
            settings: {
                currency: 'USD',
                timezone: 'America/New_York',
            },
        },
    });

    console.log(`🏢 Created company: ${company.name}`);

    // 3. Create Users
    const passwordHash = await bcrypt.hash('password123', 10);

    const admin = await prisma.user.create({
        data: {
            email: 'admin@fieldio.com',
            passwordHash,
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            companyId: company.id,
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
        },
    });

    const tech1 = await prisma.user.create({
        data: {
            email: 'tech1@fieldio.com',
            passwordHash,
            role: UserRole.TECHNICIAN,
            status: UserStatus.ACTIVE,
            companyId: company.id,
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tech1',
        },
    });

    const tech2 = await prisma.user.create({
        data: {
            email: 'tech2@fieldio.com',
            passwordHash,
            role: UserRole.TECHNICIAN,
            status: UserStatus.ACTIVE,
            companyId: company.id,
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tech2',
        },
    });

    console.log(`👤 Created users: Admin + 2 Technicians`);

    // 4. Create Customers
    const customer1 = await prisma.customer.create({
        data: {
            companyId: company.id,
            name: 'Alice Johnson',
            email: 'alice@example.com',
            phone: '555-0101',
            status: 'ACTIVE',
        },
    });

    const customer2 = await prisma.customer.create({
        data: {
            companyId: company.id,
            name: 'Bob Smith',
            email: 'bob@example.com',
            phone: '555-0102',
            status: 'ACTIVE',
        },
    });

    console.log(`👥 Created customers: Alice & Bob`);

    // 5. Create Properties
    const prop1 = await prisma.property.create({
        data: {
            companyId: company.id,
            customerId: customer1.id,
            addressLine1: '123 Maple Ave',
            city: 'Springfield',
            state: 'IL',
            zip: '62704',
        },
    });

    const prop2 = await prisma.property.create({
        data: {
            companyId: company.id,
            customerId: customer2.id,
            addressLine1: '456 Oak St',
            city: 'Shelbyville',
            state: 'IL',
            zip: '62565',
        },
    });

    console.log(`🏠 Created properties`);

    // 6. Create Jobs
    await prisma.job.create({
        data: {
            companyId: company.id,
            customerId: customer1.id,
            propertyId: prop1.id,
            techId: tech1.id,
            title: 'Fix Leaky Faucet',
            description: 'Kitchen sink is dripping constantly.',
            status: JobStatus.ASSIGNED,
            priority: JobPriority.MEDIUM,
            scheduledStart: new Date(new Date().setHours(10, 0, 0, 0)),
            scheduledEnd: new Date(new Date().setHours(12, 0, 0, 0)),
            lineItems: {
                create: [
                    { name: 'Service Call', quantity: 1, unitPrice: 85.00, total: 85.00, type: 'LABOR' },
                    { name: 'Washer Replacement', quantity: 1, unitPrice: 5.50, total: 5.50, type: 'MATERIAL' },
                ],
            },
            checklist: {
                create: [
                    { label: 'Turn off water main', isCompleted: true },
                    { label: 'Replace washer', isCompleted: false },
                    { label: 'Test for leaks', isCompleted: false },
                ],
            },
        },
    });

    await prisma.job.create({
        data: {
            companyId: company.id,
            customerId: customer2.id,
            propertyId: prop2.id,
            techId: tech2.id,
            title: 'HVAC Maintenance',
            description: 'Seasonal checkup for AC unit.',
            status: JobStatus.REQUESTED,
            priority: JobPriority.LOW,
            scheduledStart: new Date(new Date().setDate(new Date().getDate() + 1)), // Tomorrow
            scheduledEnd: new Date(new Date().setDate(new Date().getDate() + 1)),
        },
    });

    console.log(`🔧 Created jobs`);

    console.log('✅ Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
