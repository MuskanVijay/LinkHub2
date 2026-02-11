const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
  signup, 
  login, 
  verifyOtp, 
  getUserProfile, 
  updateProfile, 
  getAllUsers, 
  testEmail,
  getCurrentUser,
  deleteAccount,
  uploadProfilePicture,
  removeProfilePicture,
  forgotPassword,
  validateResetToken,       
  updatePasswordWithToken,
  resendOtp,
  testVerifyRoute
} = require('../controllers/usersController');
const authMiddleware = require('../middleware/authMiddleware');

// Configure multer for profile pictures
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/profile-pictures');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const userId = req.user ? (req.user.userId || req.user.id) : 'unknown';
    cb(null, `profile-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const profileUpload = multer({ 
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// === PUBLIC ROUTES ===
router.get('/test-email', testEmail);
router.post('/signup', signup);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/test-verify', testVerifyRoute);

// === PASSWORD RESET ROUTES ===
router.post('/forgot-password', forgotPassword);
router.get('/reset-password', validateResetToken);
router.post('/update-password', updatePasswordWithToken);

// === PROTECTED ROUTES ===
router.get('/all', authMiddleware, getAllUsers);
router.get('/me', authMiddleware, getCurrentUser);

// Profile picture routes with multer
router.delete('/profile-picture', authMiddleware, removeProfilePicture);
router.post('/upload-profile-picture', 
  authMiddleware, 
  profileUpload.single('profilePicture'), 
  uploadProfilePicture
);

router.get('/:id', authMiddleware, getUserProfile);
router.put('/:id', authMiddleware, updateProfile);
router.delete('/:id', authMiddleware, deleteAccount);

module.exports = router;