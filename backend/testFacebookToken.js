const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function testFacebookToken() {
  try {
    // Get Facebook account for user 3
    const account = await prisma.socialAccount.findFirst({
      where: { 
        userId: 3, 
        platform: 'facebook' 
      }
    });

    if (!account) {
      console.log('❌ No Facebook account found for user 3');
      return;
    }

    console.log('📘 Testing Facebook token for:', account.accountName);
    console.log('Token (first 20 chars):', account.accessToken.substring(0, 20));
    console.log('Page ID:', account.platformUserId);
    console.log('-----------------------------------');

    // Test 1: Get page info (basic info - should always work)
    try {
      const pageUrl = `https://graph.facebook.com/v18.0/${account.platformUserId}`;
      const pageRes = await axios.get(pageUrl, {
        params: {
          fields: 'id,name,fan_count',
          access_token: account.accessToken
        }
      });
      console.log('✅ Page Info:');
      console.log('   Name:', pageRes.data.name);
      console.log('   Followers:', pageRes.data.fan_count);
    } catch (err) {
      console.log('❌ Cannot get page info:', err.response?.data?.error?.message || err.message);
    }

    // Test 2: Try to get posts (needs pages_read_engagement permission)
    try {
      const postsUrl = `https://graph.facebook.com/v18.0/${account.platformUserId}/posts`;
      const postsRes = await axios.get(postsUrl, {
        params: {
          fields: 'id,message,created_time,likes.summary(true),comments.summary(true)',
          limit: 10,
          access_token: account.accessToken
        }
      });
      
      console.log('\n✅ Posts Found:', postsRes.data.data?.length || 0);
      if (postsRes.data.data && postsRes.data.data.length > 0) {
        postsRes.data.data.forEach((post, i) => {
          const likes = post.likes?.summary?.total_count || 0;
          const comments = post.comments?.summary?.total_count || 0;
          console.log(`\n   Post ${i+1}:`);
          console.log(`      Message: ${post.message?.substring(0, 50) || 'No text'}...`);
          console.log(`      Likes: ${likes}`);
          console.log(`      Comments: ${comments}`);
        });
      }
    } catch (err) {
      console.log('\n❌ Cannot get posts:', err.response?.data?.error?.message || err.message);
      if (err.response?.data?.error?.code === 10) {
        console.log('\n🔑 SOLUTION: Your token needs the "pages_read_engagement" permission!');
        console.log('   Please reconnect your Facebook account to get a new token with proper permissions.');
      }
    }

    // Test 3: Try to get page access token (to see if we have a page token or user token)
    try {
      const accountsUrl = `https://graph.facebook.com/v18.0/me/accounts`;
      const accountsRes = await axios.get(accountsUrl, {
        params: {
          access_token: account.accessToken
        }
      });
      console.log('\n✅ You have access to', accountsRes.data.data?.length || 0, 'pages');
    } catch (err) {
      console.log('\n❌ Cannot list pages:', err.response?.data?.error?.message || err.message);
    }

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFacebookToken();