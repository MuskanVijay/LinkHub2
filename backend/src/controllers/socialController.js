const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const oauthStates = new Map();
const { TwitterApi } = require('twitter-api-v2');

module.exports = exports;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});
const axiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
});
axiosInstance.interceptors.response.use(undefined, async (err) => {
  const { config, code } = err;
   if (code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || err.response?.status >= 500) {
    if (!config || !config.retry) {
      console.log(`⚠️ Network error (${code}), retrying in 2s...`);
      config.retry = true;
      
      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Retry the request
      return axiosInstance(config);
    }
  }
  
  return Promise.reject(err);
});


const generateState = () => {
  return crypto.randomBytes(16).toString('hex');
};
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.timestamp > 3600000) { 
      oauthStates.delete(state);
    }
  }
}, 3600000);
// //this was working
// exports.getConnectedAccounts = async (req, res) => {
//   try {
//     const userId = Number(req.user.userId);
    
//     const connections = await prisma.socialConnection.findMany({
//       where: { 
//         userId: userId, 
//         isConnected: true 
//       }
//     });

//     console.log(`📊 Found ${connections.length} connected accounts for user ${userId}`);
    
//     const formattedAccounts = connections.map(account => {
//       const isTokenValid = account.accessToken && 
//                           !account.accessToken.startsWith('test_token_'); 
//       return {
//         id: account.id,
//         platform: account.platform,
//         accountName: account.accountName || 'Connected Account',
//         profilePicture: account.profilePicture,
//         platformUserId: account.platformUserId,
//         platformName: account.platform.charAt(0).toUpperCase() + account.platform.slice(1),
//         canPublish: !!isTokenValid,
//         type: 'oauth',
//         isTestToken: !!(account.accessToken && account.accessToken.startsWith('test_token_'))
//       };
//     });

//     console.log(`✅ Returning ${formattedAccounts.length} formatted accounts`);
    
//     res.json({ 
//       success: true, 
//       accounts: formattedAccounts 
//     });
//   } catch (error) {
//     console.error('Error fetching accounts:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };

// In socialController.js - FIXED version

exports.getConnectedAccounts = async (req, res) => {
  try {
    const userId = Number(req.user.userId);
    
    const connections = await prisma.socialConnection.findMany({
      where: { 
        userId: userId, 
        isConnected: true 
      }
    });

    console.log(`📊 Found ${connections.length} connected accounts for user ${userId}`);
    
    const formattedAccounts = connections.map(account => {
      const isTokenValid = account.accessToken && 
                          !account.accessToken.startsWith('test_token_');
      
      return {
        id: account.id,
        platform: account.platform,
        accountName: account.accountName || 'Connected Account',
        profilePicture: account.profilePicture,
        platformUserId: account.platformUserId,
        platformName: account.platform.charAt(0).toUpperCase() + account.platform.slice(1),
        canPublish: !!isTokenValid,
        type: 'oauth',
        isTestToken: !!(account.accessToken && account.accessToken.startsWith('test_token_')),
        // ⚠️ IMPORTANT: Include the access token!
        accessToken: account.accessToken  // 👈 ADD THIS LINE
      };
    });

    console.log(`✅ Returning ${formattedAccounts.length} formatted accounts with tokens`);
    
    res.json({ 
      success: true, 
      accounts: formattedAccounts 
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.getOAuthUrl = async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.userId;
    const state = generateState();
    oauthStates.set(state, { userId, platform, timestamp: Date.now() });  
    let authUrl;
    if (platform === 'facebook') {
      const scopes = [
     'public_profile', 
  'pages_show_list',
  'pages_read_engagement', 
  'pages_manage_posts', 
  'pages_manage_metadata', 
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'business_management'
      ].join(',');
      const extras = JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } });
      authUrl = `https://www.facebook.com/v24.0/dialog/oauth?` +
            `client_id=${process.env.FB_APP_ID}&` +
            `redirect_uri=${encodeURIComponent(process.env.FB_REDIRECT_URI)}&` +
            `scope=${encodeURIComponent(scopes)}&` +
            `response_type=code&` + 
            `state=${state}`;
  console.log(`🔗 Facebook OAuth URL generated`);
  } else if (platform === 'twitter') {
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Store code verifier in state
  oauthStates.set(state, { 
    userId, 
    platform, 
    codeVerifier,
    timestamp: Date.now() 
  });
  
  // IMPORTANT: Include ALL necessary scopes
  const scopes = [
    'tweet.read',
    'tweet.write',      // For posting tweets
    'users.read',
    'media.write',      // For uploading images
    'offline.access'    // For refresh tokens
  ].join(' ');
  
  const scopesEncoded = encodeURIComponent(scopes);
  
  const redirectUri = process.env.TWITTER_REDIRECT_URI;
  
  authUrl = `https://twitter.com/i/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${process.env.TWITTER_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${scopesEncoded}&` +
    `state=${state}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256`;
  
  console.log(`🔗 Twitter OAuth URL generated with scopes: ${scopes}`);
} else if (platform === 'linkedin') {
    const scopes = ['openid', 'profile', 'w_member_social', 'email'].join(' ');
    authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
              `response_type=code&` +
              `client_id=${process.env.LINKEDIN_CLIENT_ID}&` +
              `redirect_uri=${encodeURIComponent(process.env.LINKEDIN_CALLBACK_URL)}&` +
              `state=${state}&` +
              `scope=${encodeURIComponent(scopes)}`;
    console.log(`🔗 LinkedIn OAuth URL generated`);
}
else {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform not supported' 
      });
    }
    res.json({ 
      success: true, 
      authUrl: authUrl,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
exports.linkedInCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const stateData = oauthStates.get(state);

    if (!stateData || !code) {
      return res.redirect(`${process.env.FRONTEND_URL}/profile?error=invalid_state`);
    }

    const { userId } = stateData;
    oauthStates.delete(state);

    // 1. Exchange code for access token
    const tokenRes = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenRes.data.access_token;

    // 2. Get User Info (OpenID Connect)
    const userRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // 3. Save to DB
    await prisma.socialConnection.upsert({
      where: {
        userId_platform_platformUserId: {
          userId: parseInt(userId),
          platform: 'linkedin',
          platformUserId: userRes.data.sub // LinkedIn URN ID
        }
      },
      update: {
        accessToken,
        accountName: userRes.data.name,
        profilePicture: userRes.data.picture,
        isConnected: true,
        updatedAt: new Date()
      },
      create: {
        userId: parseInt(userId),
        platform: 'linkedin',
        platformUserId: userRes.data.sub,
        accessToken,
        accountName: userRes.data.name,
        profilePicture: userRes.data.picture,
        isConnected: true
      }
    });

    res.redirect(`${process.env.FRONTEND_URL}/profile?success=linkedin_connected`);
  } catch (error) {
    console.error('❌ LinkedIn Callback Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/profile?error=linkedin_failed`);
  }
};
exports.publishToLinkedIn = async (account, content, mediaUrls) => {
  try {
    console.log(`📤 LinkedIn Publish Started for: ${account.accountName}`);
    
    // If no media, do a simple text post
    if (!mediaUrls || mediaUrls.length === 0) {
      console.log('📝 No media, posting text-only...');
      const postData = {
        author: `urn:li:person:${account.platformUserId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory: "NONE"
          }
        },
        visibility: { 
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" 
        }
      };

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        postData,
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ LinkedIn Text Post Success! ID: ${response.data.id}`);
      return { 
        success: true, 
        platformPostId: response.data.id,
        hasMedia: false 
      };
    }
    
    // WITH MEDIA - LinkedIn requires registration and upload
    console.log(`📸 Processing ${mediaUrls.length} media files for LinkedIn`);
    let mediaAssets = [];
    
    for (let i = 0; i < Math.min(mediaUrls.length, 9); i++) {
      try {
        const mediaUrl = mediaUrls[i];
        const fileName = mediaUrl.split('/').pop();
        const localPath = path.join(__dirname, '../../uploads/drafts', fileName);
        
        if (!fs.existsSync(localPath)) {
          console.error(`❌ File not found: ${localPath}`);
          continue;
        }
        
        console.log(`   📁 Processing file ${i + 1}: ${fileName}`);
        
        // Read the file
        const fileBuffer = fs.readFileSync(localPath);
        
        // Get mime type
        const mimeType = fileName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        
        // Step 1: Register the upload with LinkedIn
        console.log(`   🔄 Registering upload for asset ${i + 1}...`);
        const registerResponse = await axios.post(
          'https://api.linkedin.com/v2/assets?action=registerUpload',
          {
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: `urn:li:person:${account.platformUserId}`,
              serviceRelationships: [{
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent"
              }]
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${account.accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
              'Content-Type': 'application/json'
            }
          }
        );
        
        const uploadUrl = registerResponse.data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;
        const asset = registerResponse.data.value.asset;
        
        console.log(`   ✅ Registered! Asset: ${asset}`);
        
        // Step 2: Upload the image to the provided URL
        console.log(`   📤 Uploading image to LinkedIn...`);
        await axios.post(uploadUrl, fileBuffer, {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'Content-Type': mimeType
          }
        });
        
        console.log(`   ✅ Uploaded image ${i + 1} successfully!`);
        
        // Add the asset URN to mediaAssets
        mediaAssets.push({
          status: "READY",
          description: { text: "Shared from LinkHub" },
          media: asset,
          title: { text: `LinkHub Post - Image ${i + 1}` }
        });
        
      } catch (mediaError) {
        console.error(`   ❌ Media upload error for file ${i + 1}:`, 
          mediaError.response?.data || mediaError.message);
      }
    }
    
    // Check if any media uploaded successfully
    if (mediaAssets.length === 0) {
      console.log('⚠️ No media uploaded successfully, falling back to text-only...');
      // Fall back to text-only post
      const postData = {
        author: `urn:li:person:${account.platformUserId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory: "NONE"
          }
        },
        visibility: { 
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" 
        }
      };

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        postData,
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ LinkedIn Text Post Success (fallback)! ID: ${response.data.id}`);
      return { 
        success: true, 
        platformPostId: response.data.id,
        hasMedia: false,
        fallback: true 
      };
    }
    
    // Step 3: Create the post with media
    console.log(`📤 Creating LinkedIn post with ${mediaAssets.length} image(s)...`);
    const postData = {
      author: `urn:li:person:${account.platformUserId}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content },
          shareMediaCategory: "IMAGE",
          media: mediaAssets
        }
      },
      visibility: { 
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" 
      }
    };

    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      postData,
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ LinkedIn Post with Media Success! ID: ${response.data.id}`);
    return { 
      success: true, 
      platformPostId: response.data.id,
      hasMedia: true,
      mediaCount: mediaAssets.length 
    };
    
  } catch (err) {
    console.error('❌ LinkedIn Publish Error:', err.response?.data || err.message);
    
    // Last resort - try text-only if everything else fails
    try {
      console.log('⚠️ Error occurred, trying text-only fallback...');
      const postData = {
        author: `urn:li:person:${account.platformUserId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: content },
            shareMediaCategory: "NONE"
          }
        },
        visibility: { 
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" 
        }
      };

      const response = await axios.post(
        'https://api.linkedin.com/v2/ugcPosts',
        postData,
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ LinkedIn Text Post Success (error fallback)! ID: ${response.data.id}`);
      return { 
        success: true, 
        platformPostId: response.data.id,
        hasMedia: false,
        fallback: true 
      };
    } catch (fallbackError) {
      console.error('❌ LinkedIn Text Fallback Also Failed:', fallbackError.message);
      return { 
        success: false, 
        error: err.response?.data?.message || err.message 
      };
    }
  }
};
// Add this function to register LinkedIn post
exports.registerLinkedInPost = async (req, res) => {
  try {
    const { accessToken } = req.body;
    const userId = req.user.userId;
    
    // Register user's intent to post (required for LinkedIn)
    const registerResponse = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: `urn:li:person:${userId}`,
          serviceRelationships: [{
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent"
          }]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      }
    );
    
    res.json({
      success: true,
      uploadUrl: registerResponse.data.value.uploadUrl,
      asset: registerResponse.data.value.asset
    });
    
  } catch (error) {
    console.error('❌ LinkedIn registration error:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to register LinkedIn post' 
    });
  }
};
exports.saveSocialToken = async (req, res) => {
  try {
    const { token, state } = req.body;
    const userId = req.user.userId;
    const pagesRes = await axios.get(`https://graph.facebook.com/v24.0/me/accounts`, {
      params: { 
        access_token: token,
        fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}' 
      }
    });
    const pages = pagesRes.data.data;
    const connections = [];
    for (const page of pages) {
      const pageConn = await prisma.socialConnection.upsert({
        where: { userId_platform_platformUserId: {userId: parseInt(userId),
                platform: 'facebook',
                platformUserId: page.id } },
        update: { accessToken: page.access_token,
            accountName: page.name,
            isConnected: true,
            profilePicture: page.picture?.data?.url,
            updatedAt: new Date() },
        create: { userId: parseInt(userId),
            platform: 'facebook',
            platformUserId: page.id,
            accountName: page.name,
            accessToken: page.access_token,
            profilePicture: page.picture?.data?.url,
            isConnected: true }
      });
      connections.push(pageConn);
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        const igConn = await prisma.socialConnection.upsert({
          where: { userId_platform_platformUserId: { userId, platform: 'instagram', platformUserId: ig.id } },
          update: { accessToken: page.access_token, isConnected: true, accountName: ig.username, profilePicture: ig.profile_picture_url },
          create: { userId, platform: 'instagram', platformUserId: ig.id, accountName: ig.username, accessToken: page.access_token, isConnected: true, profilePicture: ig.profile_picture_url }
        });
        connections.push(igConn);
      }
    }
    res.json({ success: true, message: 'Accounts linked successfully', accountsFound: connections.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
exports.facebookCallback = async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError || !code) {
      console.error('❌ OAuth error or no code:', oauthError);
      return res.redirect(`${process.env.FRONTEND_URL}/profile?error=facebook_failed`);
    }

    // Retrieve userId from state map
    const stateData = oauthStates.get(state);
    
    if (!stateData) {
      console.error('❌ Invalid or expired state parameter');
      return res.redirect(`${process.env.FRONTEND_URL}/profile?error=invalid_state`);
    }
    
    const { userId, platform, timestamp } = stateData;
    
    // Clean up state from memory
    oauthStates.delete(state);

    // Check if state is not too old (optional security check)
    if (Date.now() - timestamp > 10 * 60 * 1000) { // 10 minutes
      console.error('❌ State parameter expired');
      return res.redirect(`${process.env.FRONTEND_URL}/profile?error=state_expired`);
    }

    console.log(`🔄 Exchanging code for access token for user ${userId}`);

    // Exchange authorization code for access token
    const tokenResponse = await axios.get(`https://graph.facebook.com/v24.0/oauth/access_token`, {
      params: {
        client_id: process.env.FB_APP_ID,
        client_secret: process.env.FB_APP_SECRET,
        redirect_uri: process.env.FB_REDIRECT_URI,
        code: code
      }
    });

    const userAccessToken = tokenResponse.data.access_token;
    console.log(`✅ Got access token for user ${userId}`);

    // Fetch Facebook Pages and linked Instagram Business accounts
    const pagesResponse = await axios.get(`https://graph.facebook.com/v24.0/me/accounts`, {
      params: {
        access_token: userAccessToken,
        fields: 'id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}'
      }
    });

    const pages = pagesResponse.data.data || [];
    
    console.log(`📊 Found ${pages.length} Facebook pages for user ${userId}`);
    
    let primaryFBName = null;
    let primaryIGName = null;

    for (const page of pages) {
      if (!primaryFBName) primaryFBName = page.name;

      // Upsert Facebook Page connection
      await prisma.socialConnection.upsert({
        where: {
          userId_platform_platformUserId: {
            userId: parseInt(userId),
            platform: 'facebook',
            platformUserId: page.id
          }
        },
        update: {
          accessToken: page.access_token,
          accountName: page.name,
          isConnected: true,
          profilePicture: page.picture?.data?.url,
          updatedAt: new Date()
        },
        create: {
          userId: parseInt(userId),
          platform: 'facebook',
          platformUserId: page.id,
          accountName: page.name,
          accessToken: page.access_token,
          isConnected: true,
          profilePicture: page.picture?.data?.url
        }
      });

      console.log(`✅ Connected Facebook page: ${page.name}`);

      // Upsert Instagram connection if linked to the page
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        if (!primaryIGName) primaryIGName = ig.username;

        await prisma.socialConnection.upsert({
          where: {
            userId_platform_platformUserId: {
              userId: parseInt(userId),
              platform: 'instagram',
              platformUserId: ig.id
            }
          },
          update: {
            accessToken: page.access_token,
            accountName: ig.username,
            isConnected: true,
            profilePicture: ig.profile_picture_url,
            updatedAt: new Date()
          },
          create: {
            userId: parseInt(userId),
            platform: 'instagram',
            platformUserId: ig.id,
            accountName: ig.username,
            accessToken: page.access_token,
            isConnected: true,
            profilePicture: ig.profile_picture_url
          }
        });

        console.log(`✅ Connected Instagram account: ${ig.username}`);
      }
    }

    // Sync findings back to the main User table
    if (primaryFBName || primaryIGName) {
      await prisma.user.update({
        where: { id: parseInt(userId) },
        data: {
          facebook: primaryFBName || undefined,
          instagram: primaryIGName || undefined
        }
      });
    }

    console.log(`✅ OAuth flow completed successfully for user ${userId}`);
    res.redirect(`${process.env.FRONTEND_URL}/profile?success=facebook_connected`);

  } catch (error) {
    console.error('❌ Facebook callback error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/profile?error=facebook_failed`);
  }
};

exports.disconnectAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const account = await prisma.socialConnection.findFirst({
      where: { id: parseInt(id), userId }
    });
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    } 
    await prisma.socialConnection.update({
      where: { id: parseInt(id) },
      data: { isConnected: false }
    });
    res.json({ success: true, message: 'Account disconnected' });
  } catch (error) {
    console.error('Error disconnecting account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
// //this was working
// exports.publishToSocialMedia = async (req, res = null) => {
//   try {
//     const draftId = Number(req.params?.draftId || req.body?.draftId);
//     let socialAccountIds = req.body?.socialAccountIds || [];

//     const draft = await prisma.draft.findUnique({
//       where: { id: draftId },
//       include: { publishedPosts: true }
//     });

//     if (!draft) {
//       if (res) return res.status(404).json({ success: false, error: 'Draft not found' });
//       throw new Error('Draft not found');
//     }

//     const postContent = draft.masterContent || ""; 
//     const mediaUrls = draft.mediaUrls || [];

//     const accounts = await prisma.socialConnection.findMany({
//       where: { id: { in: socialAccountIds.map(id => parseInt(id)) } }
//     });

//     console.log(`⚡ Publishing draft ${draftId} to ${accounts.length} accounts`);
//     let successCount = 0;

//     for (const account of accounts) {
//       let result;
//       const platformName = account.platform.toUpperCase();

//       // 1. ROUTING TO PLATFORMS
//       if (platformName === 'FACEBOOK') {
//         result = await exports.publishToFacebook(account, postContent, mediaUrls);
//       } else if (platformName === 'INSTAGRAM') {
//         result = await exports.publishToInstagram(account, postContent, mediaUrls);
//       } else if (platformName === 'TWITTER') {
//         result = await exports.publishToTwitter(account, postContent, mediaUrls, draft.id);
//       } 
// else if (platformName === 'LINKEDIN') {
//   console.log(`🔗 Publishing to LinkedIn account: ${account.accountName}`);
//   result = await exports.publishToLinkedIn(account, postContent, mediaUrls);
  
//   // Save LinkedIn post to database
//   if (result?.success) {
//     successCount++;
    
//     await prisma.publishedPost.create({
//       data: {
//         draftId: draft.id,
//         socialAccountId: account.id,
//         platformPostId: String(result.platformPostId),
//         status: 'PUBLISHED',
//         publishedAt: new Date(),
//         metadata: {
//           hasMedia: result.hasMedia || false,
//           mediaCount: mediaUrls?.length || 0
//         }
//       }
//     });
//   }
// }

//       // 2. HANDLING RESULTS
//     // 2. HANDLING RESULTS
// if (result?.success) {
//   // Increment successCount for BOTH real and simulated successes
//   successCount++;

//   // Only create publishedPost record here for FB/IG/LinkedIn (not Twitter)
//   // Twitter function handles its own DB creation (real or simulated).
//   if (platformName !== 'TWITTER' && !result.simulated) {
//     // Check if record already exists to avoid duplicate constraint
//     const existingPost = await prisma.publishedPost.findUnique({
//       where: {
//         draftId_socialAccountId: {
//           draftId: draft.id,
//           socialAccountId: account.id
//         }
//       }
//     });

//     if (!existingPost) {
//       await prisma.publishedPost.create({
//         data: {
//           draftId: draft.id,
//           socialAccountId: account.id,
//           platformPostId: String(result.platformPostId),
//           status: 'PUBLISHED',
//           publishedAt: new Date()
//         }
//       });
//       console.log(`✅ Created published post record for ${platformName}`);
//     } else {
//       // Update existing record
//       await prisma.publishedPost.update({
//         where: {
//           draftId_socialAccountId: {
//             draftId: draft.id,
//             socialAccountId: account.id
//           }
//         },
//         data: {
//           platformPostId: String(result.platformPostId),
//           status: 'PUBLISHED',
//           publishedAt: new Date()
//         }
//       });
//       console.log(`🔄 Updated existing published post record for ${platformName}`);
//     }
//   }
// }else {
//         console.error(`❌ Failed to publish to ${account.platform}:`, result?.error);
//       }
//     }

//     // 3. UPDATE MAIN DRAFT STATUS
//   // 3. UPDATE MAIN DRAFT STATUS
// if (successCount > 0) {
//   await prisma.draft.update({
//     where: { id: draftId },
//     data: { 
//       status: 'PUBLISHED',
//       publishedId: String(new Date().getTime())
//     }
//   });

//   // ============ 📧 SEND PUBLISHED EMAIL NOTIFICATION ============
//   try {
//     // Get draft with user details
//     const publishedDraft = await prisma.draft.findUnique({
//       where: { id: draftId },
//       include: { 
//         user: {
//           select: { email: true, name: true }
//         } 
//       }
//     });

//     if (publishedDraft?.user?.email) {
//       const userEmail = publishedDraft.user.email;
//       const userName = publishedDraft.user.name || userEmail.split('@')[0];
      
//       // Get platform names for the email
//       const platformNames = accounts.map(a => 
//         a.platform.charAt(0).toUpperCase() + a.platform.slice(1)
//       ).join(', ');

//       // Create transporter (same as in sendEmail.js)
//       const nodemailer = require('nodemailer');
//       const transporter = nodemailer.createTransport({
//         host: 'smtp.gmail.com',
//         port: 587,
//         secure: false,
//         auth: {
//           user: process.env.EMAIL_USER,
//           pass: process.env.EMAIL_PASS
//         },
//         tls: { rejectUnauthorized: false }
//       });

//       const mailOptions = {
//         from: `"LinkHub FYP" <${process.env.EMAIL_USER}>`,
//         to: userEmail,
//         subject: '🎉 Your Post Has Been Published!',
//         html: `
//           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f4f4f4; border-radius: 10px;">
//             <div style="text-align: center; margin-bottom: 20px;">
//               <h2 style="color: #3b82f6;">Published Successfully! 🚀</h2>
//             </div>
            
//             <p style="font-size: 16px; line-height: 1.6; color: #333;">Hello <strong>${userName}</strong>,</p>
            
//             <p style="font-size: 16px; line-height: 1.6; color: #333;">Your post has been successfully published to your social media accounts!</p>
            
//             <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
//               <p style="margin: 0 0 10px 0; font-weight: bold; color: #0369a1;">📢 Published to:</p>
//               <p style="margin: 0; color: #333;">${platformNames}</p>
//             </div>
            
//             <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
//               <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">📄 Your published content:</p>
//               <p style="margin: 0; font-style: italic; color: #555;">"${publishedDraft.masterContent.substring(0, 150)}${publishedDraft.masterContent.length > 150 ? '...' : ''}"</p>
//             </div>
            
//             <p style="font-size: 16px; line-height: 1.6; color: #333;">
//               <strong>📊 Want to see how your post is performing?</strong> Check your analytics dashboard for engagement metrics.
//             </p>
            
//             <div style="text-align: center; margin: 30px 0;">
//               <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/analytics" 
//                  style="background-color: #10b981; color: white; padding: 12px 30px; 
//                         text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
//                 View Analytics
//               </a>
//               <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/my-drafts" 
//                  style="background-color: #f3f4f6; color: #333; padding: 12px 30px; 
//                         text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-left: 10px;">
//                 My Posts
//               </a>
//             </div>
            
//             <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 20px;">
//             <p style="font-size: 12px; color: #777; text-align: center; margin-bottom: 0;">
//               This is an automated message from LinkHub. Please do not reply to this email.<br>
//               © ${new Date().getFullYear()} LinkHub. All rights reserved.
//             </p>
//           </div>
//         `
//       };

//       await transporter.sendMail(mailOptions);
//       console.log(`📧 Published email sent to ${userEmail}`);
//     }
//   } catch (emailError) {
//     console.error('❌ Failed to send published email:', emailError.message);
//   }
// }
//     console.log(`✅ Final Result: Published draft ${draftId} to ${successCount} accounts (including simulations)`);

//     if (res && typeof res.json === 'function') {
//       return res.json({ 
//         success: true, 
//         message: `Successfully published to ${successCount} out of ${accounts.length} accounts.` 
//       });
//     }
    
//     return { success: true, count: successCount };

//   } catch (error) {
//     console.error('❌ Global Publish Error:', error);
//     if (res && typeof res.status === 'function') {
//       return res.status(500).json({ success: false, error: error.message });
//     }
//     throw error; 
//   }
// };

exports.publishToSocialMedia = async (req, res = null) => {
  try {
    const draftId = Number(req.params?.draftId || req.body?.draftId);
    let socialAccountIds = req.body?.socialAccountIds || [];

    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      include: { publishedPosts: true }
    });

    if (!draft) {
      if (res) return res.status(404).json({ success: false, error: 'Draft not found' });
      throw new Error('Draft not found');
    }

    const postContent = draft.masterContent || ""; 
    const mediaUrls = draft.mediaUrls || [];

    const accounts = await prisma.socialConnection.findMany({
      where: { id: { in: socialAccountIds.map(id => parseInt(id)) } }
    });

    console.log(`⚡ Publishing draft ${draftId} to ${accounts.length} accounts`);
    let successCount = 0;
    const publishedResults = [];

    for (const account of accounts) {
      let result;
      const platformName = account.platform.toUpperCase();

      // 1. ROUTING TO PLATFORMS
      try {
        if (platformName === 'FACEBOOK') {
          result = await exports.publishToFacebook(account, postContent, mediaUrls);
        } else if (platformName === 'INSTAGRAM') {
          result = await exports.publishToInstagram(account, postContent, mediaUrls);
        } else if (platformName === 'TWITTER') {
          result = await exports.publishToTwitter(account, postContent, mediaUrls, draft.id);
        } else if (platformName === 'LINKEDIN') {
          console.log(`🔗 Publishing to LinkedIn account: ${account.accountName}`);
          result = await exports.publishToLinkedIn(account, postContent, mediaUrls);
        } else {
          console.log(`⚠️ Unknown platform: ${platformName}`);
          result = { success: false, error: `Unknown platform: ${platformName}` };
        }
      } catch (platformError) {
        console.error(`❌ Error in ${platformName} publishing:`, platformError);
        result = { success: false, error: platformError.message };
      }

      // 2. HANDLE PUBLISHING RESULTS
      if (result?.success) {
        successCount++;
        
        // Get platform-specific metrics or initialize with zeros
        let metrics = {};
        
        if (platformName === 'FACEBOOK') {
          metrics = {
            likes: 0,
            comments: 0,
            shares: 0,
            reach: 0,
            ...(result.metrics || {})
          };
        } else if (platformName === 'INSTAGRAM') {
          metrics = {
            likes: 0,
            comments: 0,
            shares: 0,
            reach: 0,
            ...(result.metrics || {})
          };
        } else if (platformName === 'TWITTER') {
          metrics = {
            likes: 0,
            retweets: 0,
            replies: 0,
            ...(result.metrics || {})
          };
        } else if (platformName === 'LINKEDIN') {
          metrics = {
            likes: 0,
            comments: 0,
            shares: 0,
            ...(result.metrics || {})
          };
        }

        // Create metadata object
        const metadata = {
          platform: account.platform,
          url: result.url || null,
          hasMedia: result.hasMedia || (mediaUrls && mediaUrls.length > 0) || false,
          mediaCount: mediaUrls?.length || 0,
          publishedAt: new Date().toISOString(),
          method: result.method || 'direct',
          simulated: result.simulated || false
        };

        // Add any platform-specific metadata
        if (result.metadata) {
          Object.assign(metadata, result.metadata);
        }

        // Check if record already exists to avoid duplicate constraint
        const existingPost = await prisma.publishedPost.findUnique({
          where: {
            draftId_socialAccountId: {
              draftId: draft.id,
              socialAccountId: account.id
            }
          }
        });

        if (!existingPost) {
          // Create new published post record WITH METRICS
          await prisma.publishedPost.create({
            data: {
              draftId: draft.id,
              socialAccountId: account.id,
              platformPostId: String(result.platformPostId || result.id || `sim_${Date.now()}`),
              status: 'published',
              publishedAt: new Date(),
              metrics: metrics,
              metadata: metadata
            }
          });
          console.log(`✅ Created published post record for ${platformName} with metrics:`, metrics);
        } else {
          // Update existing record with new metrics and post ID
          await prisma.publishedPost.update({
            where: {
              draftId_socialAccountId: {
                draftId: draft.id,
                socialAccountId: account.id
              }
            },
            data: {
              platformPostId: String(result.platformPostId || result.id || existingPost.platformPostId),
              status: 'published',
              publishedAt: new Date(),
              metrics: metrics,
              metadata: metadata
            }
          });
          console.log(`🔄 Updated existing published post record for ${platformName} with metrics:`, metrics);
        }

        // Store result for response
        publishedResults.push({
          platform: account.platform,
          accountName: account.accountName,
          success: true,
          platformPostId: result.platformPostId,
          metrics: metrics,
          url: result.url
        });

      } else {
        console.error(`❌ Failed to publish to ${account.platform}:`, result?.error || 'Unknown error');
        
        // Store failed result
        publishedResults.push({
          platform: account.platform,
          accountName: account.accountName,
          success: false,
          error: result?.error || 'Publishing failed'
        });
      }
    }

    // 3. UPDATE MAIN DRAFT STATUS
    if (successCount > 0) {
      await prisma.draft.update({
        where: { id: draftId },
        data: { 
          status: 'PUBLISHED',
          publishedId: String(new Date().getTime())
        }
      });

      // ============ 📧 SEND PUBLISHED EMAIL NOTIFICATION ============
      try {
        // Get draft with user details
        const publishedDraft = await prisma.draft.findUnique({
          where: { id: draftId },
          include: { 
            user: {
              select: { email: true, name: true }
            } 
          }
        });

        if (publishedDraft?.user?.email) {
          const userEmail = publishedDraft.user.email;
          const userName = publishedDraft.user.name || userEmail.split('@')[0];
          
          // Get platform names for the email
          const platformNames = accounts.map(a => 
            a.platform.charAt(0).toUpperCase() + a.platform.slice(1)
          ).join(', ');

          // Create transporter
          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            },
            tls: { rejectUnauthorized: false }
          });

          const mailOptions = {
            from: `"LinkHub FYP" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: '🎉 Your Post Has Been Published!',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f4f4f4; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h2 style="color: #3b82f6;">Published Successfully! 🚀</h2>
                </div>
                
                <p style="font-size: 16px; line-height: 1.6; color: #333;">Hello <strong>${userName}</strong>,</p>
                
                <p style="font-size: 16px; line-height: 1.6; color: #333;">Your post has been successfully published to your social media accounts!</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                  <p style="margin: 0 0 10px 0; font-weight: bold; color: #0369a1;">📢 Published to:</p>
                  <p style="margin: 0; color: #333;">${platformNames}</p>
                </div>
                
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">📄 Your published content:</p>
                  <p style="margin: 0; font-style: italic; color: #555;">"${publishedDraft.masterContent.substring(0, 150)}${publishedDraft.masterContent.length > 150 ? '...' : ''}"</p>
                </div>
                
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                  <strong>📊 Want to see how your post is performing?</strong> Check your analytics dashboard for engagement metrics.
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/analytics" 
                     style="background-color: #10b981; color: white; padding: 12px 30px; 
                            text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    View Analytics
                  </a>
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/my-drafts" 
                     style="background-color: #f3f4f6; color: #333; padding: 12px 30px; 
                            text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-left: 10px;">
                    My Posts
                  </a>
                </div>
                
                <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 20px;">
                <p style="font-size: 12px; color: #777; text-align: center; margin-bottom: 0;">
                  This is an automated message from LinkHub. Please do not reply to this email.<br>
                  © ${new Date().getFullYear()} LinkHub. All rights reserved.
                </p>
              </div>
            `
          };

          await transporter.sendMail(mailOptions);
          console.log(`📧 Published email sent to ${userEmail}`);
        }
      } catch (emailError) {
        console.error('❌ Failed to send published email:', emailError.message);
      }
    }
    
    console.log(`✅ Final Result: Published draft ${draftId} to ${successCount} out of ${accounts.length} accounts`);

    if (res && typeof res.json === 'function') {
      return res.json({ 
        success: true, 
        message: `Successfully published to ${successCount} out of ${accounts.length} accounts.`,
        results: publishedResults
      });
    }
    
    return { success: true, count: successCount, results: publishedResults };

  } catch (error) {
    console.error('❌ Global Publish Error:', error);
    if (res && typeof res.status === 'function') {
      return res.status(500).json({ success: false, error: error.message });
    }
    throw error; 
  }
};
// LinkedIn webhook handler
exports.linkedInWebhook = async (req, res) => {
  try {
    const { event, postUrn, authorUrn, status } = req.body;
    
    if (event === 'POST_CREATED' || event === 'POST_UPDATED') {
      // Find the post in your database and update status
      const postUrnParts = postUrn.split(':');
      const platformPostId = postUrnParts[postUrnParts.length - 1];
      
      await prisma.publishedPost.updateMany({
        where: { platformPostId: String(platformPostId) },
        data: {
          status: status === 'PUBLISHED' ? 'PUBLISHED' : 'FAILED',
          updatedAt: new Date()
        }
      });
      
      console.log(`✅ LinkedIn webhook: Post ${platformPostId} status updated to ${status}`);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('LinkedIn webhook error:', error);
    res.status(500).send('Error');
  }
};
// // this was running
// exports.publishToInstagram = async (account, content, mediaUrls) => {
//   try {
//     console.log(`📤 Instagram Publish Started for: ${account.accountName}`);
//     const fileName = mediaUrls[0].split('/').pop();
//     const localPath = path.join(__dirname, '../../uploads/drafts', fileName);

//     // Check if file actually exists before trying to upload
//     if (!fs.existsSync(localPath)) {
//       throw new Error(`File not found at: ${localPath}`);
//     }

//     // 2. Upload to Cloudinary (The Bridge)
//     console.log("☁️ Uploading local file to Cloudinary...");
//     const uploadRes = await cloudinary.uploader.upload(localPath, {
//       folder: 'linkhub_instagram',
//       resource_type: 'auto' // Supports jpg, png, and even video
//     });
    
//     const secureUrl = uploadRes.secure_url;
//     console.log(`✅ Cloudinary URL generated: ${secureUrl}`);

//     // 3. Create Instagram Media Container
//     console.log("📦 Creating Instagram media container...");
//     const container = await axios.post(
//       `https://graph.facebook.com/v16.0/${account.platformUserId}/media`,
//       {
//         image_url: secureUrl,
//         caption: content,
//         access_token: account.accessToken
//       }
//     );

//     const containerId = container.data.id;

//     // 4. Wait for Instagram to process the image
//     let status = 'IN_PROGRESS';
//     let attempts = 0;
//     while (status !== 'FINISHED' && attempts < 10) {
//       attempts++;
//       await new Promise(res => setTimeout(res, 5000)); // Wait 5 seconds
      
//       const check = await axios.get(`https://graph.facebook.com/v16.0/${containerId}`, {
//         params: { fields: 'status_code', access_token: account.accessToken }
//       });
      
//       status = check.data.status_code;
//       console.log(`🔄 Processing status: ${status} (Attempt ${attempts})`);
      
//       if (status === 'ERROR') throw new Error("Instagram rejected the image processing.");
//     }

//     // 5. Final Publish
//     console.log("🚀 Publishing to Feed...");
//     const publish = await axios.post(
//       `https://graph.facebook.com/v16.0/${account.platformUserId}/media_publish`,
//       {
//         creation_id: containerId,
//         access_token: account.accessToken
//       }
//     );

//     console.log(`✅ Instagram Success! Post ID: ${publish.data.id}`);
//     return { success: true, platformPostId: publish.data.id };

//   } catch (err) {
//     const errorMsg = err.response?.data?.error?.message || err.message;
//     console.error('❌ IG Final Error:', errorMsg);
//     return { success: false, error: errorMsg };
//   }
// };
// // this was running
// exports.publishToFacebook = async (account, content, mediaUrls) => {
//   try {
//     console.log(`📤 Facebook Publish Started for: ${account.accountName}`);
    
//     // 1. Get local file path
//     const fileName = mediaUrls[0].split('/').pop();
//     const localPath = path.join(__dirname, '../../uploads/drafts', fileName);

//     // 2. Upload to Cloudinary for a public URL
//     console.log("☁️ Uploading to Cloudinary for Facebook...");
//     const uploadRes = await cloudinary.uploader.upload(localPath, {
//       folder: 'linkhub_facebook'
//     });

//     // 3. Post to Facebook Page using the Cloudinary URL
//     const response = await axios.post(
//       `https://graph.facebook.com/v24.0/${account.platformUserId}/photos`,
//       {
//         url: uploadRes.secure_url,
//         caption: content,
//         access_token: account.accessToken
//       }
//     );

//     console.log(`✅ Facebook Success! Post ID: ${response.data.id}`);
//     return { success: true, platformPostId: response.data.id };

//   } catch (err) {
//     const errorMsg = err.response?.data?.error?.message || err.message;
//     console.error('❌ Facebook Error:', errorMsg);
//     return { success: false, error: errorMsg };
//   }
// };

// For Facebook - update the return object in publishToFacebook
exports.publishToFacebook = async (account, content, mediaUrls) => {
  try {
    console.log(`📤 Facebook Publish Started for: ${account.accountName}`);
    
    const fileName = mediaUrls[0].split('/').pop();
    const localPath = path.join(__dirname, '../../uploads/drafts', fileName);

    console.log("☁️ Uploading to Cloudinary for Facebook...");
    const uploadRes = await cloudinary.uploader.upload(localPath, {
      folder: 'linkhub_facebook'
    });

    const response = await axios.post(
      `https://graph.facebook.com/v24.0/${account.platformUserId}/photos`,
      {
        url: uploadRes.secure_url,
        caption: content,
        access_token: account.accessToken
      }
    );

    console.log(`✅ Facebook Success! Post ID: ${response.data.id}`);
    
    // Return WITH METRICS
    return { 
      success: true, 
      platformPostId: response.data.id,
      metrics: {  // 👈 Add this
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0
      }
    };

  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error('❌ Facebook Error:', errorMsg);
    return { success: false, error: errorMsg };
  }
};

// For Instagram - update the return object in publishToInstagram
exports.publishToInstagram = async (account, content, mediaUrls) => {
  try {
    console.log(`📤 Instagram Publish Started for: ${account.accountName}`);
    const fileName = mediaUrls[0].split('/').pop();
    const localPath = path.join(__dirname, '../../uploads/drafts', fileName);

    if (!fs.existsSync(localPath)) {
      throw new Error(`File not found at: ${localPath}`);
    }

    console.log("☁️ Uploading local file to Cloudinary...");
    const uploadRes = await cloudinary.uploader.upload(localPath, {
      folder: 'linkhub_instagram',
      resource_type: 'auto'
    });
    
    const secureUrl = uploadRes.secure_url;

    console.log("📦 Creating Instagram media container...");
    const container = await axios.post(
      `https://graph.facebook.com/v16.0/${account.platformUserId}/media`,
      {
        image_url: secureUrl,
        caption: content,
        access_token: account.accessToken
      }
    );

    const containerId = container.data.id;

    // Wait for processing
    let status = 'IN_PROGRESS';
    let attempts = 0;
    while (status !== 'FINISHED' && attempts < 10) {
      attempts++;
      await new Promise(res => setTimeout(res, 5000));
      
      const check = await axios.get(`https://graph.facebook.com/v16.0/${containerId}`, {
        params: { fields: 'status_code', access_token: account.accessToken }
      });
      
      status = check.data.status_code;
      console.log(`🔄 Processing status: ${status} (Attempt ${attempts})`);
      
      if (status === 'ERROR') throw new Error("Instagram rejected the image processing.");
    }

    console.log("🚀 Publishing to Feed...");
    const publish = await axios.post(
      `https://graph.facebook.com/v16.0/${account.platformUserId}/media_publish`,
      {
        creation_id: containerId,
        access_token: account.accessToken
      }
    );

    console.log(`✅ Instagram Success! Post ID: ${publish.data.id}`);
    
    // Return WITH METRICS
    return { 
      success: true, 
      platformPostId: publish.data.id,
      metrics: {  // 👈 Add this
        likes: 0,
        comments: 0,
        shares: 0,
        reach: 0
      }
    };

  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error('❌ IG Final Error:', errorMsg);
    return { success: false, error: errorMsg };
  }
};
async function checkTunnelStatus() {
  try {
    const response = await axios.get('https://linkhub-backend.loca.lt/health', {
      timeout: 5000
    });
    return response.data.status === 'healthy';
  } catch (error) {
    console.error('❌ Tunnel not accessible:', error.message);
    return false;
  }
}



exports.publishToTwitter = async (account, content, mediaUrls, draftId = null) => {
  try {
    console.log(`🐦 Publishing to Twitter: @${account.accountName}`);
    
    // Use OAuth 1.0a for reliable media upload
    if (process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN) {
      console.log('🔑 Using OAuth 1.0a for posting...');
      return await publishWithOAuth1a(content, mediaUrls, draftId, account);
    }
    
    // Fallback to OAuth 2.0 (text only)
    console.log('⚠️ Using OAuth 2.0 (text-only, no media)...');
    return await publishTextOnlyWithOAuth2(account, content, draftId);
    
  } catch (error) {
    console.error('❌ Twitter publishing failed:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
};

async function publishTextOnlyWithOAuth2(account, content, draftId) {
  try {
    // First, ensure token is fresh
    const freshAccount = await ensureFreshTwitterToken(account);
    if (!freshAccount) {
      throw new Error('Failed to refresh Twitter token');
    }
    
    const tweetText = content.slice(0, 280);
    
    // Post text-only tweet with OAuth 2.0
    const response = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: tweetText },
      {
        headers: {
          'Authorization': `Bearer ${freshAccount.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const tweetId = response.data.data.id;
    console.log(`✅ Text-only tweet published via OAuth 2.0! ID: ${tweetId}`);
    
    // Save to database
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetId),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'oauth2_text_only',
            note: 'Media not supported with current OAuth 2.0 setup'
          }
        }
      });
    }
    
    return { 
      success: true, 
      platformPostId: tweetId,
      hasMedia: false
    };
    
  } catch (error) {
    console.error('❌ OAuth 2.0 text-only failed:', error.message);
    throw error;
  }
}



async function publishWithOAuth1a(content, mediaUrls, draftId, account) {
  try {
    const { TwitterApi } = require('twitter-api-v2');
    
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    // Add unique identifier to avoid duplicate content errors
    const uniqueSuffix = ` #${Date.now().toString().slice(-6)}`;
    const tweetText = (content + uniqueSuffix).slice(0, 280);
    console.log(`📝 Tweet (${tweetText.length}/280): ${tweetText.substring(0, 50)}...`);
    
    let mediaIds = [];
    
    // Upload media if present
    if (mediaUrls && mediaUrls.length > 0) {
      console.log(`📸 Uploading ${Math.min(mediaUrls.length, 4)} media files...`);
      
      for (let i = 0; i < Math.min(mediaUrls.length, 4); i++) {
        try {
          const mediaUrl = mediaUrls[i];
          console.log(`   ${i + 1}/${Math.min(mediaUrls.length, 4)}: ${mediaUrl}`);
          
          // Extract filename from URL
          const filename = mediaUrl.split('/').pop();
          console.log(`   Extracted filename: ${filename}`);
          
          // Build local path
          const localPath = path.join(__dirname, '../../uploads/drafts', filename);
          console.log(`   Local path: ${localPath}`);
          
          // Check if file exists locally
          if (fs.existsSync(localPath)) {
            console.log(`   ✅ File exists locally!`);
            
            // Read the file directly
            const imageBuffer = fs.readFileSync(localPath);
            console.log(`   ✅ Read ${imageBuffer.length} bytes from local file`);
            
            // Get MIME type from filename
            const mimeType = getMimeType(filename);
            console.log(`   MIME type: ${mimeType}`);
            
            // Upload via OAuth 1.0a
            const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType });
            mediaIds.push(mediaId);
            console.log(`   ✅ Media uploaded to Twitter: ${mediaId}`);
            
          } else {
            console.log(`   ❌ Local file not found: ${localPath}`);
            
            // Try to find the file by listing directory
            const uploadsDir = path.join(__dirname, '../../uploads/drafts');
            if (fs.existsSync(uploadsDir)) {
              const files = fs.readdirSync(uploadsDir);
              console.log(`   Files in uploads directory:`, files);
              
              // Try to find a matching file
              const matchingFile = files.find(f => f.includes(filename.split('-').pop()));
              if (matchingFile) {
                console.log(`   Found similar file: ${matchingFile}`);
                const altPath = path.join(uploadsDir, matchingFile);
                const imageBuffer = fs.readFileSync(altPath);
                const mimeType = getMimeType(matchingFile);
                const mediaId = await client.v1.uploadMedia(imageBuffer, { mimeType });
                mediaIds.push(mediaId);
                console.log(`   ✅ Media uploaded using similar file: ${mediaId}`);
              }
            }
          }
          
          // Wait between uploads (Twitter rate limits)
          if (i < Math.min(mediaUrls.length, 4) - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (mediaError) {
          console.error(`   ❌ Media upload failed:`, mediaError.message);
          console.error(`   Stack:`, mediaError.stack);
        }
      }
    }
    
    // Post tweet
    let tweetResponse;
    if (mediaIds.length > 0) {
      console.log(`🎨 Posting tweet with ${mediaIds.length} media attachments`);
      tweetResponse = await client.v2.tweet(tweetText, {
        media: { media_ids: mediaIds }
      });
    } else {
      console.log('📝 Posting text-only tweet (no media uploaded)');
      tweetResponse = await client.v2.tweet(tweetText);
    }
    
    const tweetId = tweetResponse.data.id;
    console.log(`✅ TWEET PUBLISHED! ID: ${tweetId}`);
    console.log(`🔗 https://twitter.com/${account.accountName}/status/${tweetId}`);
    
    // Save to database
    if (draftId && account) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetId),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'oauth1a',
            hasMedia: mediaIds.length > 0,
            mediaCount: mediaIds.length,
            mediaIds: mediaIds,
            url: `https://twitter.com/${account.accountName}/status/${tweetId}`,
            localFilesUsed: true
          }
        }
      });
    }
    
    return { 
      success: true, 
      platformPostId: tweetId,
      hasMedia: mediaIds.length > 0,
      mediaCount: mediaIds.length,
      tweetUrl: `https://twitter.com/${account.accountName}/status/${tweetId}`
    };
    
  } catch (error) {
    console.error('❌ OAuth 1.0a publishing failed:', error.message);
    console.error('Error details:', error.data || error);
    
    // If there's a duplicate content error, try with different content
    if (error.code === 403 && error.data?.detail?.includes('duplicate')) {
      console.log('🔄 Duplicate content detected, trying alternative...');
      try {
        const altContent = content + ` #linkhub${Date.now().toString().slice(-4)}`;
        const altTweetText = altContent.slice(0, 280);
        
        const { TwitterApi } = require('twitter-api-v2');
        const client = new TwitterApi({
          appKey: process.env.TWITTER_API_KEY,
          appSecret: process.env.TWITTER_API_SECRET,
          accessToken: process.env.TWITTER_ACCESS_TOKEN,
          accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        
        const tweetResponse = await client.v2.tweet(altTweetText);
        const tweetId = tweetResponse.data.id;
        
        console.log(`✅ Alternative tweet published: ${tweetId}`);
        
        if (draftId && account) {
          await prisma.publishedPost.create({
            data: {
              draftId: parseInt(draftId),
              socialAccountId: parseInt(account.id),
              platformPostId: String(tweetId),
              status: 'published',
              publishedAt: new Date(),
              metadata: {
                method: 'oauth1a_text_only',
                note: 'Duplicate content error, posted alternative text',
                originalError: 'Duplicate content blocked'
              }
            }
          });
        }
        
        return { 
          success: true, 
          platformPostId: tweetId,
          hasMedia: false,
          alternativeContent: true
        };
        
      } catch (altError) {
        console.error('❌ Alternative content also failed:', altError.message);
      }
    }
    
    throw error;
  }
}

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

// Add this PUBLIC debug function to socialController.js
exports.publicFileDebug = async (req, res) => {
  try {
    console.log('🔍 PUBLIC Debug: Checking file locations...');
    
    // Use a specific user ID (3 from your logs)
    const userId = 3;
    
    // Get the latest draft
    const draft = await prisma.draft.findFirst({
      where: { 
        userId: userId,
        mediaUrls: { not: null }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (!draft) {
      return res.json({ 
        success: false, 
        error: 'No draft with media found for user ' + userId 
      });
    }
    
    console.log(`📄 Found draft ID: ${draft.id}`);
    console.log(`📸 Media URLs:`, draft.mediaUrls);
    
    const mediaUrl = draft.mediaUrls[0];
    const filename = mediaUrl.split('/').pop();
    
    console.log(`🌐 Media URL: ${mediaUrl}`);
    console.log(`📝 Filename: ${filename}`);
    
    // Multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '../../uploads/drafts', filename),
      path.join(__dirname, '../../../uploads/drafts', filename),
      path.join(process.cwd(), 'uploads/drafts', filename),
      path.join('C:/linkhub2/backend/uploads/drafts', filename),
      path.join('C:/linkhub2/backend/src/uploads/drafts', filename)
    ];
    
    const results = [];
    
    for (const filePath of possiblePaths) {
      const exists = fs.existsSync(filePath);
      const size = exists ? fs.statSync(filePath).size : 0;
      results.push({
        path: filePath,
        exists: exists,
        size: size
      });
      
      console.log(`${exists ? '✅' : '❌'} ${filePath} (${size} bytes)`);
    }
    
    // Check uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/drafts');
    console.log(`📁 Checking directory: ${uploadsDir}`);
    
    let files = [];
    let dirExists = false;
    
    if (fs.existsSync(uploadsDir)) {
      dirExists = true;
      files = fs.readdirSync(uploadsDir);
      console.log(`✅ Directory exists with ${files.length} files`);
    } else {
      console.log(`❌ Directory not found: ${uploadsDir}`);
    }
    
    res.json({
      success: true,
      message: 'File debug completed',
      userId: userId,
      draftId: draft.id,
      mediaUrl: mediaUrl,
      filename: filename,
      pathsChecked: results,
      uploadsDir: {
        path: uploadsDir,
        exists: dirExists,
        fileCount: files.length,
        files: files.slice(0, 20) // First 20 files
      },
      serverInfo: {
        currentDir: __dirname,
        cwd: process.cwd()
      }
    });
    
  } catch (error) {
    console.error('Public debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
// Update the debugFileLocation function
exports.debugFileLocation = async (req, res) => {
  try {
    console.log('🔍 Debugging file locations...');
    
    let userId;
    
    // Handle both authenticated and public access
    if (req.user && req.user.userId) {
      userId = parseInt(req.user.userId);
      console.log(`👤 Authenticated user: ${userId}`);
    } else {
      // For public access, use user ID 3 (from your logs)
      userId = 3;
      console.log(`👤 Public access - using user ID: ${userId}`);
    }
    
    // Get latest draft for the user
    const draft = await prisma.draft.findFirst({
      where: { 
        userId: userId,
        mediaUrls: { not: null }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (!draft || !draft.mediaUrls || draft.mediaUrls.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No draft with media found for user ' + userId 
      });
    }
    
    const mediaUrl = draft.mediaUrls[0];
    const filename = mediaUrl.split('/').pop();
    
    console.log(`📄 Draft ID: ${draft.id}`);
    console.log(`🌐 Media URL: ${mediaUrl}`);
    console.log(`📝 Filename: ${filename}`);
    
    // Multiple possible locations
    const locations = [
      path.join(__dirname, '../../uploads/drafts', filename),
      path.join(__dirname, '../../../uploads/drafts', filename),
      path.join(process.cwd(), 'uploads/drafts', filename),
      path.join('C:/linkhub2/backend/uploads/drafts', filename)
    ];
    
    const results = [];
    
    for (const location of locations) {
      const exists = fs.existsSync(location);
      const size = exists ? fs.statSync(location).size : 0;
      results.push({
        location: location,
        exists: exists,
        size: size
      });
      
      console.log(`${exists ? '✅' : '❌'} ${location} (${size} bytes)`);
    }
    
    // List files in uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/drafts');
    let files = [];
    if (fs.existsSync(uploadsDir)) {
      files = fs.readdirSync(uploadsDir);
      console.log(`📁 Found ${files.length} files in ${uploadsDir}`);
    } else {
      console.log(`❌ Uploads directory not found: ${uploadsDir}`);
    }
    
    res.json({
      success: true,
      authenticated: !!req.user,
      userId: userId,
      draftId: draft.id,
      mediaUrl: mediaUrl,
      filename: filename,
      locations: results,
      uploadsDir: uploadsDir,
      filesInDir: files.slice(0, 20),
      fileCount: files.length
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
};
exports.debugTwitterMedia = async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking Twitter setup for media...');
    
    // Check OAuth 1.0a credentials
    const oauth1a = {
      hasApiKey: !!process.env.TWITTER_API_KEY,
      hasApiSecret: !!process.env.TWITTER_API_SECRET,
      hasAccessToken: !!process.env.TWITTER_ACCESS_TOKEN,
      hasAccessSecret: !!process.env.TWITTER_ACCESS_SECRET,
      apiKeyLength: process.env.TWITTER_API_KEY?.length || 0,
      accessTokenLength: process.env.TWITTER_ACCESS_TOKEN?.length || 0
    };
    
    console.log('OAuth 1.0a credentials:', oauth1a);
    
    // Check OAuth 2.0 credentials
    const oauth2 = {
      hasClientId: !!process.env.TWITTER_CLIENT_ID,
      hasClientSecret: !!process.env.TWITTER_CLIENT_SECRET,
      clientIdStartsWith: process.env.TWITTER_CLIENT_ID?.substring(0, 10) || 'none',
      hasRedirectUri: !!process.env.TWITTER_REDIRECT_URI
    };
    
    console.log('OAuth 2.0 credentials:', oauth2);
    
    // Simple test: Try to create a Twitter client
    if (oauth1a.hasApiKey && oauth1a.hasAccessToken) {
      const { TwitterApi } = require('twitter-api-v2');
      
      try {
        const client = new TwitterApi({
          appKey: process.env.TWITTER_API_KEY,
          appSecret: process.env.TWITTER_API_SECRET,
          accessToken: process.env.TWITTER_ACCESS_TOKEN,
          accessSecret: process.env.TWITTER_ACCESS_SECRET,
        });
        
        // Test if credentials work
        const me = await client.v2.me();
        console.log('✅ OAuth 1.0a credentials work! User:', me.data.username);
        
        // Try a simple tweet with OAuth 1.0a
        const testTweet = await client.v2.tweet('Debug test from LinkHub');
        console.log('✅ OAuth 1.0a tweet successful! ID:', testTweet.data.id);
        
        // Delete the test tweet
        await client.v2.deleteTweet(testTweet.data.id);
        console.log('✅ Test tweet deleted');
        
        res.json({
          success: true,
          message: 'OAuth 1.0a credentials are working!',
          oauth1a: oauth1a,
          oauth2: oauth2,
          testUser: me.data,
          canPost: true
        });
        
      } catch (clientError) {
        console.error('❌ OAuth 1.0a client error:', clientError.message);
        
        res.json({
          success: false,
          error: clientError.message,
          oauth1a: oauth1a,
          oauth2: oauth2,
          troubleshooting: [
            '1. Check if Twitter API credentials are correct',
            '2. Verify app has Read + Write permissions',
            '3. Check if tokens are valid in Twitter Developer Portal'
          ]
        });
      }
    } else {
      res.json({
        success: false,
        error: 'Missing OAuth 1.0a credentials in .env',
        oauth1a: oauth1a,
        oauth2: oauth2,
        required: [
          'TWITTER_API_KEY',
          'TWITTER_API_SECRET', 
          'TWITTER_ACCESS_TOKEN',
          'TWITTER_ACCESS_SECRET'
        ]
      });
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

// Add this SIMPLE media test function
exports.simpleMediaTest = async (req, res) => {
  try {
    console.log('🧪 SIMPLE Twitter media test...');
    
    const { TwitterApi } = require('twitter-api-v2');
    
    // Create OAuth 1.0a client
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    console.log('1. Testing credentials...');
    const me = await client.v2.me();
    console.log(`✅ Credentials work! User: @${me.data.username}`);
    
    // Use a SMALL test image (faster download)
    const testImageUrl = 'https://picsum.photos/200/200';
    console.log(`2. Downloading test image: ${testImageUrl}`);
    
    const imageResponse = await axios.get(testImageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    console.log(`✅ Image downloaded: ${imageBuffer.length} bytes`);
    
    console.log('3. Uploading media...');
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/jpeg'
    });
    
    console.log(`✅ Media uploaded! ID: ${mediaId}`);
    
    console.log('4. Posting tweet with media...');
    const tweetResponse = await client.v2.tweet(
      'Simple test: Twitter media upload works! 🎉',
      { media: { media_ids: [mediaId] } }
    );
    
    const tweetId = tweetResponse.data.id;
    console.log(`✅ Tweet published! ID: ${tweetId}`);
    
    res.json({
      success: true,
      message: 'Media upload works perfectly!',
      tweetUrl: `https://twitter.com/${me.data.username}/status/${tweetId}`,
      tweetId: tweetId,
      mediaId: mediaId,
      steps: [
        '1. ✅ OAuth 1.0a credentials verified',
        '2. ✅ Test image downloaded',
        '3. ✅ Media uploaded to Twitter',
        '4. ✅ Tweet posted with image'
      ]
    });
    
  } catch (error) {
    console.error('❌ Simple media test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Check for specific errors
    if (error.code === 'ETIMEDOUT') {
      console.error('⚠️ Network timeout - check internet connection');
    }
    
    if (error.message.includes('media_ids')) {
      console.error('⚠️ Media ID issue - check media upload');
    }
    
    res.json({
      success: false,
      error: error.message,
      errorCode: error.code,
      details: error.data || error.response?.data,
      troubleshooting: [
        '1. Check internet connection',
        '2. Verify image URL is accessible',
        '3. Ensure OAuth 1.0a credentials have media upload permission',
        '4. Try smaller image (<2MB)'
      ]
    });
  }
};
exports.testTwitterMedia = async (req, res) => {
  try {
    console.log('🧪 Testing Twitter media upload WITH OAuth 1.0a...');
    
    // Check if we have OAuth 1.0a credentials
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
      return res.json({
        success: false,
        error: 'Missing OAuth 1.0a credentials in .env',
        required: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET']
      });
    }
    
    const { TwitterApi } = require('twitter-api-v2');
    
    // Create OAuth 1.0a client
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    console.log('🔑 Using OAuth 1.0a credentials from .env');
    
    // Test 1: Verify credentials work
    console.log('🔄 Verifying OAuth 1.0a credentials...');
    const me = await client.v2.me();
    console.log(`✅ App account: @${me.data.username}`);
    
    // Use a test image
    const testImageUrl = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop';
    console.log(`📸 Downloading test image: ${testImageUrl}`);
    
    // Download the image
    const imageResponse = await axios.get(testImageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    console.log(`✅ Image downloaded: ${imageBuffer.length} bytes`);
    
    // Upload media using OAuth 1.0a v1.1 API
    console.log('☁️ Uploading media via OAuth 1.0a...');
    const mediaId = await client.v1.uploadMedia(imageBuffer, {
      mimeType: 'image/jpeg'
    });
    
    console.log(`✅ Media uploaded! ID: ${mediaId}`);
    
    // Post tweet with the uploaded media
    console.log('🐦 Posting tweet with image...');
    const tweetResponse = await client.v2.tweet('Test tweet with image from LinkHub using OAuth 1.0a! 🖼️', {
      media: { media_ids: [mediaId] }
    });
    
    const tweetId = tweetResponse.data.id;
    console.log(`✅ Tweet published! ID: ${tweetId}`);
    
    res.json({
      success: true,
      message: 'Twitter media upload works with OAuth 1.0a! 🎉',
      results: {
        method: 'oauth1a',
        mediaId: mediaId,
        tweetId: tweetId,
        url: `https://twitter.com/${me.data.username}/status/${tweetId}`,
        appAccount: me.data.username
      },
      explanation: 'OAuth 1.0a is more reliable for media upload than OAuth 2.0'
    });
    
  } catch (error) {
    console.error('❌ OAuth 1.0a media test failed:');
    console.error('Error:', error.message);
    console.error('Details:', error.data || error.response?.data);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.data || error.response?.data,
      troubleshooting: [
        '1. Check OAuth 1.0a credentials in .env file',
        '2. Verify app has Read + Write permissions',
        '3. Ensure media size < 5MB',
        '4. Try re-generating access tokens in Twitter Developer Portal'
      ]
    });
  }
};
// Add to socialController.js
exports.publicTestTwitterMedia = async (req, res) => {
  try {
    console.log('🧪 PUBLIC Twitter media test (no auth)...');
    
    // Get ANY Twitter account for testing
    const account = await prisma.socialConnection.findFirst({
      where: { 
        platform: 'twitter', 
        isConnected: true,
        userId: 8 // Your user ID from logs
      }
    });
    
    if (!account) {
      return res.json({ 
        success: false, 
        error: 'No Twitter account found for testing' 
      });
    }
    
    console.log(`📊 Using account: @${account.accountName}`);
    
    // Use the existing ensureFreshTwitterToken function
    const freshAccount = await ensureFreshTwitterToken(account);
    if (!freshAccount) {
      throw new Error('Failed to refresh Twitter token');
    }
    
    // Use a test image
    const testImageUrl = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop';
    
    // Download image
    const imageResponse = await axios.get(testImageUrl, {
      responseType: 'arraybuffer'
    });
    
    const base64Image = Buffer.from(imageResponse.data).toString('base64');
    
    // Upload media
    const uploadResponse = await axios.post(
      'https://upload.twitter.com/2/media/upload.json',
      {
        media: base64Image,
        media_category: 'tweet_image'
      },
      {
        headers: {
          'Authorization': `Bearer ${freshAccount.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const mediaId = uploadResponse.data.media_id_string;
    console.log('✅ Media uploaded:', mediaId);
    
    // Post tweet with media
    const tweetResponse = await axios.post(
      'https://api.twitter.com/2/tweets',
      {
        text: 'Public test: Twitter media upload works! 🎉',
        media: {
          media_ids: [mediaId]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${freshAccount.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const tweetId = tweetResponse.data.data.id;
    console.log('✅ Tweet published:', tweetId);
    
    res.json({
      success: true,
      message: 'Public test successful!',
      tweetUrl: `https://twitter.com/${account.accountName}/status/${tweetId}`,
      tweetId: tweetId
    });
    
  } catch (error) {
    console.error('❌ Public media test failed:', error.message);
    res.json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
};
// Make sure ensureFreshTwitterToken function exists (add if not already)
async function ensureFreshTwitterToken(account) {
  try {
    // Quick test to see if token is valid
    try {
      await axios.get('https://api.twitter.com/2/users/me', {
        headers: { 'Authorization': `Bearer ${account.accessToken}` },
        timeout: 5000
      });
      console.log('✅ Twitter token is valid');
      return account;
    } catch (testError) {
      console.log('⚠️ Token test failed, attempting refresh...');
    }
    
    if (!account.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    console.log('🔄 Refreshing token...');
    const refreshResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
        client_id: process.env.TWITTER_CLIENT_ID
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
          ).toString('base64')}`
        }
      }
    );
    
    const { access_token, refresh_token, expires_in } = refreshResponse.data;
    
    // Update in database
    const updatedAccount = await prisma.socialConnection.update({
      where: { id: account.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Token refreshed!');
    return updatedAccount;
    
  } catch (error) {
    console.error('❌ Token refresh failed:', error.message);
    throw error;
  }
}
// Add this PUBLIC test method (no auth required)
exports.publicTestTwitter = async (req, res) => {
  try {
    console.log('🧪 PUBLIC Twitter test (no auth required)...');
    
    // Get ALL Twitter accounts (for testing only - in production, restrict to user)
    const accounts = await prisma.socialConnection.findMany({
      where: { 
        platform: 'twitter', 
        isConnected: true 
      },
      take: 1 // Just get one for testing
    });
    
    if (accounts.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No connected Twitter accounts found in database' 
      });
    }
    
    const account = accounts[0];
    console.log(`📊 Found Twitter account: @${account.accountName}`);
    console.log(`🔑 Token length: ${account.accessToken?.length || 'No token'}`);
    
    // Test 1: Check token validity
    if (!account.accessToken) {
      return res.json({
        success: false,
        error: 'No access token found for this Twitter account',
        account: {
          id: account.id,
          username: account.accountName,
          userId: account.userId
        }
      });
    }
    
    // Test 2: Try to get user info
    try {
      const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`
        }
      });
      
      console.log('✅ User info accessible:', userResponse.data.data);
      
      // Test 3: Try a simple tweet
      const testTweet = await axios.post(
        'https://api.twitter.com/2/tweets',
        { 
          text: `Test tweet from LinkHub - ${new Date().toLocaleTimeString()} (testing)` 
        },
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Tweet posted:', testTweet.data.data);
      
      return res.json({
        success: true,
        message: 'Twitter posting works!',
        account: {
          id: account.id,
          username: account.accountName,
          userId: account.userId
        },
        tweet: {
          id: testTweet.data.data.id,
          text: `Test tweet from LinkHub - ${new Date().toLocaleTimeString()} (testing)`,
          url: `https://twitter.com/${userResponse.data.data.username}/status/${testTweet.data.data.id}`
        }
      });
      
    } catch (apiError) {
      console.error('❌ Twitter API error:', apiError.response?.data || apiError.message);
      
      return res.json({
        success: false,
        error: 'Twitter API error',
        details: apiError.response?.data || apiError.message,
        account: {
          id: account.id,
          username: account.accountName,
          tokenLength: account.accessToken?.length,
          scopes: account.metadata?.scopes || 'unknown'
        },
        troubleshooting: [
          '1. Check if token has expired',
          '2. Verify token has "tweet.write" scope',
          '3. Make sure app has Essential access tier'
        ]
      });
    }
    
  } catch (error) {
    console.error('❌ Test setup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
// Add this to your socialController.js exports
exports.testTwitterUpload = async (req, res) => {
  try {
    console.log('🧪 Testing Twitter upload capabilities...');
    
    // Get a connected Twitter account for the current user
    const account = await prisma.socialConnection.findFirst({
      where: { 
        platform: 'twitter', 
        isConnected: true,
        userId: parseInt(req.user.userId)
      }
    });
    
    if (!account) {
      return res.status(404).json({ 
        success: false, 
        error: 'No connected Twitter account found for your account' 
      });
    }
    
    console.log(`📊 Testing with account: @${account.accountName}`);
    console.log(`🔑 Access token length: ${account.accessToken?.length || 0}`);
    
    if (!account.accessToken) {
      return res.json({
        success: false,
        error: 'No access token found for Twitter account',
        solution: 'Please reconnect your Twitter account'
      });
    }
    
    // Test 1: Check if we can read user info
    console.log('🔄 Testing user info access...');
    try {
      const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`
        },
        params: {
          'user.fields': 'id,name,username'
        }
      });
      
      console.log('✅ User info accessible:', userResponse.data.data.username);
      
    } catch (userError) {
      console.error('❌ Cannot access user info:', userError.response?.data || userError.message);
      return res.json({
        success: false,
        error: 'Cannot access Twitter API',
        details: userError.response?.data || userError.message,
        solution: 'Your token may have expired. Please reconnect Twitter account.'
      });
    }
    
    // Test 2: Try to post a simple text tweet
    console.log('🔄 Testing text tweet...');
    const testText = `Test tweet from LinkHub at ${new Date().toLocaleTimeString()}`;
    
    try {
      const tweetResponse = await axios.post(
        'https://api.twitter.com/2/tweets',
        { text: testText },
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const tweetId = tweetResponse.data.data.id;
      console.log(`✅ Text tweet published! ID: ${tweetId}`);
      
      return res.json({
        success: true,
        message: 'Twitter posting works!',
        tweet: {
          id: tweetId,
          text: testText,
          url: `https://twitter.com/${account.accountName}/status/${tweetId}`
        },
        account: {
          username: account.accountName,
          tokenValid: true
        }
      });
      
    } catch (tweetError) {
      console.error('❌ Tweet posting failed:', tweetError.response?.data || tweetError.message);
      
      return res.json({
        success: false,
        error: 'Cannot post to Twitter',
        details: tweetError.response?.data || tweetError.message,
        likelyIssue: tweetError.response?.status === 403 ? 'Missing tweet.write scope' : 
                    tweetError.response?.status === 401 ? 'Token expired' : 'Unknown error',
        solution: 'Please reconnect your Twitter account with correct permissions'
      });
    }
    
  } catch (error) {
    console.error('❌ Test setup error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
// OAuth 1.0a fallback function
async function tryOAuth1aTwitterPost(account, content, mediaUrls, draftId) {
  try {
    const { TwitterApi } = require('twitter-api-v2');
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: account.metadata.oauth1AccessToken,
      accessSecret: account.metadata.oauth1AccessSecret,
    });
    
    const tweetText = content.slice(0, 280);
    console.log(`🔄 Using OAuth 1.0a for tweet: ${tweetText.substring(0, 50)}...`);
    
    let mediaIds = [];
    
    // Upload media if present
    if (mediaUrls && mediaUrls.length > 0) {
      for (let i = 0; i < Math.min(mediaUrls.length, 4); i++) {
        try {
          const mediaUrl = mediaUrls[i];
          const imageResponse = await axios.get(mediaUrl, {
            responseType: 'arraybuffer'
          });
          
          const imageBuffer = Buffer.from(imageResponse.data);
          const mimeType = getMimeType(mediaUrl);
          
          // Upload media using OAuth 1.0a
          const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType });
          mediaIds.push(mediaId);
          console.log(`✅ OAuth 1.0a media uploaded: ${mediaId}`);
          
        } catch (mediaError) {
          console.error('Media upload failed:', mediaError.message);
        }
      }
    }
    
    // Post tweet
    let tweetResponse;
    if (mediaIds.length > 0) {
      tweetResponse = await twitterClient.v2.tweet(tweetText, {
        media: { media_ids: mediaIds }
      });
    } else {
      tweetResponse = await twitterClient.v2.tweet(tweetText);
    }
    
    const tweetId = tweetResponse.data.id;
    console.log(`✅ OAuth 1.0a TWEET PUBLISHED! ID: ${tweetId}`);
    
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetId),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'oauth1a_fallback',
            tier: 'essential',
            hasMedia: mediaIds.length > 0,
            mediaCount: mediaIds.length
          }
        }
      });
    }
    
    return { 
      success: true, 
      platformPostId: tweetId,
      hasMedia: mediaIds.length > 0,
      mediaCount: mediaIds.length,
      method: 'oauth1a'
    };
    
  } catch (error) {
    console.error('❌ OAuth 1.0a fallback failed:', error.message);
    return { 
      success: false, 
      error: 'Both OAuth 2.0 and OAuth 1.0a failed: ' + error.message 
    };
  }
}

// Helper function for OAuth 1.0a posting (more reliable for media)
async function tryOAuth1Posting(account, content, mediaUrls, draftId) {
  try {
    console.log('🔄 Using OAuth 1.0a for posting...');
    
    // Create OAuth 1.0a client using YOUR credentials
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    const tweetText = content.slice(0, 280);
    
    // Upload media if available
    let mediaId;
    if (mediaUrls && mediaUrls.length > 0) {
      const mediaUrl = mediaUrls[0]; // OAuth 1.0a supports single media more reliably
      console.log(`📸 Uploading media via OAuth 1.0a: ${mediaUrl}`);
      
      const imageResponse = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 5 * 1024 * 1024,
        timeout: 30000
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      mediaId = await client.v1.uploadMedia(imageBuffer, {
        mimeType: getMimeType(mediaUrl)
      });
      console.log(`✅ OAuth 1.0a media uploaded: ${mediaId}`);
    }
    
    // Post tweet
    let tweetResponse;
    if (mediaId) {
      tweetResponse = await client.v2.tweet(tweetText, {
        media: { media_ids: [mediaId] }
      });
    } else {
      tweetResponse = await client.v2.tweet(tweetText);
    }
    
    const tweetId = tweetResponse.data.id;
    console.log(`✅ OAuth 1.0a Tweet published: ${tweetId}`);
    
    // Save to database
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetId),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'oauth1a_with_media',
            tier: 'free',
            hasMedia: !!mediaId,
            mediaCount: mediaId ? 1 : 0,
            usedFallback: true
          }
        }
      });
    }
    
    return { 
      success: true, 
      platformPostId: tweetId,
      hasMedia: !!mediaId,
      mediaCount: mediaId ? 1 : 0,
      usedOAuth1: true
    };
    
  } catch (error) {
    console.error('❌ OAuth 1.0a also failed:', error.message);
    
    // Final fallback: text-only with OAuth 2.0
    try {
      const twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
      }).bearerToken(account.accessToken);
      
      const tweetText = content.slice(0, 280);
      const tweetResponse = await twitterClient.v2.tweet(tweetText);
      
      const tweetId = tweetResponse.data.id;
      console.log(`✅ Text-only fallback tweet published: ${tweetId}`);
      
      if (draftId) {
        await prisma.publishedPost.create({
          data: {
            draftId: parseInt(draftId),
            socialAccountId: parseInt(account.id),
            platformPostId: String(tweetId),
            status: 'published',
            publishedAt: new Date(),
            metadata: {
              method: 'text_only_fallback',
              tier: 'essential',
              hasMedia: false,
              note: 'Media upload failed, posted text only'
            }
          }
        });
      }
      
      return { 
        success: true, 
        platformPostId: tweetId,
        hasMedia: false,
        textOnly: true
      };
      
    } catch (finalError) {
      console.error('❌ All methods failed:', finalError.message);
      return { 
        success: false, 
        error: finalError.message,
        details: 'All posting methods failed'
      };
    }
  }
}

async function tryAlternativeMediaPosting(account, content, mediaUrls, draftId) {
  try {
    console.log('🔄 Using v1.1 API for media tweet...');
    
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    const tweetText = content.slice(0, 280);
    
    if (mediaUrls && mediaUrls.length > 0) {
      // Use v1.1 API for media tweets (more reliable)
      const mediaUrl = mediaUrls[0]; // v1.1 only supports 1 media
      console.log(`📸 Uploading single media: ${mediaUrl}`);
      
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        maxContentLength: 5 * 1024 * 1024,
      });
      
      const imageBuffer = Buffer.from(response.data);
      const mimeType = getMimeType(mediaUrl);
      
      // Upload and post in one go with v1.1
      const tweet = await client.v1.tweet(tweetText, {
        media_ids: await client.v1.uploadMedia(imageBuffer, { mimeType })
      });
      
      console.log(`✅ v1.1 Tweet published: ${tweet.id_str}`);
      
      if (draftId) {
        await prisma.publishedPost.create({
          data: {
            draftId: parseInt(draftId),
            socialAccountId: parseInt(account.id),
            platformPostId: tweet.id_str,
            status: 'published',
            publishedAt: new Date(),
            metadata: {
              method: 'v1.1_with_media',
              tier: 'essential',
              hasMedia: true
            }
          }
        });
      }
      
      return { success: true, platformPostId: tweet.id_str, hasMedia: true };
    }
    
  } catch (error) {
    console.error('Alternative method failed:', error.message);
    // Fallback to text-only
    return publishTextOnly(account, content, draftId);
  }
}

// Text-only fallback
async function publishTextOnly(account, content, draftId) {
  try {
    console.log('📝 Falling back to text-only tweet...');
    
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    const tweetResponse = await client.v2.tweet(content.slice(0, 280));
    console.log(`✅ Text-only tweet published: ${tweetResponse.data.id}`);
    
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetResponse.data.id),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'text_only_fallback',
            tier: 'essential',
            note: 'Media upload failed'
          }
        }
      });
    }
    
    return { success: true, platformPostId: tweetResponse.data.id, textOnly: true };
    
  } catch (error) {
    console.error('Text-only fallback failed:', error.message);
    return { success: false, error: error.message };
  }
}


// Text-only fallback
async function publishTextOnlyFallback(account, content, draftId) {
  try {
    console.log('📝 Attempting text-only tweet...');
    
    const response = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: content.slice(0, 280) },
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const tweetId = response.data.data.id;
    console.log(`✅ Text-only tweet published: ${tweetId}`);
    
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetId),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'oauth2_text_only',
            tier: 'essential',
            note: 'Media upload failed, posted text only'
          }
        }
      });
    }
    
    return { success: true, platformPostId: tweetId, textOnly: true };
    
  } catch (fallbackError) {
    console.error('Text-only fallback failed:', fallbackError.message);
    return { success: false, error: fallbackError.message };
  }
}
// OAuth 1.0a fallback
async function tryOAuth1aPosting(account, content, draftId) {
  try {
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
      throw new Error('Missing OAuth 1.0a credentials');
    }
    
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    const tweetText = content.slice(0, 280);
    const tweetResponse = await client.v2.tweet(tweetText);
    
    console.log(`✅ OAuth 1.0a SUCCESS! Tweet ID: ${tweetResponse.data.id}`);
    
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: String(tweetResponse.data.id),
          status: 'published',
          publishedAt: new Date(),
          metadata: {
            method: 'oauth1a_fallback',
            tier: 'essential'
          }
        }
      });
    }
    
    return { success: true, platformPostId: tweetResponse.data.id };
    
  } catch (oauth1Error) {
    console.error('OAuth 1.0a failed:', oauth1Error.message);
    return { 
      success: false, 
      error: 'Twitter posting failed. Please check connection.'
    };
  }
}


// Helper function for simulation
async function simulateTwitterPost(account, content, draftId, errorReason) {
  try {
    console.warn(`⚠️ Falling back to simulation for Draft ${draftId}`);
    const fakeId = `sim_tw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (draftId) {
      await prisma.publishedPost.create({
        data: {
          draftId: parseInt(draftId),
          socialAccountId: parseInt(account.id),
          platformPostId: fakeId,
          status: 'published',
          publishedAt: new Date(),
          errorMessage: `Simulated: ${errorReason}`,
          metadata: {
            simulated: true,
            reason: errorReason,
            timestamp: new Date().toISOString(),
            tweetContent: content.slice(0, 100),
            solution: 'Apply for Essential access or set up OAuth 1.0a user tokens'
          }
        }
      });
    }
    
    return { 
      success: true, 
      platformPostId: fakeId, 
      simulated: true,
      message: `Simulated tweet for @${account.accountName}`
    };
    
  } catch (simError) {
    console.error('❌ Simulation failed:', simError);
    return { 
      success: false, 
      error: `Real post failed: ${errorReason}. Simulation also failed.`
    };
  }
}

// Update your twitterCallback to store OAuth 1.0a tokens
exports.twitterCallback = async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError || !code) {
      console.error('❌ Twitter OAuth error:', oauthError);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?error=twitter_failed`);
    }

    const stateData = oauthStates.get(state);
    if (!stateData) {
      console.error('❌ Invalid or expired state parameter');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?error=invalid_state`);
    }
    
    const { userId, codeVerifier } = stateData;
    console.log(`🔄 Processing Twitter callback for user ${userId}`);
    
    // Clean up state
    oauthStates.delete(state);

    // Exchange code for OAuth 2.0 tokens
    console.log(`🔄 Exchanging code for OAuth 2.0 access token...`);
    const tokenResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID,
        redirect_uri: process.env.TWITTER_REDIRECT_URI,
        code_verifier: codeVerifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
          ).toString('base64')}`
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    console.log(`✅ Got Twitter OAuth 2.0 access token (length: ${access_token.length})`);

    // Get Twitter user info
    console.log(`🔄 Getting Twitter user info...`);
    const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${access_token}`
      },
      params: {
        'user.fields': 'id,name,username,profile_image_url'
      }
    });

    const twitterUser = userResponse.data.data;
    console.log(`✅ Twitter user: @${twitterUser.username} (ID: ${twitterUser.id})`);

    // IMPORTANT: Try to get OAuth 1.0a tokens if available
    let oauth1AccessToken = null;
    let oauth1AccessSecret = null;
    
    // Note: OAuth 2.0 PKCE doesn't provide OAuth 1.0a tokens
    // You'll need to implement separate OAuth 1.0a flow for posting
    
    // Save connection to SocialConnection table
    console.log(`💾 Saving Twitter connection to database...`);
    const twitterConnection = await prisma.socialConnection.upsert({
      where: {
        userId_platform_platformUserId: {
          userId: parseInt(userId),
          platform: 'twitter',
          platformUserId: twitterUser.id
        }
      },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        accountName: twitterUser.username,
        profilePicture: twitterUser.profile_image_url,
        isConnected: true,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        metadata: {
          name: twitterUser.name,
          username: twitterUser.username,
          expires_in: expires_in,
          scopes: ['tweet.read', 'tweet.write', 'users.read'],
          oauth1Available: false,
          oauth1AccessToken: oauth1AccessToken,
          oauth1AccessSecret: oauth1AccessSecret,
          note: 'OAuth 1.0a tokens not available via OAuth 2.0 PKCE flow'
        },
        updatedAt: new Date()
      },
      create: {
        userId: parseInt(userId),
        platform: 'twitter',
        platformUserId: twitterUser.id,
        accessToken: access_token,
        refreshToken: refresh_token,
        accountName: twitterUser.username,
        profilePicture: twitterUser.profile_image_url,
        isConnected: true,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        metadata: {
          name: twitterUser.name,
          username: twitterUser.username,
          expires_in: expires_in,
          scopes: ['tweet.read', 'tweet.write', 'users.read'],
          oauth1Available: false,
          oauth1AccessToken: oauth1AccessToken,
          oauth1AccessSecret: oauth1AccessSecret,
          note: 'OAuth 1.0a tokens not available via OAuth 2.0 PKCE flow'
        }
      }
    });

    console.log(`✅ Saved Twitter connection with ID: ${twitterConnection.id}`);

    // Update user's twitter field in User table
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        twitter: `https://twitter.com/${twitterUser.username}`
      }
    });

    console.log(`✅ Twitter connection complete for user ${userId}`);
    
    // Redirect with warning about posting capability
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?success=twitter_connected&warning=posting_may_be_limited`);
    
  } catch (error) {
    console.error('❌ Twitter callback error:', error.response?.data || error.message);
    console.error('Stack trace:', error.stack);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?error=twitter_failed`);
  }
};

// New function to implement OAuth 1.0a flow for posting capability
exports.getTwitterOAuth1Url = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { twitterUserId } = req.query; // Optional: specific Twitter account
    
    console.log(`🔗 Generating OAuth 1.0a URL for user ${userId}`);
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
    });
    
    // Generate authentication URL
    const authLink = await twitterClient.generateAuthLink(
      process.env.TWITTER_CALLBACK_URL || `${process.env.BACKEND_URL}/api/social/callback/twitter-oauth1`,
      { linkMode: 'authorize' }
    );
    
    // Store the oauth_token_secret for later
    const state = generateState();
    oauthStates.set(state, { 
      userId, 
      platform: 'twitter_oauth1',
      oauthTokenSecret: authLink.oauth_token_secret,
      timestamp: Date.now()
    });
    
    res.json({
      success: true,
      authUrl: authLink.url,
      state: state,
      instructions: [
        '1. Authorize your Twitter account',
        '2. You will get a PIN/verifier',
        '3. Submit the PIN to complete OAuth 1.0a setup',
        '4. This enables posting capability'
      ]
    });
    
  } catch (error) {
    console.error('OAuth 1.0a URL generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
// Add this function to your socialController.js
exports.twitterOAuth1Callback = async (req, res) => {
  try {
    const { oauth_token, oauth_verifier, state } = req.query;
    
    if (!oauth_token || !oauth_verifier || !state) {
      console.error('❌ Missing OAuth 1.0a parameters');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?error=twitter_oauth1_missing_params`);
    }
    
    const stateData = oauthStates.get(state);
    if (!stateData) {
      console.error('❌ Invalid or expired state parameter');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?error=invalid_state`);
    }
    
    const { userId, oauthTokenSecret } = stateData;
    
    // Clean up state
    oauthStates.delete(state);
    
    console.log(`🔄 Completing OAuth 1.0a flow for user ${userId}`);
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
    });
    
    // Get access tokens
    const { client: oauthClient, accessToken, accessSecret } = await twitterClient.login(oauth_verifier, {
      oauth_token,
      oauth_token_secret: oauthTokenSecret,
    });
    
    // Get user info
    const user = await oauthClient.v2.me();
    console.log(`✅ OAuth 1.0a successful for @${user.data.username}`);
    
    // Update the social connection with OAuth 1.0a tokens
    await prisma.socialConnection.updateMany({
      where: {
        userId: parseInt(userId),
        platform: 'twitter',
        platformUserId: user.data.id
      },
      data: {
        metadata: {
          ...socialConnection.metadata,
          oauth1AccessToken: accessToken,
          oauth1AccessSecret: accessSecret,
          oauth1Available: true,
          note: 'OAuth 1.0a tokens available for posting'
        }
      }
    });
    
    console.log(`✅ OAuth 1.0a tokens saved for user ${userId}`);
    
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?success=twitter_oauth1_complete`);
    
  } catch (error) {
    console.error('❌ Twitter OAuth 1.0a callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/profile?error=twitter_oauth1_failed`);
  }
};
// Add these test functions to your socialController.js

// // Add this simple test function
// exports.testSimpleTwitter = async (req, res) => {
//   try {
//     console.log('🧪 Simple Twitter test...');
    
//     // Check credentials
//     console.log('🔍 Checking credentials...');
//     console.log('TWITTER_API_KEY exists:', !!process.env.TWITTER_API_KEY);
//     console.log('TWITTER_API_SECRET exists:', !!process.env.TWITTER_API_SECRET);
//     console.log('TWITTER_ACCESS_TOKEN exists:', !!process.env.TWITTER_ACCESS_TOKEN);
//     console.log('TWITTER_ACCESS_SECRET exists:', !!process.env.TWITTER_ACCESS_SECRET);
    
//     if (!process.env.TWITTER_API_KEY || 
//         !process.env.TWITTER_API_SECRET || 
//         !process.env.TWITTER_ACCESS_TOKEN || 
//         !process.env.TWITTER_ACCESS_SECRET) {
//       return res.json({
//         success: false,
//         error: 'Missing OAuth 1.0a credentials',
//         message: 'Check your .env file for Twitter credentials'
//       });
//     }
    
//     const twitterClient = new TwitterApi({
//       appKey: process.env.TWITTER_API_KEY,
//       appSecret: process.env.TWITTER_API_SECRET,
//       accessToken: process.env.TWITTER_ACCESS_TOKEN,
//       accessSecret: process.env.TWITTER_ACCESS_SECRET,
//     });
    
//     // Just get user info (doesn't require posting credits)
//     console.log('🔄 Getting app user info...');
//     const me = await twitterClient.v2.me();
    
//     res.json({
//       success: true,
//       message: 'Twitter OAuth 1.0a credentials are valid!',
//       appAccount: me.data,
//       tier: 'Free',
//       postingStatus: 'Credits likely depleted. Need Essential access for posting.'
//     });
    
//   } catch (error) {
//     console.error('❌ Simple Twitter test failed:', error.message);
    
//     res.json({
//       success: false,
//       error: error.message,
//       details: error.data || error.response?.data,
//       commonFixes: [
//         '1. Check if app has Read+Write permissions in Twitter Developer Portal',
//         '2. Verify OAuth 1.0a credentials are correct',
//         '3. Apply for Essential access (Free tier may not have posting)'
//       ]
//     });
//   }
// };


// Add this test function
exports.testTwitterPost = async (req, res) => {
  try {
    console.log('🧪 Testing Twitter posting capability...');
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    // Test 1: Get app info
    const me = await twitterClient.v2.me();
    console.log('✅ App account:', me.data);
    
    // Test 2: Try to post a test tweet (then delete it)
    const testTweet = await twitterClient.v2.tweet('Test tweet from LinkHub app - please ignore');
    console.log('✅ Test tweet posted:', testTweet.data);
    
    // Delete the test tweet
    await twitterClient.v2.deleteTweet(testTweet.data.id);
    console.log('✅ Test tweet deleted');
    
    res.json({
      success: true,
      message: 'Twitter posting WORKS! Essential access is active.',
      tweetId: testTweet.data.id,
      appAccount: me.data,
      canPost: true
    });
    
  } catch (error) {
    console.error('❌ Posting failed:', error.data || error.message);
    
    res.json({
      success: false,
      message: 'Posting failed - likely missing credits or permissions',
      error: error.data?.title || error.message,
      details: error.data,
      appAccount: me.data,
      canPost: false,
      solution: 'Apply for Essential access at developer.twitter.com'
    });
  }
};

// // Add to socialController.js
// exports.checkOAuth2Setup = async (req, res) => {
//   try {
//     console.log('🔍 Checking OAuth 2.0 setup...');
    
//     // Check if OAuth 2.0 credentials exist
//     const hasOAuth2 = process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET;
//     const hasOAuth1 = process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET;
    
//     if (!hasOAuth2) {
//       return res.json({
//         success: false,
//         message: 'OAuth 2.0 credentials missing in .env',
//         required: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
//         currentStatus: {
//           hasClientId: !!process.env.TWITTER_CLIENT_ID,
//           hasClientSecret: !!process.env.TWITTER_CLIENT_SECRET,
//           hasRedirectUri: !!process.env.TWITTER_REDIRECT_URI
//         },
//         action: '1. Configure OAuth 2.0 in Twitter app settings\n2. Get Client ID/Secret\n3. Update .env file'
//       });
//     }
    
//     // Generate OAuth URL to test
//     const scopes = ['tweet.read', 'tweet.write', 'users.read', 'media.write','offline.access'];
//     const scopesEncoded = encodeURIComponent(scopes.join(' '));
    
//     const state = crypto.randomBytes(16).toString('hex');
//     const codeVerifier = crypto.randomBytes(32).toString('hex');
//     const codeChallenge = crypto
//       .createHash('sha256')
//       .update(codeVerifier)
//       .digest('base64')
//       .replace(/\+/g, '-')
//       .replace(/\//g, '_')
//       .replace(/=/g, '');
    
//     const authUrl = `https://twitter.com/i/oauth2/authorize?` +
//       `response_type=code&` +
//       `client_id=${process.env.TWITTER_CLIENT_ID}&` +
//       `redirect_uri=${encodeURIComponent(process.env.TWITTER_REDIRECT_URI)}&` +
//       `scope=${scopesEncoded}&` +
//       `state=${state}&` +
//       `code_challenge=${codeChallenge}&` +
//       `code_challenge_method=S256`;
    
//     res.json({
//       success: true,
//       message: 'OAuth 2.0 is configured in .env',
//       credentials: {
//         clientId: process.env.TWITTER_CLIENT_ID ? 'Present' : 'Missing',
//         clientSecret: process.env.TWITTER_CLIENT_SECRET ? 'Present' : 'Missing',
//         redirectUri: process.env.TWITTER_REDIRECT_URI
//       },
//       oauth1: {
//         apiKey: process.env.TWITTER_API_KEY ? 'Present' : 'Missing',
//         apiSecret: process.env.TWITTER_API_SECRET ? 'Present' : 'Missing'
//       },
//       testUrl: authUrl,
//       nextSteps: [
//         '1. Use the test URL above to authorize your app',
//         '2. After authorization, Twitter will redirect with a code',
//         '3. Your app will exchange code for access token'
//       ]
//     });
    
//   } catch (error) {
//     console.error('OAuth 2.0 check failed:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// };
// Add this to socialController.js
exports.checkTwitterToken = async (req, res) => {
  try {
    console.log('🔍 Checking Twitter token status...');
    
    const accounts = await prisma.socialConnection.findMany({
      where: { 
        platform: 'twitter', 
        isConnected: true 
      }
    });
    
    if (accounts.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No Twitter accounts found' 
      });
    }
    
    const results = [];
    
    for (const account of accounts) {
      console.log(`\n📊 Checking account: @${account.accountName}`);
      
      const tokenInfo = {
        id: account.id,
        username: account.accountName,
        tokenLength: account.accessToken?.length || 0,
        tokenStartsWith: account.accessToken?.substring(0, 20) || 'No token',
        expiresAt: account.tokenExpiresAt,
        isExpired: account.tokenExpiresAt ? new Date(account.tokenExpiresAt) < new Date() : true,
        scopes: account.metadata?.scopes || 'unknown',
        refreshToken: !!account.refreshToken
      };
      
      console.log('📅 Token expires at:', tokenInfo.expiresAt);
      console.log('⏰ Is expired?', tokenInfo.isExpired);
      console.log('🔄 Has refresh token?', tokenInfo.refreshToken);
      
      // Try to use the token
      if (account.accessToken) {
        try {
          const testResponse = await axios.get('https://api.twitter.com/2/users/me', {
            headers: { 'Authorization': `Bearer ${account.accessToken}` },
            timeout: 5000
          });
          
          tokenInfo.tokenValid = true;
          tokenInfo.userId = testResponse.data.data.id;
          console.log('✅ Token is VALID for user:', testResponse.data.data.username);
          
        } catch (error) {
          tokenInfo.tokenValid = false;
          tokenInfo.error = error.response?.data?.title || error.message;
          tokenInfo.status = error.response?.status;
          console.log('❌ Token is INVALID:', tokenInfo.error);
          
          // If it's a 401 and we have a refresh token, try to refresh
          if (error.response?.status === 401 && account.refreshToken) {
            console.log('🔄 Attempting token refresh...');
            try {
              const refreshed = await refreshTwitterToken(account);
              if (refreshed) {
                tokenInfo.refreshed = true;
                tokenInfo.newToken = refreshed.newToken ? 'Yes' : 'No';
              }
            } catch (refreshError) {
              console.log('❌ Refresh failed:', refreshError.message);
            }
          }
        }
      }
      
      results.push(tokenInfo);
    }
    
    res.json({
      success: true,
      message: 'Token check completed',
      accounts: results,
      nextSteps: results.some(a => a.isExpired || !a.tokenValid) ? [
        '1. Disconnect and reconnect Twitter account',
        '2. Make sure OAuth URL includes "offline.access" scope',
        '3. Check if refresh token is being stored'
      ] : ['All tokens appear valid']
    });
    
  } catch (error) {
    console.error('Token check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper function to refresh token
async function refreshTwitterToken(account) {
  try {
    console.log(`🔄 Refreshing token for @${account.accountName}...`);
    
    const refreshResponse = await axios.post(
      'https://api.twitter.com/2/oauth2/token',
      new URLSearchParams({
        refresh_token: account.refreshToken,
        grant_type: 'refresh_token',
        client_id: process.env.TWITTER_CLIENT_ID
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
          ).toString('base64')}`
        }
      }
    );
    
    const { access_token, refresh_token, expires_in } = refreshResponse.data;
    
    // Update in database
    await prisma.socialConnection.update({
      where: { id: account.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Token refreshed successfully!');
    return { success: true, newToken: access_token };
    
  } catch (error) {
    console.error('❌ Token refresh failed:', error.response?.data || error.message);
    throw error;
  }
}
// Add this to socialController.js to test permissions
exports.checkTwitterPermissions = async (req, res) => {
  try {
    // Get account
    const accounts = await prisma.socialConnection.findMany({
      where: { platform: 'twitter', isConnected: true }
    });
    
    if (accounts.length === 0) {
      return res.json({ success: false, error: 'No Twitter accounts connected' });
    }
    
    const account = accounts[0];
    
    // Test 1: Can we read user info? (tests OAuth 2.0)
    console.log('🔍 Testing Twitter API access...');
    console.log('Access Token length:', account.accessToken?.length || 0);
    console.log('Token expires at:', account.tokenExpiresAt);
    
    const userResponse = await axios.get('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${account.accessToken}`
      },
      params: {
        'user.fields': 'id,name,username'
      }
    });
    
    console.log('✅ User read successful:', userResponse.data.data);
    
    // Test 2: Try to check rate limits (this doesn't use credits)
    const rateLimitResponse = await axios.get(
      'https://api.twitter.com/2/usage/tweets',
      {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`
        }
      }
    );
    
    console.log('📊 Rate limits:', rateLimitResponse.data);
    
    res.json({
      success: true,
      message: 'Twitter API is accessible',
      user: userResponse.data.data,
      rateLimits: rateLimitResponse.data,
      accountInfo: {
        id: account.id,
        username: account.accountName,
        hasAccessToken: !!account.accessToken,
        tokenExpiresAt: account.tokenExpiresAt,
        scopes: account.metadata?.scopes || 'Unknown'
      }
    });
    
  } catch (error) {
    console.error('❌ Twitter test failed:', error.response?.data || error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
      likelyIssue: 'Missing OAuth 2.0 permissions or credits exhausted'
    });
  }
};

exports.testOAuth1 = async (req, res) => {
  try {
    console.log('🔍 Testing OAuth 1.0a credentials...');
    
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
    
    // Test 1: Verify credentials by getting app's own user info
    const me = await twitterClient.v2.me();
    console.log('✅ App account:', me.data);
    
    // Test 2: Try to post a test tweet (then delete it)
    const testTweet = await twitterClient.v2.tweet('Test tweet from LinkHub app - please ignore');
    console.log('✅ Test tweet posted:', testTweet.data);
    
    // Delete the test tweet
    await twitterClient.v2.deleteTweet(testTweet.data.id);
    console.log('✅ Test tweet deleted');
    
    res.json({
      success: true,
      message: 'OAuth 1.0a credentials are working!',
      appAccount: me.data,
      testPassed: true,
      tier: 'Free tier posting via OAuth 1.0a should work'
    });
    
  } catch (error) {
    console.error('❌ OAuth 1.0a test failed:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.data || error.response?.data,
      solution: 'Check if your app has Read+Write permissions in Twitter Developer Portal'
    });
  }
};

// Add this function to check current setup
exports.testCurrentTwitterSetup = async (req, res) => {
  try {
    const account = await prisma.socialConnection.findFirst({
      where: { platform: 'twitter', isConnected: true }
    });
    
    if (!account) {
      return res.json({ success: false, error: 'No Twitter account connected' });
    }
    
    res.json({
      success: true,
      accountInfo: {
        id: account.id,
        username: account.accountName,
        hasOAuth2Token: !!account.accessToken,
        hasOAuth1Tokens: !!(account.metadata?.oauth1AccessToken),
        tokenExpiresAt: account.tokenExpiresAt,
        scopes: account.metadata?.scopes || []
      },
      envCredentials: {
        hasApiKey: !!process.env.TWITTER_API_KEY,
        hasApiSecret: !!process.env.TWITTER_API_SECRET,
        hasAccessToken: !!process.env.TWITTER_ACCESS_TOKEN,
        hasAccessSecret: !!process.env.TWITTER_ACCESS_SECRET
      },
      recommendations: [
        '1. Check if account has OAuth 1.0a tokens in metadata',
        '2. Add TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_SECRET to .env',
        '3. Apply for Essential access for OAuth 2.0 posting'
      ]
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Add to socialController.js

exports.fetchPostMetrics = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    const publishedPost = await prisma.publishedPost.findFirst({
      where: {
        id: parseInt(postId),
        socialAccount: {
          userId: parseInt(userId)
        }
      },
      include: {
        socialAccount: true
      }
    });

    if (!publishedPost) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    let metrics = {};

    if (publishedPost.socialAccount.platform === 'facebook') {
      metrics = await exports.getFacebookMetrics(
        publishedPost.socialAccount, 
        publishedPost.platformPostId
      );
    } else if (publishedPost.socialAccount.platform === 'instagram') {
      metrics = await
       exports.getInstagramMetrics(
        publishedPost.socialAccount, 
        publishedPost.platformPostId
      );
    } else if (publishedPost.socialAccount.platform === 'twitter') {
      // Twitter metrics would go here
      metrics = { likes: 0, retweets: 0, replies: 0 };
    } else if (publishedPost.socialAccount.platform === 'linkedin') {
      // LinkedIn metrics would go here
      metrics = { likes: 0, comments: 0, shares: 0 };
    }

    // Update the post with metrics
    if (Object.keys(metrics).length > 0) {
      await prisma.publishedPost.update({
        where: { id: publishedPost.id },
        data: { metrics }
      });
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching post metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch metrics',
      error: error.message
    });
  }
};

exports.fetchFacebookPageInsights = async (socialAccount, accessToken) => {
  try {
    const pageId = socialAccount.metadata?.pageId || socialAccount.platformUserId;
    
    if (!pageId) {
      console.log('No page ID found for Facebook account');
      return null;
    }

    console.log(`📘 Fetching Facebook data for ${socialAccount.accountName}`);
    console.log(`   Using Page ID: ${pageId}`);

    // Get page info with fan count
    let followerCount = 0;
    try {
      const pageUrl = `https://graph.facebook.com/v18.0/${pageId}`;
      const pageRes = await axios.get(pageUrl, {
        params: {
          fields: 'fan_count',
          access_token: accessToken
        }
      });
      followerCount = pageRes.data.fan_count || 0;
    } catch (err) {
      console.error('   Could not fetch follower count:', err.message);
    }

    // Get posts using the correct endpoint
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let postsCount = 0;
    
    try {
      // Use 'posts' endpoint instead of 'published_posts' or 'feed'
      const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts`;
      const postsRes = await axios.get(postsUrl, {
        params: {
          fields: 'id,message,likes.limit(0).summary(true),comments.limit(0).summary(true)',
          limit: 100,
          access_token: accessToken
        }
      });

      if (postsRes.data.data) {
        postsCount = postsRes.data.data.length;
        
        // For each post, get full metrics
        for (const post of postsRes.data.data) {
          // Get likes count
          totalLikes += post.likes?.summary?.total_count || 0;
          
          // Get comments count
          totalComments += post.comments?.summary?.total_count || 0;
          
          // For shares, we need a separate call per post
          try {
            const sharesUrl = `https://graph.facebook.com/v18.0/${post.id}/sharedposts`;
            const sharesRes = await axios.get(sharesUrl, {
              params: {
                summary: 'total_count',
                access_token: accessToken
              }
            });
            totalShares += sharesRes.data.summary?.total_count || 0;
          } catch (e) {
            // Shares not available for this post
          }
        }
        
        console.log(`   Found ${postsCount} posts`);
        console.log(`   Total likes: ${totalLikes}, comments: ${totalComments}, shares: ${totalShares}`);
      }
    } catch (postsError) {
      console.log('   Could not fetch posts:', postsError.message);
    }

    return {
      followers: followerCount,
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
      reach: 0,
      impressions: 0,
      profileViews: 0,
      mediaCount: postsCount
    };
  } catch (error) {
    console.error('Error fetching Facebook data:', error.message);
    return null;
  }
};
exports.fetchInstagramInsights = async (socialAccount, accessToken) => {
  try {
    const instagramId = socialAccount.metadata?.instagramId || socialAccount.platformUserId;
    
    if (!instagramId) {
      console.log('No Instagram ID found');
      return null;
    }

    console.log(`📸 Fetching Instagram data for ${socialAccount.accountName}`);

    // Get account info with follower count
    let followerCount = 0;
    let mediaCount = 0;
    try {
      const accountUrl = `https://graph.facebook.com/v18.0/${instagramId}`;
      const accountRes = await axios.get(accountUrl, {
        params: {
          fields: 'followers_count,media_count',
          access_token: accessToken
        }
      });
      followerCount = accountRes.data.followers_count || 0;
      mediaCount = accountRes.data.media_count || 0;
      console.log(`   Followers: ${followerCount}, Total Media: ${mediaCount}`);
    } catch (err) {
      console.log('   Could not fetch account info:', err.message);
    }

    // Get recent media to calculate likes/comments
    let totalLikes = 0;
    let totalComments = 0;
    let processedPosts = 0;
    
    try {
      const mediaUrl = `https://graph.facebook.com/v18.0/${instagramId}/media`;
      const mediaRes = await axios.get(mediaUrl, {
        params: {
          fields: 'id,like_count,comments_count',
          limit: 50,
          access_token: accessToken
        }
      });

      if (mediaRes.data.data) {
        processedPosts = mediaRes.data.data.length;
        
        mediaRes.data.data.forEach(media => {
          totalLikes += media.like_count || 0;
          totalComments += media.comments_count || 0;
        });

        console.log(`   Processed ${processedPosts} posts`);
        console.log(`   Total likes: ${totalLikes}, Total comments: ${totalComments}`);
      }
    } catch (err) {
      console.log('   Could not fetch media insights:', err.message);
    }

    return {
      followers: followerCount,
      likes: totalLikes,
      comments: totalComments,
      shares: 0,
      reach: 0,
      impressions: 0,
      profileViews: 0,
      mediaCount: mediaCount
    };
  } catch (error) {
    console.error('Error fetching Instagram data:', error.response?.data || error.message);
    return null;
  }
};

exports.storeUserAnalytics = async (userId) => {
  try {
    console.log(`📊 Storing analytics for user ${userId}`);
    
    // First, verify the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user) {
      console.log(`❌ User ${userId} not found!`);
      return 0;
    }
    
    // Get all connected social accounts for THIS user
    const socialAccounts = await prisma.socialConnection.findMany({
      where: { 
        userId: userId,
        isConnected: true 
      }
    });

    console.log(`📊 Found ${socialAccounts.length} connected accounts for user ${userId}:`, 
      socialAccounts.map(a => ({ id: a.id, platform: a.platform, name: a.accountName })));

    if (socialAccounts.length === 0) {
      console.log(`⚠️ No connected accounts found for user ${userId}`);
      return 0;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    let storedCount = 0;

    for (const account of socialAccounts) {
      console.log(`\n📊 Processing account: ${account.platform} - ${account.accountName} (ID: ${account.id})`);
      
      // Double-check this account exists in the database
      const verifyAccount = await prisma.socialConnection.findUnique({
        where: { id: account.id }
      });
      
      if (!verifyAccount) {
        console.log(`❌ Account ID ${account.id} not found in SocialConnection table! Skipping...`);
        continue;
      }
      
      console.log(`✅ Account verified: ${verifyAccount.platform} - ${verifyAccount.accountName}`);

      let insights = null;

      if (account.platform === 'facebook') {
        insights = await exports.fetchFacebookPageInsights(account, account.accessToken);
      } else if (account.platform === 'instagram') {
        insights = await exports.fetchInstagramInsights(account, account.accessToken);
      } else {
        console.log(`   Skipping ${account.platform} - not supported for analytics`);
        continue;
      }

      if (insights) {
        // Prepare data - WITHOUT reach and impressions
        const analyticsData = {
          followers: insights.followers || 0,
          likes: insights.likes || 0,
          comments: insights.comments || 0,
          shares: insights.shares || 0,
          mediaCount: insights.mediaCount || 0
          // reach and impressions removed as requested
        };

        console.log(`   Analytics data (without reach/impressions):`, analyticsData);

        try {
          // Check if analytics already exist for this date and account
          const existing = await prisma.analytics.findFirst({
            where: {
              socialAccountId: account.id,
              date: yesterday
            }
          });

          if (existing) {
            // Update existing
            await prisma.analytics.update({
              where: { id: existing.id },
              data: analyticsData
            });
            console.log(`✅ Updated analytics for ${account.platform} - ${account.accountName}`);
            storedCount++;
          } else {
            // Create new
            await prisma.analytics.create({
              data: {
                socialAccountId: account.id,
                date: yesterday,
                ...analyticsData
              }
            });
            console.log(`✅ Created analytics for ${account.platform} - ${account.accountName}`);
            storedCount++;
          }
        } catch (dbError) {
          console.error(`❌ Database error for account ${account.id}:`, dbError.message);
        }
      } else {
        console.log(`   No insights returned for ${account.platform}`);
      }
    }

    console.log(`\n✅ Stored/Updated ${storedCount} analytics records for user ${userId}`);
    return storedCount;
  } catch (error) {
    console.error('Error in storeUserAnalytics:', error);
    throw error;
  }
};
exports.syncInstagramPostsForAccount = async (account) => {
  try {
    console.log(`🔄 Syncing Instagram posts for ${account.accountName}`);
    
    const instagramId = account.metadata?.instagramId || account.platformUserId;
    
    if (!instagramId) {
      console.log(`   No Instagram ID for ${account.accountName}`);
      return 0;
    }

    // Fetch recent media from Instagram
    const mediaUrl = `https://graph.facebook.com/v18.0/${instagramId}/media`;
    const mediaRes = await axios.get(mediaUrl, {
      params: {
        fields: 'id,like_count,comments_count,timestamp',
        limit: 50,
        access_token: account.accessToken
      }
    });

    if (!mediaRes.data.data) return 0;

    console.log(`   Found ${mediaRes.data.data.length} Instagram posts`);
    
    let syncedCount = 0;

    for (const media of mediaRes.data.data) {
      // Check if post already exists for this account
      const existingPost = await prisma.publishedPost.findFirst({
        where: {
          socialAccountId: account.id,
          platformPostId: media.id
        }
      });

      if (!existingPost) {
        // Create a draft if needed
        const draft = await prisma.draft.create({
          data: {
            userId: account.userId,
            masterContent: `Instagram post from ${new Date(media.timestamp).toLocaleDateString()}`,
            status: 'PUBLISHED',
            mediaUrls: []
          }
        });

        // Create published post record
        await prisma.publishedPost.create({
          data: {
            draftId: draft.id,
            socialAccountId: account.id,
            platformPostId: media.id,
            status: 'published',
            publishedAt: new Date(media.timestamp),
            metrics: {
              likes: media.like_count || 0,
              comments: media.comments_count || 0,
              shares: 0
            }
          }
        });
        syncedCount++;
        console.log(`   ✅ Synced new post ${media.id}`);
      } else {
        // Update metrics for existing post
        await prisma.publishedPost.update({
          where: { id: existingPost.id },
          data: {
            metrics: {
              likes: media.like_count || 0,
              comments: media.comments_count || 0,
              shares: 0
            }
          }
        });
        console.log(`   ✅ Updated metrics for post ${media.id}`);
      }
    }

    return syncedCount;
  } catch (err) {
    console.error(`   Error syncing Instagram posts:`, err.message);
    return 0;
  }
};

// Fix syncInstagramPosts to use the account-specific function
exports.syncInstagramPosts = async (userId) => {
  try {
    console.log(`🔄 Syncing Instagram posts for user ${userId}`);
    
    const instagramAccounts = await prisma.socialConnection.findMany({
      where: {
        userId,
        platform: 'instagram',
        isConnected: true
      }
    });

    let totalSynced = 0;

    for (const account of instagramAccounts) {
      const synced = await exports.syncInstagramPostsForAccount(account);
      totalSynced += synced;
    }

    console.log(`✅ Synced ${totalSynced} new Instagram posts total`);
    return totalSynced;
  } catch (error) {
    console.error('Error syncing Instagram posts:', error);
    throw error;
  }
};

// In socialController.js - Updated for PAGE tokens

exports.getFacebookMetrics = async (socialAccount, postId) => {
  try {
    console.log(`📊 Fetching Facebook metrics for post ${postId}`);
    
    let likes = 0;
    let comments = 0;
    let shares = 0;
    
    // For PAGE tokens, we need to use the page-scoped post ID format
    // Sometimes it's {pageId}_{postId} instead of just postId
    const pageId = socialAccount.platformUserId; // This is your page ID
    const scopedPostId = `${pageId}_${postId}`;
    
    console.log(`   Using page ID: ${pageId}`);
    console.log(`   Trying scoped post ID: ${scopedPostId}`);
    
    // APPROACH 1: Try with scoped post ID first
    try {
      console.log('   Attempting to fetch comments with scoped ID...');
      const commentsUrl = `https://graph.facebook.com/v18.0/${scopedPostId}/comments`;
      const commentsRes = await axios.get(commentsUrl, {
        params: {
          summary: 'total_count',
          access_token: socialAccount.accessToken,
          fields: 'id,message,created_time'
        }
      });
      
      comments = commentsRes.data.summary?.total_count || 0;
      console.log(`   Comments from scoped ID: ${comments}`);
      
      if (commentsRes.data.data && commentsRes.data.data.length > 0) {
        console.log(`   Sample comment:`, commentsRes.data.data[0]);
      }
    } catch (err) {
      console.log(`   Scoped ID comments failed:`, err.response?.data?.error?.message || err.message);
    }

    // APPROACH 2: If scoped ID fails, try regular post ID
    if (comments === 0) {
      try {
        console.log('   Attempting to fetch comments with regular ID...');
        const commentsUrl = `https://graph.facebook.com/v18.0/${postId}/comments`;
        const commentsRes = await axios.get(commentsUrl, {
          params: {
            summary: 'total_count',
            access_token: socialAccount.accessToken,
            fields: 'id,message,created_time'
          }
        });
        
        comments = commentsRes.data.summary?.total_count || 0;
        console.log(`   Comments from regular ID: ${comments}`);
      } catch (err) {
        console.log(`   Regular ID comments failed:`, err.response?.data?.error?.message || err.message);
      }
    }

    // Get shares
    try {
      console.log('   Attempting to fetch shares...');
      const sharesUrl = `https://graph.facebook.com/v18.0/${postId}/sharedposts`;
      const sharesRes = await axios.get(sharesUrl, {
        params: {
          summary: 'total_count',
          access_token: socialAccount.accessToken
        }
      });
      shares = sharesRes.data.summary?.total_count || 0;
      console.log(`   Shares: ${shares}`);
    } catch (err) {
      console.log(`   Shares not available for this post type`);
    }

    // Get likes
    try {
      console.log('   Attempting to fetch likes...');
      const likesUrl = `https://graph.facebook.com/v18.0/${postId}/likes`;
      const likesRes = await axios.get(likesUrl, {
        params: {
          summary: 'total_count',
          access_token: socialAccount.accessToken
        }
      });
      likes = likesRes.data.summary?.total_count || 0;
      console.log(`   Likes: ${likes}`);
    } catch (err) {
      console.log(`   Likes endpoint failed, trying reactions...`);
      
      try {
        const reactionsUrl = `https://graph.facebook.com/v18.0/${postId}/reactions`;
        const reactionsRes = await axios.get(reactionsUrl, {
          params: {
            type: 'LIKE',
            summary: 'total_count',
            access_token: socialAccount.accessToken
          }
        });
        likes = reactionsRes.data.summary?.total_count || 0;
        console.log(`   Likes from reactions: ${likes}`);
      } catch (e) {
        console.log('   Reactions also failed');
      }
    }

    const metrics = {
      likes,
      comments,
      shares,
      reach: 0
    };
    
    console.log(`✅ Final Facebook metrics:`, metrics);
    return metrics;

  } catch (error) {
    console.error('❌ Error in getFacebookMetrics:', error.message);
    return { likes: 0, comments: 0, shares: 0, reach: 0 };
  }
};
// In socialController.js - UPDATED with shares!

exports.getInstagramMetrics = async (socialAccount, mediaId) => {
  try {
    console.log(`📊 Fetching ALL Instagram metrics for media ${mediaId}`);
    
    // 1. Basic metrics (likes, comments)
    const mediaUrl = `https://graph.facebook.com/v18.0/${mediaId}`;
    const mediaRes = await axios.get(mediaUrl, {
      params: {
        fields: 'like_count,comments_count',
        access_token: socialAccount.accessToken
      }
    });

    // 2. Get shares via insights (YE NAYA HAI!)
    let shares = 0;
    try {
      const insightsUrl = `https://graph.facebook.com/v18.0/${mediaId}/insights`;
      const insightsRes = await axios.get(insightsUrl, {
        params: {
          metric: 'shares',
          period: 'lifetime',
          access_token: socialAccount.accessToken
        }
      });
      
      // Parse shares from response
      if (insightsRes.data.data && insightsRes.data.data.length > 0) {
        shares = insightsRes.data.data[0].values[0].value || 0;
      }
      console.log(`   Shares from insights: ${shares}`);
    } catch (insightsErr) {
      console.log('   Shares insights not available:', insightsErr.message);
    }

    // 3. Get reach and impressions
    let reach = 0;
    let impressions = 0;
    try {
      const insightsUrl2 = `https://graph.facebook.com/v18.0/${mediaId}/insights`;
      const insightsRes2 = await axios.get(insightsUrl2, {
        params: {
          metric: 'reach,impressions',
          period: 'lifetime',
          access_token: socialAccount.accessToken
        }
      });
      
      insightsRes2.data.data.forEach(metric => {
        if (metric.name === 'reach') reach = metric.values[0].value || 0;
        if (metric.name === 'impressions') impressions = metric.values[0].value || 0;
      });
    } catch (err) {
      console.log('   Reach/impressions not available');
    }

    const metrics = {
      likes: mediaRes.data.like_count || 0,
      comments: mediaRes.data.comments_count || 0,
      shares: shares,  // ✅ AB SHARES BHI AYENGE!
      reach: reach,
      impressions: impressions
    };

    console.log(`✅ Instagram metrics with SHARES:`, metrics);
    return metrics;

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    return { 
      likes: 0, 
      comments: 0, 
      shares: 0, 
      reach: 0, 
      impressions: 0 
    };
  }
};


exports.oauthStates = oauthStates;