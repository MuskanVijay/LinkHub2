const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function testFacebookAnalytics() {
  try {
    const account = await prisma.socialAccount.findFirst({
      where: { userId: 1, platform: 'facebook' }
    });
    
    if (!account) {
      console.log('❌ No Facebook account found');
      return;
    }

    console.log('🔍 Testing Facebook for:', account.accountName);
    console.log('Page ID:', account.platformUserId);
    
    // Test 1: Get page info
    try {
      const pageUrl = `https://graph.facebook.com/v18.0/${account.platformUserId}`;
      const pageRes = await axios.get(pageUrl, {
        params: {
          fields: 'id,name,fan_count,engagement',
          access_token: account.accessToken
        }
      });
      console.log('✅ Page info:', {
        name: pageRes.data.name,
        fan_count: pageRes.data.fan_count
      });
    } catch (error) {
      console.error('❌ Page info error:', error.response?.data || error.message);
    }

    // Test 2: Get page posts to calculate likes/comments
    try {
      const postsUrl = `https://graph.facebook.com/v18.0/${account.platformUserId}/posts`;
      const postsRes = await axios.get(postsUrl, {
        params: {
          fields: 'id,message,likes.summary(true),comments.summary(true),shares',
          limit: 25,
          access_token: account.accessToken
        }
      });

      if (postsRes.data.data) {
        console.log(`📊 Found ${postsRes.data.data.length} posts`);
        
        let totalLikes = 0;
        let totalComments = 0;
        let totalShares = 0;

        postsRes.data.data.forEach(post => {
          totalLikes += post.likes?.summary?.total_count || 0;
          totalComments += post.comments?.summary?.total_count || 0;
          totalShares += post.shares?.count || 0;
        });

        console.log('📈 Post Metrics:', {
          totalLikes,
          totalComments,
          totalShares,
          postsCount: postsRes.data.data.length
        });
      }
    } catch (error) {
      console.error('❌ Posts error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFacebookAnalytics();