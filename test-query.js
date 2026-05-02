const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany();
  console.log('ROLES:', JSON.stringify(roles, null, 2));
  
  const users = await prisma.user.findMany({ take: 3, select: { id: true, email: true, firstName: true, roleId: true } });
  console.log('USERS:', JSON.stringify(users, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
