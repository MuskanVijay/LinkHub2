// testPageToken.js
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function testPageToken() {
  const account = await prisma.socialAccount.findFirst({
    where: { userId: 3, platform: 'facebook' }
  });

  console.log('Testing different token types...');
  
  // Test 1: Current token (User Token)
  try {
    const postsUrl = `https://graph.facebook.com/v19.0/${account.platformUserId}/posts?fields=id,message&access_token=${account.accessToken}`;
    const postsRes = await axios.get(postsUrl);
    console.log('✅ Current token works!');
  } catch (err) {
    console.log('❌ Current token fails:', err.response?.data?.error?.message);
  }

  console.log('\n🔑 You need to generate a Page Token, not a User Token.');
  console.log('Go to: https://developers.facebook.com/tools/explorer/');
  console.log('1. Select your app');
  console.log('2. Select "Page Token" from the dropdown');
  console.log('3. Add pages_read_engagement permission');
  console.log('4. Generate token and test with your page ID');
}

testPageToken();