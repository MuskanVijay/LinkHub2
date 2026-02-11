console.log('🔧 Fixing Twitter Project/App Issue\n');
console.log('='.repeat(60));

const steps = [
  '🚨 PROBLEM: App not attached to Project',
  '✅ SOLUTION: Create Project in Legacy Portal\n',
  
  '📋 STEP-BY-STEP:',
  '1. Go to: https://developer.twitter.com',
  '2. Log in with your account',
  '3. Look for "Create Project" or "Get Started"',
  '4. Create project named "LinkHub"',
  '5. Select use case:',
  '   - Choose "Making a bot" OR',
  '   - Choose "Posting Tweets"',
  '6. Select "Essential" tier (FREE)',
  '7. Complete project creation\n',
  
  '🛠️ AFTER PROJECT CREATION:',
  '1. Click "Create App" within the project',
  '2. App name: "LinkHub App"',
  '3. Copy NEW credentials:',
  '   - API Key & Secret (OAuth 1.0a)',
  '   - Access Token & Secret (OAuth 1.0a)',
  '   - Client ID & Secret (OAuth 2.0)',
  '4. Update your .env file\n',
  
  '🔄 IF USING EXISTING APP:',
  '1. In project dashboard, click "Add App"',
  '2. Select your existing "LinkHub Social Manager"',
  '3. Make sure app shows under your project\n',
  
  '🧪 TEST AFTER FIX:',
  '1. Run: node testPostNow.js',
  '2. Should see: "✅ SUCCESS! Tweet published!"'
];

steps.forEach(step => console.log(step));

console.log('\n' + '='.repeat(60));
console.log('💡 IMPORTANT:');
console.log('• Projects are MANDATORY in legacy portal');
console.log('• Apps must be linked to a project');
console.log('• Essential tier = 500 posts/month FREE');
console.log('='.repeat(60));