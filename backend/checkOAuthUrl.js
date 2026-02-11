const crypto = require('crypto');

function checkCurrentOAuthUrl() {
  console.log('🔍 Checking Current Twitter OAuth URL\n');
  console.log('='.repeat(60));
  
  // Simulate what your getOAuthUrl function generates
  const scopesOld = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ');
  const scopesNew = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'].join(' ');
  
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  console.log('📜 OLD URL (missing media.write):');
  console.log('-'.repeat(40));
  console.log(`Scopes: ${scopesOld}`);
  console.log('❌ Problem: Cannot upload images');
  console.log('');
  
  console.log('📜 NEW URL (with media.write):');
  console.log('-'.repeat(40));
  console.log(`Scopes: ${scopesNew}`);
  console.log('✅ Can upload images');
  console.log('');
  
  const oldUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.TWITTER_REDIRECT_URI)}&scope=${encodeURIComponent(scopesOld)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  
  const newUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.TWITTER_REDIRECT_URI)}&scope=${encodeURIComponent(scopesNew)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  
  console.log('🔗 URL Comparison:');
  console.log('-'.repeat(40));
  console.log('OLD (no media):', oldUrl.substring(0, 100) + '...');
  console.log('');
  console.log('NEW (with media):', newUrl.substring(0, 100) + '...');
  console.log('');
  
  console.log('🎯 ACTION: Update scopes in getOAuthUrl function');
  console.log('='.repeat(60));
}

checkCurrentOAuthUrl();