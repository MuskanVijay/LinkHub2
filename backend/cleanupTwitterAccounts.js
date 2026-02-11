const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupTwitterAccounts() {
  console.log('🧹 Cleaning up Twitter accounts...\n');
  
  // 1. Disconnect OLD accounts (ID 15 & 16)
  await prisma.socialConnection.updateMany({
    where: { 
      id: { in: [15, 16] },
      platform: 'twitter'
    },
    data: { isConnected: false }
  });
  
  console.log('✅ Disconnected OLD accounts (ID 15 & 16)');
  
  // 2. Verify only ID 18 is active
  const activeAccounts = await prisma.socialConnection.findMany({
    where: { 
      platform: 'twitter',
      isConnected: true 
    }
  });
  
  console.log('\n📋 Active Twitter accounts after cleanup:');
  activeAccounts.forEach(acc => {
    console.log(`- @${acc.accountName} (ID: ${acc.id})`);
  });
  
  // 3. Update user's twitter field to use new account
  await prisma.user.updateMany({
    where: { twitter: { contains: 'MuskanVijay6466' } },
    data: { twitter: 'https://twitter.com/Muskan351426' }
  });
  
  console.log('\n✅ Updated user profile with new Twitter URL');
  
  await prisma.$disconnect();
  console.log('\n🎉 Cleanup complete! Use ID 18 for posting.');
}

cleanupTwitterAccounts().catch(console.error);