// routes/faq.js
const express = require('express');
const router = express.Router();
const { getQuestions, createQuestion, createReply } = require('../controllers/faqController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/questions', authMiddleware, getQuestions);
router.post('/questions', authMiddleware, createQuestion);
router.post('/questions/:questionId/replies', authMiddleware, createReply);
router.post('/questions/:questionId/like', authMiddleware, require('../controllers/faqController').likeQuestion);
router.delete('/questions/:questionId', authMiddleware, require('../controllers/faqController').deleteQuestion);
module.exports = router;
