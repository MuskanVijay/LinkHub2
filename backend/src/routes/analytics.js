const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get analytics dashboard
router.get('/', analyticsController.getAnalytics);

// Get platform-specific analytics
router.get('/platform/:platform', analyticsController.getPlatformAnalytics);

// Get post performance
router.get('/posts/:postId', analyticsController.getPostPerformance);

// Refresh analytics
router.post('/refresh', analyticsController.refreshAnalytics);

// Export analytics
router.get('/export', analyticsController.exportAnalytics);

router.post('/posts/:postId/refresh', analyticsController.refreshPostMetrics);
router.post('/reset', analyticsController.resetAndRefreshAnalytics);
router.get('/debug', analyticsController.debugAnalytics);

router.post('/sync-instagram', analyticsController.syncInstagramPosts);
router.post('/sync-instagram', analyticsController.syncInstagramPosts);
router.get('/diagnose', analyticsController.diagnoseAnalytics);
router.post('/force-refresh', analyticsController.forceRefreshAllMetrics);
router.post('/fix-posts', analyticsController.fixExistingPosts);

module.exports = router;