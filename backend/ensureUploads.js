const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'src/uploads');
const profilePicsDir = path.join(uploadsDir, 'profile-pictures');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

if (!fs.existsSync(profilePicsDir)) {
  fs.mkdirSync(profilePicsDir, { recursive: true });
  console.log('✅ Created profile-pictures directory');
}

console.log('📁 Uploads directory structure ready');