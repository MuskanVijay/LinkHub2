require('dotenv').config();
require('./services/scheduler');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); 
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Setup uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
const profilePicsDir = path.join(uploadsDir, 'profile-pictures');
const draftsDir = path.join(uploadsDir, 'drafts');

// Create directories if they don't exist
[uploadsDir, profilePicsDir, draftsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Debug logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// ========== ROUTES ==========
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

const draftRoutes = require('./routes/drafts');
app.use('/api/drafts', draftRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

const faqRoutes = require('./routes/faq');
app.use('/api/faq', faqRoutes);

const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

const socialRoutes = require('./routes/social');
app.use('/api/social', socialRoutes);

// // Debug endpoints
// app.get('/api/test-upload', (req, res) => {
//   const testImagePath = path.join(__dirname, '..', 'uploads', 'drafts');
  
//   fs.readdir(testImagePath, (err, files) => {
//     if (err) {
//       return res.json({ 
//         success: false, 
//         error: err.message,
//         path: testImagePath 
//       });
//     }
    
//     res.json({ 
//       success: true, 
//       files: files,
//       fullPath: testImagePath 
//     });
//   });
// });
// Add this route handler
app.get('/', (req, res) => {
  const baseUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
  res.json({
    message: 'LinkHub Backend API',
    status: 'running',
    endpoints: {
      api: `${baseUrl}/api`,
      uploads: `${baseUrl}/uploads`
    }
  });
});

// Add robots.txt to stop crawlers
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow: /');
});

// Add favicon
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content
});
// ========== ERROR HANDLING ==========

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false,
    error: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🌐 Public URL: ${process.env.BACKEND_URL}`);
});