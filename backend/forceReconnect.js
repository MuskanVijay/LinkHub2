const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function forceReconnect() {
  console.log('🔄 Forcing Twitter reconnection for fresh token\n');
  
  // Update the existing connection to be disconnected
  await prisma.socialConnection.update({
    where: { id: 18 },
    data: { 
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      metadata: {
        ...(await prisma.socialConnection.findUnique({ where: { id: 18 } })).metadata,
        needsReconnect: true,
        reason: 'Missing media.write scope',
        requiredScopes: ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access']
      }
    }
  });
  
  console.log('✅ Forced disconnect for @Muskan351426');
  console.log('\n📋 NEXT STEPS:');
  console.log('='.repeat(60));
  console.log('1. Go to your LinkHub app');
  console.log('2. Navigate to Profile/Settings');
  console.log('3. Find Twitter connection');
  console.log('4. It should show "Connect" or "Reconnect"');
  console.log('5. Click to connect - will use NEW OAuth URL with media.write');
  console.log('6. Authorize the NEW permissions (including "Upload media")');
  console.log('='.repeat(60));
  
  console.log('\n🔍 What users will see:');
  console.log('-'.repeat(40));
  console.log('✓ Read Tweets and profiles');
  console.log('✓ Post and like Tweets');
  console.log('✓ Upload media  ← NEW PERMISSION');
  console.log('✓ See your email address');
  console.log('-'.repeat(40));
  
  await prisma.$disconnect();
}

forceReconnect().catch(console.error);