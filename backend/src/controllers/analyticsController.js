const analyticsService = require('../services/analyticsService');
const socialController = require('../controllers/socialController');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const analyticsController = {
  // Get analytics dashboard data
  getAnalytics: async (req, res) => {
    try {
      const { period = '30days' } = req.query;
      const userId = parseInt(req.user.userId);

      const result = await analyticsService.getUserAnalytics(userId, period);
      
      res.json(result);
    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics',
        error: error.message
      });
    }
  },

  // Get platform-specific analytics with REAL-TIME data
  getPlatformAnalytics: async (req, res) => {
    try {
      const { platform } = req.params;
      const { period = '30days' } = req.query;
      const userId = parseInt(req.user.userId);

      const endDate = new Date();
      const startDate = new Date();
      
      if (period === '7days') startDate.setDate(startDate.getDate() - 7);
      else if (period === '30days') startDate.setDate(startDate.getDate() - 30);
      else if (period === '90days') startDate.setDate(startDate.getDate() - 90);

      // Get social accounts
      const accounts = await prisma.socialConnection.findMany({
        where: {
          userId,
          platform,
          isConnected: true
        }
      });

      // FETCH REAL-TIME DATA FOR EACH ACCOUNT
      const realtimeData = [];
      for (const account of accounts) {
        let accountData = {
          id: account.id,
          name: account.accountName,
          profilePicture: account.profilePicture,
          followers: 0,
          posts: []
        };

        try {
          if (platform === 'facebook') {
            // Fetch real-time Facebook data
            const pageData = await socialController.fetchFacebookPageInsights(account, account.accessToken);
            if (pageData) {
              accountData.followers = pageData.followers || 0;
            }

            // Fetch recent posts with metrics
            const posts = await prisma.publishedPost.findMany({
              where: {
                socialAccountId: account.id,
                publishedAt: { gte: startDate }
              },
              orderBy: { publishedAt: 'desc' },
              take: 20
            });

            // Get fresh metrics for each post
            for (const post of posts) {
              const freshMetrics = await socialController.getFacebookMetrics(account, post.platformPostId);
              accountData.posts.push({
                id: post.id,
                content: post.draft?.masterContent?.substring(0, 100) || 'Post',
                publishedAt: post.publishedAt,
                metrics: freshMetrics || post.metrics || { likes: 0, comments: 0, shares: 0 }
              });
            }
          } 
          else if (platform === 'instagram') {
            // Fetch real-time Instagram data
            const igData = await socialController.fetchInstagramInsights(account, account.accessToken);
            if (igData) {
              accountData.followers = igData.followers || 0;
            }

            // Get fresh Instagram metrics
            const posts = await prisma.publishedPost.findMany({
              where: {
                socialAccountId: account.id,
                publishedAt: { gte: startDate }
              },
              orderBy: { publishedAt: 'desc' },
              take: 20
            });

            for (const post of posts) {
              const freshMetrics = await socialController.getInstagramMetrics(account, post.platformPostId);
              accountData.posts.push({
                id: post.id,
                content: post.draft?.masterContent?.substring(0, 100) || 'Post',
                publishedAt: post.publishedAt,
                metrics: freshMetrics || post.metrics || { likes: 0, comments: 0, reach: 0 }
              });
            }
          }
        } catch (err) {
          console.error(`Error fetching realtime data for ${account.accountName}:`, err.message);
        }

        realtimeData.push(accountData);
      }

      // Get stored analytics for chart data
      const analytics = await prisma.analytics.findMany({
        where: {
          socialAccountId: { in: accounts.map(a => a.id) },
          date: { gte: startDate, lte: endDate }
        },
        orderBy: { date: 'asc' }
      });

      // Build chart data
      const chartData = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayData = {
          date: dateStr,
          likes: 0,
          comments: 0,
          shares: 0,
          reach: 0,
          impressions: 0,
          followers: 0
        };

        // Add account metrics for this day
        analytics.forEach(a => {
          if (a.date.toISOString().split('T')[0] === dateStr) {
            dayData.followers += a.followers || 0;
            dayData.reach += a.reach || 0;
            dayData.impressions += a.impressions || 0;
          }
        });

        chartData.push(dayData);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Calculate summary using REAL-TIME data
      const summary = {
        totalPosts: realtimeData.reduce((sum, acc) => sum + acc.posts.length, 0),
        totalAccounts: accounts.length,
        totalLikes: realtimeData.reduce((sum, acc) => 
          sum + acc.posts.reduce((postSum, p) => postSum + (p.metrics?.likes || 0), 0), 0),
        totalComments: realtimeData.reduce((sum, acc) => 
          sum + acc.posts.reduce((postSum, p) => postSum + (p.metrics?.comments || 0), 0), 0),
        totalShares: realtimeData.reduce((sum, acc) => 
          sum + acc.posts.reduce((postSum, p) => postSum + (p.metrics?.shares || 0), 0), 0),
        totalFollowers: realtimeData.reduce((sum, acc) => sum + (acc.followers || 0), 0)
      };

      res.json({
        success: true,
        data: {
          platform,
          accounts: realtimeData.map(acc => ({
            id: acc.id,
            name: acc.name,
            profilePicture: acc.profilePicture,
            followers: acc.followers
          })),
          chartData,
          posts: realtimeData.flatMap(acc => acc.posts).sort((a, b) => 
            new Date(b.publishedAt) - new Date(a.publishedAt)
          ),
          summary
        }
      });
    } catch (error) {
      console.error('Error getting platform analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch platform analytics',
        error: error.message
      });
    }
  },

  // Get post performance
  getPostPerformance: async (req, res) => {
    try {
      const { postId } = req.params;
      const userId = parseInt(req.user.userId);

      const post = await prisma.publishedPost.findFirst({
        where: {
          id: parseInt(postId),
          socialAccount: { userId }
        },
        include: {
          socialAccount: true,
          draft: true
        }
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      // Fetch FRESH metrics in real-time
      let freshMetrics = null;
      if (post.socialAccount.platform === 'facebook') {
        freshMetrics = await socialController.getFacebookMetrics(
          post.socialAccount, 
          post.platformPostId
        );
      } else if (post.socialAccount.platform === 'instagram') {
        freshMetrics = await socialController.getInstagramMetrics(
          post.socialAccount, 
          post.platformPostId
        );
      }

      // Update the stored metrics
      if (freshMetrics && Object.keys(freshMetrics).length > 0) {
        await prisma.publishedPost.update({
          where: { id: post.id },
          data: { metrics: freshMetrics }
        });
      }

      res.json({
        success: true,
        data: {
          post: {
            id: post.id,
            content: post.draft?.masterContent,
            publishedAt: post.publishedAt,
            platform: post.socialAccount.platform,
            accountName: post.socialAccount.accountName
          },
          metrics: freshMetrics || post.metrics || {},
          url: post.metadata?.url
        }
      });
    } catch (error) {
      console.error('Error getting post performance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch post performance',
        error: error.message
      });
    }
  },

  // In analyticsController.js - Update refreshAnalytics
refreshAnalytics: async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    
    console.log(`🔄 REFRESHING analytics for user ${userId}`);
    
    const socialController = require('../controllers/socialController');
    
    // Store account analytics
    const stored = await socialController.storeUserAnalytics(userId);
    
    // Get ALL posts for this user (not just recent ones)
    const allPosts = await prisma.publishedPost.findMany({
      where: {
        socialAccount: {
          userId
        }
      },
      include: { 
        socialAccount: true 
      }
    });

    console.log(`📊 Found ${allPosts.length} total posts to update metrics`);

    let postMetricsUpdated = 0;
    for (const post of allPosts) {
      try {
        let metrics = {};
        
        if (post.socialAccount.platform === 'facebook') {
          metrics = await socialController.getFacebookMetrics(post.socialAccount, post.platformPostId);
          console.log(`📊 Facebook post ${post.id} metrics:`, metrics);
        } else if (post.socialAccount.platform === 'instagram') {
          metrics = await socialController.getInstagramMetrics(post.socialAccount, post.platformPostId);
          console.log(`📊 Instagram post ${post.id} metrics:`, metrics);
        }

        if (Object.keys(metrics).length > 0) {
          await prisma.publishedPost.update({
            where: { id: post.id },
            data: { metrics }
          });
          postMetricsUpdated++;
          console.log(`✅ Updated post ${post.id} metrics`);
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.log(`⚠️ Error updating post ${post.id}:`, err.message);
      }
    }
    
    res.json({
      success: true,
      message: `Analytics refreshed. Stored/Updated ${stored} account records and updated ${postMetricsUpdated} post metrics.`,
      data: { 
        accountsUpdated: stored,
        postsUpdated: postMetricsUpdated
      }
    });
  } catch (error) {
    console.error('Error refreshing analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh analytics',
      error: error.message
    });
  }
},

 // In analyticsController.js - Update refreshPostMetrics

refreshPostMetrics: async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = parseInt(req.user.userId);

    const publishedPost = await prisma.publishedPost.findFirst({
      where: {
        id: parseInt(postId),
        socialAccount: {
          userId
        }
      },
      include: { socialAccount: true }
    });

    if (!publishedPost) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const socialController = require('../controllers/socialController');
    let metrics = {};

    if (publishedPost.socialAccount.platform === 'facebook') {
      metrics = await socialController.getFacebookMetrics(
        publishedPost.socialAccount, 
        publishedPost.platformPostId
      );
    } else if (publishedPost.socialAccount.platform === 'instagram') {
      metrics = await socialController.getInstagramMetrics(
        publishedPost.socialAccount, 
        publishedPost.platformPostId
      );
    }

    // Ensure metrics object has all required fields
    const updatedMetrics = {
      likes: metrics.likes || 0,
      comments: metrics.comments || 0,
      shares: metrics.shares || 0,
      reach: metrics.reach || 0,
      ...metrics
    };

    if (Object.keys(updatedMetrics).length > 0) {
      await prisma.publishedPost.update({
        where: { id: publishedPost.id },
        data: { metrics: updatedMetrics }
      });
      console.log(`✅ Updated post ${postId} with metrics:`, updatedMetrics);
    }

    res.json({
      success: true,
      data: updatedMetrics
    });
  } catch (error) {
    console.error('Error refreshing post metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh post metrics',
      error: error.message
    });
  }
},

  // Export analytics report
  exportAnalytics: async (req, res) => {
    try {
      const { period = '30days', format = 'json' } = req.query;
      const userId = parseInt(req.user.userId);

      const result = await analyticsService.getUserAnalytics(userId, period);

      if (format === 'csv') {
        // Convert to CSV
        const csv = convertToCSV(result.data.chartData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=analytics-${period}.csv`);
        return res.send(csv);
      }

      res.json({
        success: true,
        data: result.data
      });
    } catch (error) {
      console.error('Error exporting analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export analytics',
        error: error.message
      });
    }
  },

  // Reset and refresh analytics
  resetAndRefreshAnalytics: async (req, res) => {
    try {
      const userId = parseInt(req.user.userId);
      
      // Delete existing analytics for this user
      await prisma.analytics.deleteMany({
        where: {
          socialAccount: { userId }
        }
      });
      
      // Reset post metrics
      await prisma.publishedPost.updateMany({
        where: {
          socialAccount: { userId }
        },
        data: { metrics: null }
      });
      
      // Run fresh refresh
      const stored = await socialController.storeUserAnalytics(userId);
      
      // Update post metrics
      const recentPosts = await prisma.publishedPost.findMany({
        where: {
          socialAccount: { userId }
        },
        include: { socialAccount: true }
      });

      let postsUpdated = 0;
      for (const post of recentPosts) {
        let metrics = {};
        if (post.socialAccount.platform === 'facebook') {
          metrics = await socialController.getFacebookMetrics(post.socialAccount, post.platformPostId);
        } else if (post.socialAccount.platform === 'instagram') {
          metrics = await socialController.getInstagramMetrics(post.socialAccount, post.platformPostId);
        }
        
        if (Object.keys(metrics).length > 0) {
          await prisma.publishedPost.update({
            where: { id: post.id },
            data: { metrics }
          });
          postsUpdated++;
        }
      }
      
      res.json({
        success: true,
        message: `Reset complete. Stored ${stored} account records and updated ${postsUpdated} post metrics.`
      });
    } catch (error) {
      console.error('Error resetting analytics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Sync Instagram posts for a user
  syncInstagramPosts: async (req, res) => {
    try {
      const userId = parseInt(req.user.userId);
      
      const synced = await socialController.syncInstagramPosts(userId);
      
      res.json({
        success: true,
        message: `Synced ${synced} Instagram posts`,
        data: { synced }
      });
    } catch (error) {
      console.error('Error syncing Instagram:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
  // Add to analyticsController.js

diagnoseAnalytics: async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    
    console.log(`🔍 DIAGNOSING analytics for user ${userId}`);
    
    // 1. Check all published posts with their metrics
    const publishedPosts = await prisma.publishedPost.findMany({
      where: {
        socialAccount: {
          userId
        }
      },
      include: {
        socialAccount: true,
        draft: true
      },
      orderBy: { publishedAt: 'desc' }
    });

    console.log(`📊 Found ${publishedPosts.length} published posts`);
    
    // Log each post's metrics
    const postMetrics = publishedPosts.map(post => ({
      id: post.id,
      platform: post.socialAccount.platform,
      account: post.socialAccount.accountName,
      publishedAt: post.publishedAt,
      metrics: post.metrics,
      platformPostId: post.platformPostId
    }));

    // 2. Check analytics records
    const analytics = await prisma.analytics.findMany({
      where: {
        socialAccount: {
          userId
        }
      },
      include: {
        socialAccount: true
      },
      orderBy: { date: 'desc' }
    });

    // 3. Test Facebook API for a specific post
    let facebookTest = null;
    const facebookPost = publishedPosts.find(p => p.socialAccount.platform === 'facebook');
    if (facebookPost) {
      try {
        const socialController = require('../controllers/socialController');
        const freshMetrics = await socialController.getFacebookMetrics(
          facebookPost.socialAccount,
          facebookPost.platformPostId
        );
        facebookTest = {
          postId: facebookPost.id,
          storedMetrics: facebookPost.metrics,
          freshMetrics: freshMetrics,
          match: JSON.stringify(facebookPost.metrics) === JSON.stringify(freshMetrics)
        };
      } catch (err) {
        facebookTest = { error: err.message };
      }
    }

    // 4. Test Instagram API for a specific post
    let instagramTest = null;
    const instagramPost = publishedPosts.find(p => p.socialAccount.platform === 'instagram');
    if (instagramPost) {
      try {
        const socialController = require('../controllers/socialController');
        const freshMetrics = await socialController.getInstagramMetrics(
          instagramPost.socialAccount,
          instagramPost.platformPostId
        );
        instagramTest = {
          postId: instagramPost.id,
          storedMetrics: instagramPost.metrics,
          freshMetrics: freshMetrics,
          match: JSON.stringify(instagramPost.metrics) === JSON.stringify(freshMetrics)
        };
      } catch (err) {
        instagramTest = { error: err.message };
      }
    }

    // 5. Calculate totals manually
    const totalLikes = publishedPosts.reduce((sum, post) => sum + (post.metrics?.likes || 0), 0);
    const totalComments = publishedPosts.reduce((sum, post) => sum + (post.metrics?.comments || 0), 0);
    const totalShares = publishedPosts.reduce((sum, post) => sum + (post.metrics?.shares || 0), 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalPosts: publishedPosts.length,
          totalLikes,
          totalComments,
          totalShares,
          postsWithMetrics: publishedPosts.filter(p => p.metrics && Object.keys(p.metrics).length > 0).length
        },
        postMetrics: postMetrics,
        analytics: analytics.map(a => ({
          id: a.id,
          platform: a.socialAccount.platform,
          account: a.socialAccount.accountName,
          date: a.date,
          followers: a.followers,
          likes: a.likes,
          comments: a.comments,
          shares: a.shares
        })),
        apiTests: {
          facebook: facebookTest,
          instagram: instagramTest
        }
      }
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
},
// In analyticsController.js - Update forceRefreshAllMetrics

forceRefreshAllMetrics: async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    
    console.log(`🔄 FORCE REFRESHING all metrics for user ${userId}`);
    
    // Get all published posts
    const publishedPosts = await prisma.publishedPost.findMany({
      where: {
        socialAccount: {
          userId
        }
      },
      include: {
        socialAccount: true
      }
    });

    console.log(`📊 Found ${publishedPosts.length} posts to refresh`);

    const socialController = require('../controllers/socialController');
    let updated = 0;
    let failed = 0;
    const results = [];

    for (const post of publishedPosts) {
      try {
        console.log(`\n🔄 Refreshing post ${post.id} (${post.socialAccount.platform})`);
        
        let metrics = {};
        
        if (post.socialAccount.platform === 'facebook') {
          metrics = await socialController.getFacebookMetrics(post.socialAccount, post.platformPostId);
          console.log(`   Facebook API returned:`, metrics);
        } else if (post.socialAccount.platform === 'instagram') {
          metrics = await socialController.getInstagramMetrics(post.socialAccount, post.platformPostId);
          console.log(`   Instagram API returned:`, metrics);
        } else {
          console.log(`   Skipping ${post.socialAccount.platform}`);
          continue;
        }

        if (metrics && Object.keys(metrics).length > 0) {
          // Ensure all fields exist
          const updatedMetrics = {
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            reach: metrics.reach || 0
          };

          await prisma.publishedPost.update({
            where: { id: post.id },
            data: { metrics: updatedMetrics }
          });
          updated++;
          console.log(`   ✅ Updated post ${post.id}:`, updatedMetrics);
          
          results.push({
            id: post.id,
            platform: post.socialAccount.platform,
            success: true,
            metrics: updatedMetrics
          });
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        failed++;
        console.error(`   ❌ Failed to update post ${post.id}:`, err.message);
        results.push({
          id: post.id,
          platform: post.socialAccount.platform,
          success: false,
          error: err.message
        });
      }
    }

    // Try to refresh account analytics, but don't fail if it errors
    let stored = 0;
    try {
      stored = await socialController.storeUserAnalytics(userId);
    } catch (analyticsError) {
      console.error('⚠️ Account analytics refresh failed:', analyticsError.message);
    }

    res.json({
      success: true,
      message: `Force refresh complete. Updated ${updated} posts, failed ${failed} posts.`,
      data: { 
        updated, 
        failed, 
        stored,
        results 
      }
    });
  } catch (error) {
    console.error('Force refresh error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
},
// Add to analyticsController.js
// In analyticsController.js - FIXED version

fixExistingPosts: async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    
    console.log(`🔧 FIXING existing posts for user ${userId}`);
    
    // Get all published posts first (without null filter in the query)
    const allPosts = await prisma.publishedPost.findMany({
      where: {
        socialAccount: {
          userId
        }
      },
      include: {
        socialAccount: true
      }
    });

    console.log(`📊 Found ${allPosts.length} total posts`);
    
    // Filter in JavaScript for posts with null metrics or empty metrics
    const postsToFix = allPosts.filter(post => {
      return !post.metrics || 
             Object.keys(post.metrics).length === 0 || 
             (post.metrics.likes === 0 && post.metrics.comments === 0 && post.metrics.shares === 0);
    });

    console.log(`📊 Found ${postsToFix.length} posts to fix (with null/empty metrics)`);

    const socialController = require('../controllers/socialController');
    let fixed = 0;
    let failed = 0;
    const results = [];

    for (const post of postsToFix) {
      try {
        console.log(`\n🔄 Processing post ${post.id} (${post.socialAccount.platform})`);
        console.log(`   Platform Post ID: ${post.platformPostId}`);
        
        let metrics = {};
        
        if (post.socialAccount.platform === 'facebook') {
          metrics = await socialController.getFacebookMetrics(post.socialAccount, post.platformPostId);
          console.log(`   Facebook API returned:`, metrics);
        } else if (post.socialAccount.platform === 'instagram') {
          metrics = await socialController.getInstagramMetrics(post.socialAccount, post.platformPostId);
          console.log(`   Instagram API returned:`, metrics);
        } else {
          console.log(`   Skipping ${post.socialAccount.platform} - not supported for metrics`);
          continue;
        }

        // Only update if we got actual metrics
        if (metrics && Object.keys(metrics).length > 0) {
          // Ensure all expected fields exist
          const updatedMetrics = {
            likes: metrics.likes || 0,
            comments: metrics.comments || 0,
            shares: metrics.shares || 0,
            reach: metrics.reach || 0,
            ...metrics
          };

          await prisma.publishedPost.update({
            where: { id: post.id },
            data: { 
              metrics: updatedMetrics
            }
          });
          fixed++;
          console.log(`   ✅ Fixed post ${post.id} with metrics:`, updatedMetrics);
          
          results.push({
            id: post.id,
            platform: post.socialAccount.platform,
            success: true,
            oldMetrics: post.metrics,
            newMetrics: updatedMetrics
          });
        } else {
          console.log(`   ⚠️ No metrics returned for post ${post.id}`);
          failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        failed++;
        console.error(`   ❌ Failed to fix post ${post.id}:`, err.message);
        results.push({
          id: post.id,
          platform: post.socialAccount.platform,
          success: false,
          error: err.message
        });
      }
    }

    console.log(`\n✅ Fix completed: ${fixed} fixed, ${failed} failed`);

    res.json({
      success: true,
      message: `Fixed ${fixed} posts, failed ${failed} posts`,
      data: { 
        fixed, 
        failed,
        total: postsToFix.length,
        results 
      }
    });
  } catch (error) {
    console.error('Fix posts error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
},
  // Debug analytics
  debugAnalytics: async (req, res) => {
    try {
      const userId = parseInt(req.user.userId);
      
      // Check social connections
      const connections = await prisma.socialConnection.findMany({
        where: { userId }
      });
      
      // Check published posts
      const publishedPosts = await prisma.publishedPost.findMany({
        where: {
          socialAccount: { userId }
        },
        include: {
          socialAccount: true
        }
      });
      
      // Check analytics
      const analytics = await prisma.analytics.findMany({
        where: {
          socialAccount: { userId }
        },
        include: {
          socialAccount: true
        }
      });
      
      res.json({
        success: true,
        data: {
          connections: connections.map(c => ({
            id: c.id,
            platform: c.platform,
            accountName: c.accountName,
            isConnected: c.isConnected
          })),
          publishedPosts: publishedPosts.map(p => ({
            id: p.id,
            platform: p.socialAccount.platform,
            accountName: p.socialAccount.accountName,
            platformPostId: p.platformPostId,
            metrics: p.metrics,
            publishedAt: p.publishedAt
          })),
          analytics: analytics.map(a => ({
            id: a.id,
            platform: a.socialAccount.platform,
            accountName: a.socialAccount.accountName,
            likes: a.likes,
            comments: a.comments,
            shares: a.shares,
            date: a.date
          }))
        }
      });
    } catch (error) {
      console.error('Debug error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

// Helper function to convert to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  csvRows.push(headers.join(','));
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      return typeof value === 'string' ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

module.exports = analyticsController;