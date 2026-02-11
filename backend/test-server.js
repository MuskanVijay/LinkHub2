// backend/test-server.js
const express = require('express');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware to log ALL requests
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Test route
app.get('/api/admin/debug', (req, res) => {
  console.log('✅ Debug route hit!');
  res.json({ message: 'Debug route works!', time: new Date() });
});

// Import and use admin routes
const adminRoutes = require('./src/routes/admin');
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found', path: req.url });
});

const PORT = 5002;
app.listen(PORT, () => {
  console.log(`🚀 Test server on http://localhost:${PORT}`);
  console.log(`🔗 Test: http://localhost:${PORT}/api/admin/debug`);
});