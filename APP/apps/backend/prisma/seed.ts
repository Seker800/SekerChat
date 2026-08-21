import { PrismaClient, UserRole } from '@prisma/client';
import { resolveSeedRole } from '../src/auth/user-role-policy';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });
    const totalUsers = await prisma.user.count();
    const role = resolveSeedRole(existingUser?.role ?? null, totalUsers);

    await prisma.user.upsert({
      where: { email },
      update: {
        role,
      },
      create: {
        email,
        displayName: email.split('@')[0],
        role,
      },
    });
  }

  console.log(`Seeded ${adminEmails.length} admin user placeholder(s).`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
