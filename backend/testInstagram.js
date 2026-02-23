const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function testInstagramInsights() {
  try {
    const account = await prisma.socialAccount.findFirst({
      where: { userId: 1, platform: 'instagram' }
    });
    
    if (!account) {
      console.log('❌ No Instagram account found');
      return;
    }

    console.log('🔍 Testing Instagram Insights for:', account.accountName);
    console.log('Instagram ID:', account.platformUserId);
    console.log('Access token (first 20 chars):', account.accessToken.substring(0, 20));

    // Test 1: Get Instagram Business Account info
    try {
      const igUrl = `https://graph.facebook.com/v18.0/${account.platformUserId}`;
      const igRes = await axios.get(igUrl, {
        params: {
          fields: 'id,username,website,followers_count',
          access_token: account.accessToken
        }
      });
      console.log('✅ Instagram account info:', igRes.data);
    } catch (error) {
      console.error('❌ Instagram account error:', error.response?.data || error.message);
    }

    // Test 2: Get insights
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      console.log(`📅 Fetching insights from ${yesterday.toISOString()} to ${today.toISOString()}`);

      const insightsUrl = `https://graph.facebook.com/v18.0/${account.platformUserId}/insights`;
      const insightsRes = await axios.get(insightsUrl, {
        params: {
          metric: 'impressions,reach,profile_views',
          period: 'day',
          since: Math.floor(yesterday.getTime() / 1000),
          until: Math.floor(today.getTime() / 1000),
          access_token: account.accessToken
        }
      });
      console.log('✅ Insights response:', JSON.stringify(insightsRes.data, null, 2));
    } catch (error) {
      console.error('❌ Insights error:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testInstagramInsights();
