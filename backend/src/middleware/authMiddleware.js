const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // List of public routes that don't need authentication
  const publicRoutes = [
    '/oauth/facebook/callback',
    '/callback/twitter',
    '/oauth/twitter/callback',
    '/debug-twitter',
    '/test-route',
    '/debug-states'
  ];
  
  // Check if current path is in public routes
  const isPublicRoute = publicRoutes.some(route => req.path.includes(route));
  
  if (isPublicRoute) {
    console.log(`🔄 Skipping auth for public route: ${req.path}`);
    return next();
  }
  
  console.log('=== AUTH MIDDLEWARE ===');
  console.log('Path:', req.path);
  console.log('Headers authorization:', req.headers.authorization);

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('ERROR: No Authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded user:', decoded);
    
    // Ensure we have userId
    if (!decoded.userId && decoded.id) {
      decoded.userId = decoded.id;
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    console.log('ERROR: Invalid token:', error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;