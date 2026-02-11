const express = require('express');
const router = express.Router();
const draftsController = require('../controllers/draftsController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/drafts');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const userId = req.user ? (req.user.userId || req.user.id) : 'unknown';
    cb(null, `draft-${userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (JPEG, PNG, GIF, WebP) and videos (MP4, MOV) are allowed'));
    }
  }
});

// Routes
router.post('/create', 
  authMiddleware, 
  upload.array('media', 10),
  (req, res, next) => {
    console.log("🔄 Multer processed files:", req.files ? req.files.length : 0);
    console.log("📝 Request body:", req.body);
    next();
  },
  draftsController.createDraft
);

router.get('/', authMiddleware, draftsController.getUserDrafts);
router.get('/my-drafts', authMiddleware, draftsController.getUserDrafts);
router.get('/:id', authMiddleware, draftsController.getDraftById);
router.delete('/:id', authMiddleware, draftsController.deleteDraft);
router.get('/social-accounts', authMiddleware, draftsController.getUserSocialAccounts);
router.post('/:id/schedule', authMiddleware, draftsController.scheduleDraft);

// AI Caption Generation
router.post('/generate-ai-caption', authMiddleware, draftsController.generateAICaption);

// Publish route
router.post('/:id/publish', authMiddleware, draftsController.publishDraft);

// Admin routes
router.get('/admin/all-drafts', authMiddleware, adminMiddleware, draftsController.getAllDraftsForAdmin);
router.put('/admin/:id/status', authMiddleware, adminMiddleware, draftsController.updateDraftStatus);

// Calendar routes
router.get('/calendar', authMiddleware, draftsController.getCalendarEvents);
router.get('/calendar/drafts', authMiddleware, draftsController.getCalendarDrafts);

// Status update route (user)
router.patch('/:id/status', authMiddleware, draftsController.updateDraftStatus);

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    backendUrl: process.env.BACKEND_URL,
    tunnelActive: true
  });
});

module.exports = router;