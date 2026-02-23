const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateSocialConnections() {
  try {
    console.log('🔄 Migrating SocialConnection to SocialAccount...');
    
    // Get all social connections
    const connections = await prisma.socialConnection.findMany({
      where: {
        isConnected: true
      }
    });
    
    console.log(`📊 Found ${connections.length} connections to migrate`);
    
    for (const conn of connections) {
      // Check if already exists in SocialAccount
      const existing = await prisma.socialAccount.findFirst({
        where: {
          userId: conn.userId,
          platform: conn.platform,
          platformUserId: conn.platformUserId
        }
      });
      
      if (!existing) {
        // Create in SocialAccount
        await prisma.socialAccount.create({
          data: {
            userId: conn.userId,
            platform: conn.platform,
            platformUserId: conn.platformUserId,
            accountName: conn.accountName,
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
            tokenExpiresAt: conn.tokenExpiresAt,
            isConnected: conn.isConnected,
            profilePicture: conn.profilePicture,
            metadata: conn.metadata || {}
          }
        });
        console.log(`✅ Migrated ${conn.platform} - ${conn.accountName}`);
      } else {
        console.log(`⏭️ Already exists: ${conn.platform} - ${conn.accountName}`);
      }
    }
    
    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateSocialConnections();