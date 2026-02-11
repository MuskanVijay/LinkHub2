// backend/scripts/checkEmails.js
const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function checkEmails() {
  console.log('🔍 Checking database for admin emails...');
  
  const emailsToCheck = [
    'bcsbs2212215@szabist.pk',
    'muskanvijay942@gmail.com',
  ];
  
  try {
    for (const email of emailsToCheck) {
      const user = await prisma.user.findUnique({
        where: { email: email },
        select: { id: true, email: true, role: true }
      });
      
      if (user) {
        console.log(`✅ FOUND: ${email} | ID: ${user.id} | Role: ${user.role}`);
      } else {
        console.log(`❌ NOT FOUND: ${email}`);
      }
    }
    
  } catch (error) {
    console.error('Error checking emails:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmails();