#!/usr/bin/env ts-node
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL || "postgresql://postgres.jntycqbwvmjiwlxhdqaw:nihymap1122@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true }
  });
  console.log('=== Users in Database ===');
  console.log(JSON.stringify(users, null, 2));
  
  // Test the login flow logic directly
  const testUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'testuser' },
        { email: 'testuser@pharmafind.local' }
      ]
    }
  });
  
  console.log('\n=== Login query result for testuser ===');
  console.log(JSON.stringify(testUser ? { id: testUser.id, username: testUser.username, email: testUser.email, role: testUser.role } : null, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
