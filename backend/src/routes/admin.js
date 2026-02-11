const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

router.get('/dashboard', authMiddleware, adminMiddleware, adminController.getDashboardStats);
router.get('/users', authMiddleware, adminMiddleware, adminController.getAllUsers);
router.get('/posts', authMiddleware, adminMiddleware, adminController.getAllPosts);
router.put('/users/:id/block', authMiddleware, adminMiddleware, adminController.blockUser);
router.put('/posts/:id/approve', authMiddleware, adminMiddleware, adminController.approvePost);
router.put('/posts/:id/reject', authMiddleware, adminMiddleware, adminController.rejectPost);

router.put('/users/:id', authMiddleware, adminMiddleware, adminController.updateUser);
router.delete('/users/:id', authMiddleware, adminMiddleware, adminController.deleteUser);
router.put('/users/:id/status', authMiddleware, adminMiddleware, adminController.updateUserStatus);
module.exports = router;