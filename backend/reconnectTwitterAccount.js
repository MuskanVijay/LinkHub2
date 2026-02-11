const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reconnectTwitterAccount() {
  console.log('🔄 Preparing Twitter account reconnection\n');
  
  // Mark current token as expired
  await prisma.socialConnection.update({
    where: { id: 18 },
    data: { 
      isConnected: false,
      accessToken: null,
      tokenExpiresAt: null
    }
  });
  
  console.log('✅ Marked @Muskan351426 as disconnected');
  console.log('\n📋 ACTION REQUIRED:');
  console.log('='.repeat(50));
  console.log('1. Open your LinkHub app');
  console.log('2. Go to Profile/Settings');
  console.log('3. Find Twitter connection');
  console.log('4. Click "Connect" or "Reconnect"');
  console.log('5. Authorize @Muskan351426');
  console.log('6. This will get FRESH OAuth 2.0 token');
  console.log('='.repeat(50));
  
  console.log('\n🔗 After reconnection:');
  console.log('1. Run: node testTwitterWithImage.js');
  console.log('2. Should see: "✅ Image tweet published!"');
  
  await prisma.$disconnect();
}

reconnectTwitterAccount().catch(console.error);