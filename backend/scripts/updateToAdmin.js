// backend/scripts/updateToAdmin.js
const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function updateToAdmin() {
  console.log('👑 Updating users to ADMIN role...');
  
  const emailsToUpdate = [
    'bcsbs2212215@szabist.pk',
    'muskanvijay942@gmail.com'
  ];
  
  try {
    for (const email of emailsToUpdate) {
      const user = await prisma.user.update({
        where: { email: email },
        data: { role: 'ADMIN' }
      });
      console.log(`✅ Updated to ADMIN: ${email} | ID: ${user.id}`);
    }
    
    console.log('🎉 Role update completed!');
    console.log('\n🔐 ADMIN CREDENTIALS:');
    console.log('Use your EXISTING passwords for these accounts:');
    emailsToUpdate.forEach(email => {
      console.log(`   Email: ${email}`);
      console.log(`   Password: (Use your current password)`);
      console.log(`   ---`);
    });
    
  } catch (error) {
    console.error('❌ Error updating roles:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateToAdmin();