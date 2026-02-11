const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const socialController = require('./socialController');
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
    cb(null, `draft-${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
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
}).array('media', 10); // Allow up to 10 files

// Helper to ensure directory exists
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};
exports.createDraft = async (req, res) => {
  try {
    const { 
      masterContent, 
      platforms, 
      platformData, 
      status, 
      scheduledAt,
      socialAccountIds
    } = req.body;
    
    console.log("=== CREATE DRAFT START ===");
    
    // ✅ MOVE THIS FUNCTION OUTSIDE THE LOOP
    const getBackendUrl = () => {
      return process.env.BACKEND_URL || 'https://linkhub-backend.loca.lt';
    };
    
    // Handle Media Files
    let mediaUrls = [];
    
    if (req.files && req.files.length > 0) {
      console.log(`Processing ${req.files.length} files:`);
      req.files.forEach((file, index) => {
        console.log(`📄 File ${index + 1}:`, {
          filename: file.filename,
          originalname: file.originalname,
          path: file.path,
          size: file.size,
          mimetype: file.mimetype
        });
        
        const webPath = `/uploads/drafts/${file.filename}`;
        const fullUrl = `${getBackendUrl()}${webPath}`;
        console.log(`🌐 Media URL: ${fullUrl}`);
        mediaUrls.push(fullUrl);
      });
    } else {
      console.log("⚠️ No files uploaded");
    }
    console.log("📸 Final media URLs for DB:", mediaUrls);
    
    // Parse platforms
    let platformsArray = [];
    if (platforms) {
      try {
        platformsArray = Array.isArray(platforms) 
          ? platforms 
          : JSON.parse(platforms);
      } catch (e) {
        console.error("❌ Error parsing platforms:", e);
        platformsArray = [];
      }
    }
    
    // Parse platformData
    let platformDataObj = {};
    if (platformData) {
      try {
        platformDataObj = typeof platformData === 'string' 
          ? JSON.parse(platformData) 
          : platformData;
      } catch (e) {
        console.error("❌ Error parsing platformData:", e);
        platformDataObj = {};
      }
    }
    
    // Parse socialAccountIds
    let socialAccountIdsArray = [];
    if (socialAccountIds) {
      try {
        socialAccountIdsArray = Array.isArray(socialAccountIds) 
          ? socialAccountIds 
          : JSON.parse(socialAccountIds);
      } catch (e) {
        console.error("❌ Error parsing socialAccountIds:", e);
        socialAccountIdsArray = [];
      }
    }
    
    console.log("🔗 Parsed socialAccountIds:", socialAccountIdsArray);
    
    // Get user ID
    const userId = req.user.userId || req.user.id;
    console.log("👤 Creating draft for user ID:", userId);
    
    const newDraft = await prisma.draft.create({
      data: {
        userId: parseInt(userId),
        masterContent: masterContent || '',
        platforms: platformsArray,
        platformData: platformDataObj,
        status: 'PENDING', // ALWAYS PENDING when submitted for approval
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        mediaUrls: mediaUrls,
        analytics: { 
          socialAccountIds: socialAccountIdsArray,
          selectedAt: new Date().toISOString(),
          submissionInfo: {
            timestamp: new Date().toISOString(),
            userId: userId,
            platformCount: platformsArray.length
          }
        }
      }
    });
    
    console.log("✅ Draft created successfully:", {
      id: newDraft.id,
      mediaUrls: newDraft.mediaUrls,
      mediaCount: newDraft.mediaUrls ? newDraft.mediaUrls.length : 0,
      socialAccountIdsCount: socialAccountIdsArray.length,
      status: newDraft.status
    });
    console.log("=== CREATE DRAFT END ===");
    
    res.status(201).json({ 
      success: true, 
      data: newDraft,
      message: `Draft created with ${mediaUrls.length} media files and ${socialAccountIdsArray.length} social accounts. Status: ${newDraft.status}`
    });
    
  } catch (error) {
    console.error("❌ Create Draft Error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: "Check server logs for more information"
    });
  }
};
exports.getUserDrafts = async (req, res) => {
    try {
        // Log to terminal to verify the function is actually running
        console.log("📥 Fetching drafts for User ID:", req.user.userId);

        const drafts = await prisma.draft.findMany({
            where: { 
                // Ensure ID is an integer as per your pgAdmin screenshot
                userId: parseInt(req.user.userId) 
            },
            orderBy: { 
                createdAt: 'desc' 
            }
        });

        console.log(`✅ Found ${drafts.length} drafts in DB.`);

        // This structure is MANDATORY for your frontend MyDrafts.js
        return res.status(200).json({ 
            success: true, 
            data: drafts 
        }); 
    } catch (error) {
        console.error("❌ Fetch Error:", error);
        return res.status(500).json({ 
            success: false, 
            error: 'Database fetch failed',
            message: error.message 
        });
    }
};

exports.getDraftById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Log for debugging
    console.log(`📥 Fetching draft ID: ${id}`);
    
    // Parse to integer
    const draftId = parseInt(id);
    
    if (isNaN(draftId)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid draft ID format" 
      });
    }
    
    console.log(`🔍 Looking for draft with ID: ${draftId}`);

    const draft = await prisma.draft.findUnique({
      where: { 
        id: draftId 
      }
    });

    console.log(`📊 Draft found: ${draft ? 'Yes' : 'No'}`);

    if (!draft) {
      return res.status(404).json({ 
        success: false, 
        error: "Draft not found" 
      });
    }

    // Return in the format your frontend expects
    res.json({ 
      success: true, 
      data: draft 
    });
    
  } catch (error) {
    console.error("❌ Error in getDraftById:", error);
    res.status(500).json({ 
      success: false, 
      error: "Server error while fetching draft",
      details: error.message 
    });
  }
};
exports.updateDraftStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    const draft = await prisma.draft.findUnique({
      where: { id: parseInt(id) }
    });

    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    // ❌ Reject validation
    if (status === 'REJECTED' && (!rejectionReason || rejectionReason.length < 5)) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    // 🟢 ADMIN APPROVE LOGIC
    if (status === 'APPROVED') {
      // 🕒 FUTURE SCHEDULE
      if (draft.scheduledAt && new Date(draft.scheduledAt) > new Date()) {
        const updated = await prisma.draft.update({
          where: { id: draft.id },
          data: { status: 'SCHEDULED' }
        });

        return res.json({
          success: true,
          message: 'Post approved & scheduled',
          data: updated
        });
      }

      // ⚡ NO SCHEDULE → IMMEDIATE PUBLISH
      await prisma.draft.update({
        where: { id: draft.id },
        data: { status: 'APPROVED' }
      });

      // Background publish
      setTimeout(() => {
        triggerPublishing(draft.id, draft.userId);
      }, 500);

      return res.json({
        success: true,
        message: 'Post approved & publishing now'
      });
    }

    // 🔴 REJECT
    if (status === 'REJECTED') {
      const updated = await prisma.draft.update({
        where: { id: draft.id },
        data: {
          status: 'REJECTED',
          rejectionReason
        }
      });

      return res.json({
        success: true,
        message: 'Post rejected',
        data: updated
      });
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.deleteDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;
    
    // First, check if draft exists and belongs to user
    const draft = await prisma.draft.findFirst({
      where: {
        id: parseInt(id),
        userId: parseInt(userId)
      }
    });
    
    if (!draft) {
      return res.status(404).json({ 
        success: false, 
        error: 'Draft not found or you do not have permission to delete it' 
      });
    }
    
    // Delete related published posts first
    await prisma.publishedPost.deleteMany({
      where: { draftId: parseInt(id) }
    });
    
    // Then delete the draft
    await prisma.draft.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({ 
      success: true, 
      message: 'Draft and associated published posts deleted successfully' 
    });
  } catch (err) {
    console.error("❌ Delete Draft Error:", err);
    
    if (err.code === 'P2003') {
      // Foreign key constraint error
      res.status(400).json({ 
        success: false, 
        error: 'Cannot delete draft because it has published posts. Try Option 2.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  }
};
exports.getAllDraftsForAdmin = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    let whereClause = {};
    
    if (status) {
      whereClause.status = status;
    }
    
    const drafts = await prisma.draft.findMany({
      where: whereClause,
      orderBy: { 
        createdAt: 'desc' 
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profilePic: true
          }
        }
      }
    });
    
    const total = await prisma.draft.count({ where: whereClause });
    
    res.json({
      success: true,
      data: drafts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get admin drafts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch drafts',
      message: error.message
    });
  }
};
async function triggerPublishing(draftId, userId) {
  try {
    const socialController = require('./socialController');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Get the draft to extract socialAccountIds
    const draft = await prisma.draft.findUnique({
      where: { id: draftId }
    });
    
    if (!draft) {
      console.error(`❌ Draft ${draftId} not found for publishing`);
      return;
    }
    
   if (!['APPROVED', 'SCHEDULED'].includes(draft.status)) return;

    const analytics = draft.analytics || {};
    const socialAccountIds = analytics.socialAccountIds || [];
    
    if (socialAccountIds.length === 0) {
      console.log(`⚠️ Draft ${draftId} has no social accounts to publish to`);
      return;
    }
    
    console.log(`⚡ Publishing draft ${draftId} to ${socialAccountIds.length} accounts`);
    
    // Create request object
    const mockReq = {
      params: { draftId: draftId.toString() },
      body: { socialAccountIds },
      user: { 
        userId: userId,
        id: userId 
      }
    };
    
    // Create a mock response handler
    const mockRes = {
      json: (data) => {
        if (data.success) {
          console.log(`✅ Published draft ${draftId} to ${data.results?.filter(r => r.success)?.length || 0} accounts`);
        } else {
          console.error(`❌ Failed to publish draft ${draftId}:`, data.error || 'Unknown error');
        }
      },
      status: () => mockRes
    };
    
    await socialController.publishToSocialMedia(mockReq, mockRes);
    
  } catch (error) {
    console.error('❌ Background publishing error:', error);
  }
}
exports.updateDraftStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    console.log(`🔄 Admin updating draft ${id} to: ${status}`);

    // Get draft with schedule info
    const draft = await prisma.draft.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    });

    if (!draft) {
      return res.status(404).json({ 
        success: false, 
        error: "Draft not found" 
      });
    }

    const now = new Date();
    const scheduledTime = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
    const hasSchedule = scheduledTime !== null;
    const isPastSchedule = scheduledTime && scheduledTime <= now;
    const isFutureSchedule = scheduledTime && scheduledTime > now;
    
    let newStatus = status;
    let message = `Draft status updated to ${status}`;
    let updateData = {
      rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      updatedAt: new Date()
    };
    
if (status === 'APPROVED') {
  if (hasSchedule) {
    if (isPastSchedule) {
      // Has schedule but it's in the past → APPROVED (will publish immediately)
      newStatus = 'APPROVED';
      message = "✅ Post approved. Will publish immediately (past schedule).";
      updateData.status = 'APPROVED';
      
      // Trigger immediate publishing in background
      setTimeout(async () => {
        try {
          await triggerPublishing(draft.id, draft.userId);
        } catch (error) {
          console.error('❌ Immediate publishing error:', error);
        }
      }, 1000);
      
    } else if (isFutureSchedule) {
      // Has future schedule → SCHEDULED
      newStatus = 'SCHEDULED';
      message = `✅ Post approved and scheduled for ${scheduledTime.toLocaleString()}. It will auto-publish at that time.`;
      console.log(`📅 Draft ${id} scheduled for: ${scheduledTime}`);
      updateData.status = 'SCHEDULED';
    } else {
      // Schedule time is exactly now → APPROVED (will publish immediately)
      newStatus = 'APPROVED';
      message = "✅ Post approved. Will publish immediately (schedule time is now).";
      updateData.status = 'APPROVED';
      
      setTimeout(async () => {
        try {
          await triggerPublishing(draft.id, draft.userId);
        } catch (error) {
          console.error('❌ Immediate publishing error:', error);
        }
      }, 1000);
    }
  } else {
    // No schedule → APPROVED (will publish immediately)
    newStatus = 'APPROVED';
    message = "✅ Post approved. Will publish immediately (no schedule).";
    updateData.status = 'APPROVED';
    
    // Trigger immediate publishing in background
    setTimeout(async () => {
      try {
        await triggerPublishing(draft.id, draft.userId);
      } catch (error) {
        console.error('❌ Immediate publishing error:', error);
      }
    }, 1000);
  }
}
    // Update draft with new status
    const updatedDraft = await prisma.draft.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    console.log(`✅ Draft ${id} status updated to: ${updatedDraft.status}`);
    
    res.json({ 
      success: true, 
      data: updatedDraft,
      message: message,
      status: updatedDraft.status,
      scheduledAt: draft.scheduledAt
    });
    
  } catch (error) {
    console.error("❌ Error updating draft status:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());

exports.generateAICaption = async (req, res) => {
  try {
    const { prompt } = req.body;

    // Use the exact model that returned "SUCCESS"
    const model = genAI.getGenerativeModel(
      { model: "gemini-3-flash-preview" },
      { apiVersion: 'v1beta' }
    );

    const fullPrompt = `As a social media expert, write 4 engaging captions for this post idea: "${prompt}". 
    Format: Return only the captions, one per line. No numbers or labels.`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    const captions = text
      .split('\n')
      .filter(line => line.trim().length > 3)
      .slice(0, 4);

    res.json({ success: true, captions });
  } catch (error) {
    console.error("AI Generation Error:", error.message);
    res.status(500).json({ success: false, error: "AI Service is currently unavailable." });
  }
};

exports.publishDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { socialAccountIds } = req.body; 
    
    const draft = await prisma.draft.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
   if (draft.status !== 'APPROVED' && draft.status !== 'SCHEDULED') {
  return res.status(400).json({
    success: false,
    error: `Cannot publish. Status is ${draft.status}`
  });
}
    
    const socialAccounts = await prisma.socialConnection.findMany({
      where: {
        id: { in: socialAccountIds.map(accId => parseInt(accId)) },
        isConnected: true
      }
    });

    const publishedPosts = [];
    const errors = [];
    
    for (const account of socialAccounts) {
      try {
        const platformUpper = account.platform.toUpperCase();
        
        // Default to Master Content
        let contentToPublish = draft.masterContent;

        // Extract specific platform content if it exists in the JSON object
        if (draft.platformData && draft.platformData[platformUpper]) {
          const platformSpecific = draft.platformData[platformUpper];
          
          // If the data is an object like { content: "text" }, extract the string
          if (typeof platformSpecific === 'object' && platformSpecific.content) {
            contentToPublish = platformSpecific.content;
          } 
          // If it is already a string, use it directly
          else if (typeof platformSpecific === 'string') {
            contentToPublish = platformSpecific;
          }
        }

        console.log(`Final Text for ${platformUpper}:`, contentToPublish);
        
        const fakePostId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const publishedPost = await prisma.publishedPost.create({
          data: {
            draftId: draft.id,
            socialAccountId: account.id,
            platformPostId: fakePostId,
            publishedId: new Date(),
            status: 'published',
            metrics: { likes: 0, shares: 0, comments: 0, reach: 0 }
          }
        });
        
        publishedPosts.push(publishedPost);
        
      } catch (error) {
        errors.push(`${account.accountName}: ${error.message}`);
      }
    }
    
    if (publishedPosts.length > 0) {
      await prisma.draft.update({
        where: { id: parseInt(id) },
        data: { status: 'PUBLISHED' }
      });
    }
    
    res.json({
      success: true,
      message: `Published to ${publishedPosts.length} accounts`,
      data: { publishedPosts, errors: errors.length > 0 ? errors : undefined }
    });
    
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Add function to get user's connected social accounts
exports.getUserSocialAccounts = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get OAuth connections
    const connections = await prisma.socialConnection.findMany({
      where: {
        userId: userId,
        isConnected: true
      },
      orderBy: {
        platform: 'asc'
      }
    });
    
    // Also get social URLs from User model
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        instagram: true,
        facebook: true,
        twitter: true,
        linkedin: true
      }
    });
    
    // Format response
    const accounts = [];
    
    // Add OAuth connections
    connections.forEach(conn => {
      accounts.push({
        id: conn.id,
        platform: conn.platform,
        platformName: conn.platform.charAt(0).toUpperCase() + conn.platform.slice(1),
        accountName: conn.accountName,
        profilePicture: conn.profilePicture,
        type: 'oauth',
        canPublish: true,
        accessToken: !!conn.accessToken // Don't send actual token, just indicate if available
      });
    });
    
    // Add URL-based connections (for display only)
    const urlPlatforms = [
      { key: 'instagram', name: 'Instagram' },
      { key: 'facebook', name: 'Facebook' },
      { key: 'twitter', name: 'Twitter' },
      { key: 'linkedin', name: 'LinkedIn' }
    ];
    
    urlPlatforms.forEach(platform => {
      if (user[platform.key]) {
        accounts.push({
          id: `url_${platform.key}`,
          platform: platform.key,
          platformName: platform.name,
          accountName: user[platform.key].split('/').pop() || platform.key,
          url: user[platform.key],
          type: 'url',
          canPublish: false,
          message: 'Connect via OAuth to publish'
        });
      }
    });
    
    res.json({
      success: true,
      accounts,
      total: accounts.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching social accounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch social accounts'
    });
  }
};

// Add to draftsController.js
exports.scheduleDraft = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduleTime, socialAccountIds } = req.body;
    
    res.json({
      success: true,
      message: 'Draft scheduled successfully'
    });
  } catch (error) {
    console.error('❌ Schedule Draft Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Add to draftController.js - NEW FUNCTION
exports.getCalendarEvents = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { month, year } = req.query;
    
    // Set date range for the month
    let startDate, endDate;
    
    if (month && year) {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0);
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    
    // Fetch drafts with schedule
    const drafts = await prisma.draft.findMany({
      where: {
        userId: parseInt(userId),
        scheduledAt: {
          gte: startDate,
          lte: endDate,
          not: null
        },
        status: {
          in: ['APPROVED', 'SCHEDULED', 'PUBLISHED']
        }
      },
      select: {
        id: true,
        masterContent: true,
        scheduledAt: true,
        status: true,
        platforms: true,
        mediaUrls: true,
        createdAt: true
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });
    
    // Format for calendar
    const events = drafts.map(draft => ({
      id: draft.id,
      title: draft.masterContent?.substring(0, 50) || 'Untitled Post',
      scheduledAt: draft.scheduledAt,
      status: draft.status,
      platforms: draft.platforms,
      hasMedia: draft.mediaUrls && draft.mediaUrls.length > 0
    }));
    
    res.json({
      success: true,
      events,
      count: events.length,
      month: startDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    });
    
  } catch (error) {
    console.error('❌ Calendar events error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar events'
    });
  }
};

exports.getCalendarDrafts = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get all drafts with schedule (including past and future)
    const drafts = await prisma.draft.findMany({
      where: {
        userId: parseInt(userId),
        scheduledAt: { not: null }
      },
      select: {
        id: true,
        title: true,
        masterContent: true,
        scheduledAt: true,
        status: true,
        platforms: true,
        mediaUrls: true,
        createdAt: true,
        publishedId: true
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });
    
    res.json({
      success: true,
      events: drafts,  // Return as 'events' for Calendar.js
      count: drafts.length
    });
    
  } catch (error) {
    console.error('❌ Calendar drafts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch calendar drafts'
    });
  }
};