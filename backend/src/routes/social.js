 const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const authMiddleware = require('../middleware/authMiddleware');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');

// Facebook OAuth callback - MUST BE PUBLIC
router.get('/oauth/facebook/callback', socialController.facebookCallback);
router.get('/callback/facebook', socialController.facebookCallback);

// Twitter OAuth 2.0 callback - MUST BE PUBLIC
router.get('/callback/twitter', socialController.twitterCallback); 

router.get('/callback/linkedin', socialController.linkedInCallback);
router.get('/oauth/linkedin/callback', socialController.linkedInCallback);

router.post('/webhook/linkedin', socialController.linkedInWebhook);
router.post('/linkedin/register', authMiddleware, socialController.registerLinkedInPost);

// Twitter OAuth 1.0a callback - MUST BE PUBLIC
router.get('/callback/twitter-oauth1', socialController.twitterOAuth1Callback);
router.get('/check-tokens', socialController.checkTwitterToken);
router.get('/debug-twitter', socialController.debugTwitterMedia);
router.get('/simple-media-test', socialController.simpleMediaTest);
router.get('/debug/file-location', socialController.debugFileLocation);

// ==================== AUTHENTICATED ROUTES ====================
// Everything below this line requires authentication
router.use(authMiddleware);

// Account management
router.get('/accounts', socialController.getConnectedAccounts);
router.get('/oauth/:platform', socialController.getOAuthUrl); // This generates OAuth URL
router.delete('/accounts/:id', socialController.disconnectAccount);

// Publishing
router.post('/publish-draft/:draftId', socialController.publishToSocialMedia);

// Twitter OAuth 1.0a routes for posting capability
router.get('/oauth/twitter-oauth1', socialController.getTwitterOAuth1Url);

// Twitter Testing Routes (Authenticated)
router.get('/test/twitter/oauth2', socialController.checkOAuth2Setup);
router.get('/test/twitter/oauth1', socialController.testOAuth1);

module.exports = router;
