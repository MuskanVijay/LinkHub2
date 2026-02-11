require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

async function testOAuth2Media() {
  console.log('🖼️ Testing OAuth 2.0 Media Upload\n');
  console.log('='.repeat(60));
  
  // Get user's Twitter account with OAuth 2.0 token
  const account = await prisma.socialConnection.findUnique({
    where: { id: 18 } // @Muskan351426
  });
  
  if (!account?.accessToken) {
    console.log('❌ No OAuth 2.0 token found');
    console.log('🔧 Reconnect Twitter account in your app');
    return;
  }
  
  console.log(`📋 Account: @${account.accountName}`);
  console.log(`🔑 Token: ${account.accessToken.substring(0, 20)}...`);
  console.log(`⏰ Expires: ${account.tokenExpiresAt?.toLocaleString() || 'Unknown'}`);
  
  // Check if token has media.write scope
  if (account.metadata?.scopes) {
    const hasMediaWrite = account.metadata.scopes.includes('media.write');
    console.log(`📜 Scopes: ${account.metadata.scopes.join(', ')}`);
    console.log(`🖼️ Has media.write: ${hasMediaWrite ? '✅ Yes' : '❌ No'}`);
    
    if (!hasMediaWrite) {
      console.log('\n🚨 PROBLEM: Token missing media.write scope!');
      console.log('🔧 Reconnect Twitter with updated OAuth URL');
      return;
    }
  }
  
  // Test 1: Check user info
  console.log('\n1. Checking user info...');
  try {
    const userRes = await axios.get('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${account.accessToken}` },
      params: { 'user.fields': 'id,name,username' }
    });
    
    console.log(`✅ User: @${userRes.data.data.username}`);
    
  } catch (error) {
    console.log(`❌ User info failed: ${error.response?.data?.title || error.message}`);
    console.log('🔑 Token may be expired. Reconnect Twitter.');
    return;
  }
  
  // Test 2: Upload and post image
  console.log('\n2. Testing media upload and tweet...');
  
  try {
    // Create a simple test image
    const testImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );
    
    // Step A: INIT media upload
    console.log('   A. INIT media upload...');
    const initRes = await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json',
      `command=INIT&total_bytes=${testImage.length}&media_type=image/png&media_category=tweet_image`,
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const mediaId = initRes.data.media_id_string;
    console.log(`   ✅ Media ID: ${mediaId}`);
    
    // Step B: APPEND data
    console.log('   B. APPEND media data...');
    await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json',
      `command=APPEND&media_id=${mediaId}&media=${testImage.toString('base64')}&segment_index=0`,
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    // Step C: FINALIZE
    console.log('   C. FINALIZE upload...');
    const finalizeRes = await axios.post(
      'https://upload.twitter.com/1.1/media/upload.json',
      `command=FINALIZE&media_id=${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    console.log(`   ✅ Media state: ${finalizeRes.data.processing_info?.state || 'ready'}`);
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step D: Post tweet with media
    console.log('   D. Posting tweet with media...');
    const tweetRes = await axios.post(
      'https://api.twitter.com/2/tweets',
      {
        text: 'Testing OAuth 2.0 media upload! 🖼️ #LinkHub',
        media: { media_ids: [mediaId] }
      },
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`\n🎉 🎉 🎉 SUCCESS!`);
    console.log(`✅ Tweet ID: ${tweetRes.data.data.id}`);
    console.log(`✅ Media uploaded: ${mediaId}`);
    console.log(`✅ OAuth 2.0 with media.write WORKS!`);
    
    // Clean up
    console.log('\n🧹 Cleaning up test tweet...');
    await axios.delete(`https://api.twitter.com/2/tweets/${tweetRes.data.data.id}`, {
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    console.log('✅ Test tweet deleted');
    
  } catch (error) {
    console.log('\n❌ Media upload failed:');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data?.title || error.message);
    
    if (error.response?.data) {
      console.log('Details:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.response?.status === 403) {
      console.log('\n🔒 MISSING media.write SCOPE!');
      console.log('Your current OAuth 2.0 token does not have media.write permission.');
      console.log('\n🔧 FIX:');
      console.log('1. Disconnect Twitter in your app');
      console.log('2. Update getOAuthUrl function to include "media.write" scope');
      console.log('3. Reconnect Twitter account');
    }
  }
  
  await prisma.$disconnect();
  console.log('\n' + '='.repeat(60));
}

testOAuth2Media().catch(console.error);