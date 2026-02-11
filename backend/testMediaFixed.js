require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

async function testMediaFixed() {
  console.log('🧪 Testing Fixed Media Upload\n');
  
  if (!process.env.TWITTER_API_KEY) {
    console.log('❌ Missing Twitter credentials');
    return;
  }
  
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
  
  try {
    // Test 1: Simple text tweet
    console.log('1. Testing text tweet...');
    const textTweet = await client.v2.tweet('Testing fixed implementation! #LinkHub');
    console.log(`✅ Text: ${textTweet.data.id}`);
    await client.v2.deleteTweet(textTweet.data.id);
    console.log('✅ Deleted');
    
    // Test 2: v1.1 media upload with v2 tweet
    console.log('\n2. Testing v1.1 media upload with v2 tweet...');
    
    // Create test image
    const testImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    
    // Upload using v1.1
    const mediaIdStr = await client.v1.uploadMedia(testImage, {
      mimeType: 'image/png',
      category: 'tweet_image'
    });
    
    console.log(`✅ v1.1 Media ID (string): ${mediaIdStr}`);
    
    // Convert to number for v2
    const mediaId = BigInt(mediaIdStr).toString();
    console.log(`✅ Converted to numeric: ${mediaId}`);
    
    // Wait for processing
    console.log('⏳ Waiting 3 seconds for media processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Post with v2 using numeric ID
    const imageTweet = await client.v2.tweet({
      text: 'Testing fixed media upload! 🖼️',
      media: { media_ids: [mediaId] }
    });
    
    console.log(`✅ v2 Tweet with media: ${imageTweet.data.id}`);
    await client.v2.deleteTweet(imageTweet.data.id);
    console.log('✅ Deleted');
    
    // Test 3: v1.1 tweet with media (alternative)
    console.log('\n3. Testing v1.1 tweet with media (alternative)...');
    const mediaId2 = await client.v1.uploadMedia(testImage, { mimeType: 'image/png' });
    
    const v1Tweet = await client.v1.tweet('v1.1 tweet with media! 📸', {
      media_ids: mediaId2
    });
    
    console.log(`✅ v1.1 Tweet: ${v1Tweet.id_str}`);
    await client.v1.deleteTweet(v1Tweet.id_str);
    console.log('✅ Deleted');
    
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ Text tweets work');
    console.log('✅ Media upload works');
    console.log('✅ Media conversion works');
    console.log('✅ Multiple methods available');
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    if (error.data) {
      console.log('Error details:', JSON.stringify(error.data, null, 2));
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

testMediaFixed().catch(console.error);