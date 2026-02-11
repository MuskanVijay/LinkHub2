// backend/scripts/checkAdmins.js
const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function checkAdminUsers() {
  console.log('🔍 Checking admin users in database...');
  
  try {
    const adminUsers = await prisma.user.findMany({
      where: { 
        OR: [
          { email: 'bcsbs2212215@szabist.pk' },
          { email: 'muskanvijay171@gmail.com' }
        ]
      },
      select: {
        id: true,
        email: true,
        role: true,
        password: true
      }
    });

    console.log('📋 Found admin users:');
    adminUsers.forEach(user => {
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Password Hash: ${user.password.substring(0, 20)}...`);
      console.log(`   ---`);
    });

    if (adminUsers.length === 0) {
      console.log('❌ No admin users found!');
    } else {
      console.log(`✅ Found ${adminUsers.length} admin users`);
    }

  } catch (error) {
    console.error('Error checking admin users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminUsers();