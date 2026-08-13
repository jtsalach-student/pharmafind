import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

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
    ['Paracetamol', 'Panadol', 'Pain Relief', false],
    ['Ibuprofen', 'Brufen', 'Pain Relief', false],
    ['Amoxicillin', 'Amoxil', 'Antibiotic', true],
    ['Metformin', 'Glucophage', 'Diabetes', true],
    ['Insulin', 'Insulatard', 'Diabetes', true],
    ['Salbutamol', 'Salbutamol Inhaler', 'Respiratory', true],
    ['Adrenaline', 'Adrenaline Injection', 'Emergency', true],
    ['Epinephrine', 'EpiPen', 'Emergency', true],
    ['Glucagon', 'Glucagon', 'Emergency', true],
    ['Hydrocortisone', 'Hydrocortisone Injection', 'Emergency', true],
    ['Nitroglycerin', 'Nitroglycerin Tablets', 'Emergency', true],
    ['ORS', 'ORS', 'Emergency', false],
    ['Cetirizine', 'Zyrtec', 'Allergy', false],
    ['Loratadine', 'Clarityn', 'Allergy', false],
    ['Omeprazole', 'Losec', 'Gastro', false],
    ['Aspirin', 'Ascard', 'Cardio', false],
    ['Atorvastatin', 'Lipitor', 'Cardio', true],
    ['Ciprofloxacin', 'Cipro', 'Antibiotic', true],
    ['Azithromycin', 'Zithromax', 'Antibiotic', true],
    ['Vitamin C', 'Ceevit', 'Supplements', false]
  ] as const;

  const drugs = await Promise.all(
    drugData.map(([genericName, brandName, category, requiresRx]) =>
      prisma.drug.create({ data: { genericName, brandName, category, requiresRx, isEmergency: category === 'Emergency' || brandName === 'Salbutamol Inhaler' || brandName === 'Insulatard' } })
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
    prisma.user.create({ data: { username: 'testuser', passwordHash: await bcrypt.hash('Test123!', 10), role: Role.USER, phone: '+233201111111', createdAt: new Date(), updatedAt: new Date() } }),
    prisma.user.create({ data: { username: 'campusadmin', passwordHash: await bcrypt.hash('Admin123!', 10), role: Role.PHARMACY_ADMIN, phone: '+233202222222', createdAt: new Date(), updatedAt: new Date() } }),
    prisma.user.create({ data: { username: 'pharmacist1', passwordHash: await bcrypt.hash('Pharma123!', 10), role: Role.PHARMACIST, phone: '+233203333333', createdAt: new Date(), updatedAt: new Date() } }),
    prisma.user.create({ data: { username: 'driver1', passwordHash: await bcrypt.hash('Driver123!', 10), role: Role.DRIVER, phone: '+233204444444', createdAt: new Date(), updatedAt: new Date() } })
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
