require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTwitterAccounts() {
  console.log('🔍 Checking ALL Twitter Accounts in Database\n');
  console.log('='.repeat(60));
  
  const accounts = await prisma.socialConnection.findMany({
    where: { platform: 'twitter', isConnected: true },
    orderBy: { createdAt: 'asc' }
  });
  
  console.log(`Found ${accounts.length} Twitter accounts:\n`);
  
  accounts.forEach((acc, index) => {
    console.log(`📱 ACCOUNT ${index + 1}:`);
    console.log(`   ID: ${acc.id}`);
    console.log(`   Username: @${acc.accountName}`);
    console.log(`   Platform User ID: ${acc.platformUserId}`);
    console.log(`   Created: ${acc.createdAt.toLocaleString()}`);
    console.log(`   OAuth 2.0 Token: ${acc.accessToken ? '✓ Present (' + acc.accessToken.length + ' chars)' : '✗ Missing'}`);
    console.log(`   Token Expires: ${acc.tokenExpiresAt ? acc.tokenExpiresAt.toLocaleString() : 'Not set'}`);
    
    if (acc.metadata?.scopes) {
      console.log(`   Scopes: ${acc.metadata.scopes.join(', ')}`);
    }
    
    console.log('');
  });
  
  // Recommendations
  console.log('🎯 RECOMMENDATIONS:');
  console.log('-'.repeat(40));
  
  if (accounts.length > 1) {
    console.log('❌ Problem: Multiple Twitter accounts connected');
    console.log('✅ Solution: Use account ID 18 (@Muskan351426)');
    console.log('\n📋 Action:');
    console.log('1. Disconnect OLD account (ID 4)');
    console.log('2. Use NEW account (ID 18) for posting');
    console.log('3. Update your .env with NEW tokens from @Muskan351426');
  }
  
  console.log('\n' + '='.repeat(60));
  await prisma.$disconnect();
}

checkTwitterAccounts().catch(console.error);