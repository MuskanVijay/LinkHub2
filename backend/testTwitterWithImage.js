require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');

async function testTwitterWithImage() {
  console.log('🖼️ Testing Twitter Image Upload\n');
  
  // Get account
  const account = await prisma.socialConnection.findUnique({
    where: { id: 18 }
  });
  
  if (!account?.accessToken) {
    console.log('❌ No OAuth 2.0 token');
    return;
  }
  
  console.log(`📋 Account: @${account.accountName}`);
  
  // Test 1: Text-only tweet
  console.log('\n1. Testing text-only tweet...');
  try {
    const textResponse = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: 'Testing image support with LinkHub! #Test' },
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Text tweet: ${textResponse.data.data.id}`);
    
    // Clean up
    await axios.delete(`https://api.twitter.com/2/tweets/${textResponse.data.data.id}`, {
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    console.log('✅ Text tweet deleted');
    
  } catch (error) {
    console.log('❌ Text tweet failed:', error.response?.data?.title);
  }
  
  // Test 2: Image upload with OAuth 1.0a
  console.log('\n2. Testing image upload...');
  
  if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
    console.log('❌ Missing OAuth 1.0a credentials for media upload');
    return;
  }
  
  const oauth1Client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
  
  try {
    // Create a simple test image buffer
    const testImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    
    // Upload media
    const mediaId = await oauth1Client.v1.uploadMedia(testImage, {
      mimeType: 'image/png'
    });
    
    console.log(`✅ Media uploaded: ${mediaId}`);
    
    // Post tweet with media using OAuth 2.0
    const tweetResponse = await axios.post(
      'https://api.twitter.com/2/tweets',
      {
        text: 'Testing image upload! 🖼️',
        media: { media_ids: [mediaId] }
      },
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`✅ Image tweet published: ${tweetResponse.data.data.id}`);
    
    // Clean up
    await axios.delete(`https://api.twitter.com/2/tweets/${tweetResponse.data.data.id}`, {
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    console.log('✅ Image tweet deleted');
    
  } catch (error) {
    console.log('❌ Image upload failed:', error.response?.data?.title || error.message);
    console.log('Error details:', error.response?.data);
  }
  
  await prisma.$disconnect();
  console.log('\n' + '='.repeat(60));
}

testTwitterWithImage().catch(console.error);