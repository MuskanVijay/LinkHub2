require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

async function testOAuth1aOnly() {
  console.log('🧪 Testing OAuth 1.0a Only Approach\n');
  
  // Check credentials
  if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
    console.log('❌ Missing OAuth 1.0a credentials in .env');
    return;
  }
  
  console.log('✅ OAuth 1.0a credentials present');
  
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
  
  // Test 1: Get app info
  try {
    const me = await client.v2.me();
    console.log(`📋 App account: @${me.data.username}`);
    console.log(`👤 Name: ${me.data.name}`);
    
  } catch (error) {
    console.log('❌ Cannot get app info:', error.message);
    return;
  }
  
  // Test 2: Post text tweet
  console.log('\n1. Testing text tweet...');
  try {
    const textTweet = await client.v2.tweet('Testing OAuth 1.0a only approach! #LinkHub');
    console.log(`✅ Text tweet published: ${textTweet.data.id}`);
    
    // Delete it
    await client.v2.deleteTweet(textTweet.data.id);
    console.log('✅ Test tweet deleted');
    
  } catch (error) {
    console.log('❌ Text tweet failed:', error.data?.title || error.message);
  }
  
  // Test 3: Post with image
  console.log('\n2. Testing image upload and tweet...');
  try {
    // Create a simple test image (1x1 pixel PNG)
    const testImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    
    // Upload media
    const mediaId = await client.v1.uploadMedia(testImage, {
      mimeType: 'image/png'
    });
    
    console.log(`✅ Media uploaded: ${mediaId}`);
    
    // Post tweet with media
    const imageTweet = await client.v2.tweet({
      text: 'Testing image upload with OAuth 1.0a! 🖼️',
      media: { media_ids: [mediaId] }
    });
    
    console.log(`✅ Image tweet published: ${imageTweet.data.id}`);
    
    // Delete it
    await client.v2.deleteTweet(imageTweet.data.id);
    console.log('✅ Image tweet deleted');
    
    console.log('\n🎉 OAuth 1.0a ONLY approach WORKS!');
    console.log('✅ Media upload works');
    console.log('✅ Tweet posting works');
    console.log('✅ No need for user OAuth 2.0 tokens');
    
  } catch (error) {
    console.log('❌ Image tweet failed:', error.data?.title || error.message);
    console.log('Error details:', error.data);
  }
  
  console.log('\n' + '='.repeat(60));
}

testOAuth1aOnly().catch(console.error);