// routes/contact.js
const express = require('express');
const router = express.Router();
const { 
  createContactMessage, 
  getAllContactMessages, 
  updateMessageStatus, 
  getContactStats,
  testEmail 
} = require('../controllers/contactController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Public test endpoint
router.get('/test-email', testEmail);

// Send contact message (authenticated users)
router.post('/', authMiddleware, createContactMessage);

// Admin routes
router.get('/all', authMiddleware, adminMiddleware, getAllContactMessages);
router.put('/:id/status', authMiddleware, adminMiddleware, updateMessageStatus);
router.get('/stats', authMiddleware, adminMiddleware, getContactStats);

module.exports = router;