const express = require('express');
const router = express.Router();
const inboxController = require('../controllers/inboxController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get inbox messages
router.get('/', inboxController.getInbox);

// Get inbox statistics
router.get('/stats', inboxController.getInboxStats);

// Get unread count
router.get('/unread', inboxController.getUnreadCount);

// Fetch new messages from platforms
router.post('/fetch', inboxController.fetchMessages);

// Get single message with thread
router.get('/:messageId', inboxController.getMessage);

// Reply to message
router.post('/:messageId/reply', inboxController.replyToMessage);

// Mark message as read
router.put('/:messageId/read', inboxController.markAsRead);

// Mark multiple messages as read
router.put('/read/multiple', inboxController.markMultipleAsRead);

// Delete message
router.delete('/:messageId', inboxController.deleteMessage);

module.exports = router;