const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Update user to HOST role
  const user = await prisma.user.update({
    where: { email: 'testhostflow@example.com' },
    data: { roleId: '751ba6e2-5ce8-4c1a-87d7-867048073a84', status: 'ACTIVE' }
  });
  console.log('Updated user to HOST:', user.id);
  
  // Check KYC status
  const kyc = await prisma.kYCVerification.findUnique({
    where: { userId: user.id }
  });
  console.log('KYC status:', kyc ? kyc.status : 'NO KYC');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
