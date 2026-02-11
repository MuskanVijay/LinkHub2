
app.get('/api/admin/debug', (req, res) => {
  console.log('🔍 Debug route hit from server.js');
  res.json({ 
    message: 'Direct route from server.js works',
    time: new Date()
  });
});
const adminRoutes = require('./src/routes/admin');
app.use('/api/admin', adminRoutes);