import { prisma } from '../lib/prisma';

async function seed() {
  console.log('🌱 Seeding database...');

  // Activate @Abhishe42402615 for tweet monitoring
  try {
    const result = await prisma.ct_accounts.updateMany({
      where: { x_username: 'Abhishe42402615' },
      data: { is_active: true }
    });

    if (result.count > 0) {
      console.log('✅ Activated @Abhishe42402615 for tweet monitoring');
    } else {
      console.log('ℹ️  @Abhishe42402615 not found or already activated');
    }
  } catch (error) {
    console.error('❌ Failed to activate account:', error);
  }

  console.log('🌱 Seeding complete!');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


