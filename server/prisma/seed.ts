import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.gPSLocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.deliveryRequest.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.pharmacist.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.drug.deleteMany();
  await prisma.pharmacy.deleteMany();
  await prisma.user.deleteMany();

  const pharmacies = await prisma.$transaction([
    prisma.pharmacy.create({ data: { name: 'Legon Community Pharmacy', address: 'Main Gate, Legon', phone: '+233200000001', latitude: 5.6501, longitude: -0.1869, opensAt: '08:00', closesAt: '22:00' } }),
    prisma.pharmacy.create({ data: { name: 'Okponglo Care Pharmacy', address: 'Okponglo Junction', phone: '+233200000002', latitude: 5.6484, longitude: -0.1842, opensAt: '07:00', closesAt: '21:00' } }),
    prisma.pharmacy.create({ data: { name: 'Madina Relief Pharmacy', address: 'Madina Zongo Junction', phone: '+233200000003', latitude: 5.6821, longitude: -0.1632, opensAt: '08:00', closesAt: '23:00' } }),
    prisma.pharmacy.create({ data: { name: 'Haatso Medics', address: 'Haatso Station', phone: '+233200000004', latitude: 5.6635, longitude: -0.2241, opensAt: '09:00', closesAt: '20:00' } }),
    prisma.pharmacy.create({ data: { name: 'Atomic Health Pharmacy', address: 'Atomic Roundabout', phone: '+233200000005', latitude: 5.6661, longitude: -0.2034, opensAt: '00:00', closesAt: '23:59' } })
  ]);

  const drugData = [
    ['Paracetamol', 'Panadol', 'Pain Relief', false, 18.5],
    ['Ibuprofen', 'Brufen', 'Pain Relief', false, 22.0],
    ['Amoxicillin', 'Amoxil', 'Antibiotic', true, 32.5],
    ['Metformin', 'Glucophage', 'Diabetes', true, 28.0],
    ['Insulin', 'Insulatard', 'Diabetes', true, 46.0],
    ['Salbutamol', 'Salbutamol Inhaler', 'Respiratory', true, 42.5],
    ['Adrenaline', 'Adrenaline Injection', 'Emergency', true, 58.5],
    ['Epinephrine', 'EpiPen', 'Emergency', true, 62.0],
    ['Glucagon', 'Glucagon', 'Emergency', true, 68.5],
    ['Hydrocortisone', 'Hydrocortisone Injection', 'Emergency', true, 74.0],
    ['Nitroglycerin', 'Nitroglycerin Tablets', 'Emergency', true, 25.5],
    ['ORS', 'ORS', 'Emergency', false, 12.0],
    ['Cetirizine', 'Zyrtec', 'Allergy', false, 15.75],
    ['Loratadine', 'Clarityn', 'Allergy', false, 17.5],
    ['Omeprazole', 'Losec', 'Gastro', false, 19.0],
    ['Aspirin', 'Ascard', 'Cardio', false, 14.5],
    ['Atorvastatin', 'Lipitor', 'Cardio', true, 35.5],
    ['Ciprofloxacin', 'Cipro', 'Antibiotic', true, 31.0],
    ['Azithromycin', 'Zithromax', 'Antibiotic', true, 38.0],
    ['Vitamin C', 'Ceevit', 'Supplements', false, 11.5]
  ] as const;

  const drugs = await Promise.all(
    drugData.map(([genericName, brandName, category, requiresRx, price]) =>
      prisma.drug.create({ data: { genericName, brandName, category, requiresRx, price, isEmergency: category === 'Emergency' || brandName === 'Salbutamol Inhaler' || brandName === 'Insulatard' } })
    )
  );

  const inventoryData = pharmacies.flatMap((pharmacy) =>
    drugs.slice(0, 16).map((drug, index) => ({
      pharmacyId: pharmacy.id,
      drugId: drug.id,
      quantity: ((index + pharmacy.name.length) % 18) + 1,
      isAvailable: true
    }))
  );

  for (const item of inventoryData) {
    await prisma.inventory.create({ data: item });
  }

  const [user, admin, pharmacistUser, driverUser] = await Promise.all([
    prisma.user.create({ data: { username: 'testuser', email: 'testuser@pharmafind.local', passwordHash: await bcrypt.hash('Test123!', 10), role: Role.USER, phone: '+233201111111', createdAt: new Date(), updatedAt: new Date() } }),
    prisma.user.create({ data: { username: 'campusadmin', email: 'campusadmin@pharmafind.local', passwordHash: await bcrypt.hash('Admin123!', 10), role: Role.PHARMACY_ADMIN, phone: '+233202222222', createdAt: new Date(), updatedAt: new Date() } }),
    prisma.user.create({ data: { username: 'pharmacist1', email: 'pharmacist1@pharmafind.local', passwordHash: await bcrypt.hash('Pharma123!', 10), role: Role.PHARMACIST, phone: '+233203333333', createdAt: new Date(), updatedAt: new Date() } }),
    prisma.user.create({ data: { username: 'driver1', email: 'driver1@pharmafind.local', passwordHash: await bcrypt.hash('Driver123!', 10), role: Role.DRIVER, phone: '+233204444444', createdAt: new Date(), updatedAt: new Date() } })
  ]);

  await prisma.adminUser.create({ data: { userId: admin.id, pharmacyId: pharmacies[0].id } });
  await prisma.pharmacist.create({ data: { userId: pharmacistUser.id, pharmacyId: pharmacies[0].id } });
  await prisma.driver.create({ data: { userId: driverUser.id } });

  console.log({ user: user.username, admin: admin.username, pharmacist: pharmacistUser.username, driver: driverUser.username });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
