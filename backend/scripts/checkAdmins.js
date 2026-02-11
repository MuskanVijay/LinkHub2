// backend/scripts/checkAdmins.js
const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function checkAdminUsers() {
  console.log('🔍 Checking admin users in database...');
  
  try {
    // Check ALL users first to see what we have
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true
      },
      orderBy: { id: 'asc' }
    });

    console.log('📋 All users in database:');
    allUsers.forEach(user => {
      console.log(`   ID: ${user.id} | Email: ${user.email} | Role: ${user.role}`);
    });

    console.log('\n🔐 Specific admin check:');
    
    const emailsToCheck = [
      'bcsbs2212215@szabist.pk',
      'muskanvijay942@gmail.com'
    ];
    
    for (const email of emailsToCheck) {
      const user = await prisma.user.findUnique({
        where: { email: email },
        select: {
          id: true,
          email: true,
          role: true,
          password: true
        }
      });
      
      if (user) {
        console.log(`\n✅ Found: ${user.email}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Password hash: ${user.password.substring(0, 30)}...`);
      } else {
        console.log(`\n❌ NOT FOUND: ${email}`);
      }
    }

  } catch (error) {
    console.error('Error checking admin users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminUsers();