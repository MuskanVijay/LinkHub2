// middleware/adminMiddleware.js
const adminMiddleware = (req, res, next) => {
  try {
    console.log('🔐 Admin middleware checking:', { 
      path: req.path,
      user: req.user,
      userRole: req.user?.role
    });
    
    // Check if user exists and is admin
    if (!req.user) {
      console.log('❌ No user in request');
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'ADMIN') {
      console.log('❌ Not admin:', req.user.role);
      return res.status(403).json({ 
        error: 'Access denied. Admin privileges required.',
        yourRole: req.user.role,
        requiredRole: 'ADMIN'
      });
    }
    
    console.log('✅ Admin access granted');
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Server error in admin verification' });
  }
};

module.exports = adminMiddleware;