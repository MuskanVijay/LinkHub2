const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class AnalyticsService {
  async getUserAnalytics(userId, period = '30days') {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      if (period === '7days') startDate.setDate(startDate.getDate() - 7);
      else if (period === '30days') startDate.setDate(startDate.getDate() - 30);
      else if (period === '90days') startDate.setDate(startDate.getDate() - 90);

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      // Get social accounts (using SocialConnection model)
      const socialConnections = await prisma.socialConnection.findMany({
        where: { 
          userId, 
          isConnected: true 
        }
      });

      // Get latest analytics for each account from Analytics model
      const accountsWithFollowers = await Promise.all(
        socialConnections.map(async (connection) => {
          const latestAnalytics = await prisma.analytics.findFirst({
            where: { socialAccountId: connection.id },
            orderBy: { date: 'desc' }
          });
          
          return {
            ...connection,
            followers: latestAnalytics?.followers || 0,
            likes: latestAnalytics?.likes || 0,
            comments: latestAnalytics?.comments || 0,
            shares: latestAnalytics?.shares || 0
          };
        })
      );

      // Get published posts with metrics
      const publishedPosts = await prisma.publishedPost.findMany({
        where: {
          socialAccount: { userId },
          publishedAt: { 
            gte: startDate, 
            lte: endDate 
          }
        },
        include: { 
          socialAccount: true, 
          draft: true 
        }
      });

      console.log('📊 RAW POST DATA:', publishedPosts.map(p => ({
        id: p.id,
        platform: p.socialAccount.platform,
        metrics: p.metrics
      })));

      // Calculate totals
      const totalLikes = publishedPosts.reduce((sum, post) => {
        return sum + (parseInt(post.metrics?.likes) || 0);
      }, 0);
      
      const totalComments = publishedPosts.reduce((sum, post) => {
        return sum + (parseInt(post.metrics?.comments) || 0);
      }, 0);
      
      const totalShares = publishedPosts.reduce((sum, post) => {
        return sum + (parseInt(post.metrics?.shares) || 0);
      }, 0);

      console.log('📈 CALCULATED TOTALS:', { totalLikes, totalComments, totalShares });

      // Group posts by account
      const postsByAccount = {};
      publishedPosts.forEach(post => {
        if (!postsByAccount[post.socialAccountId]) {
          postsByAccount[post.socialAccountId] = [];
        }
        postsByAccount[post.socialAccountId].push(post);
      });
    
      // PLATFORM STATS WITH FOLLOWERS
      const platformStats = accountsWithFollowers.map(connection => {
        const accountPosts = postsByAccount[connection.id] || [];
        
        // Calculate post metrics
        let postLikes = 0;
        let postComments = 0;
        let postShares = 0;
        
        accountPosts.forEach(post => {
          if (post.metrics) {
            postLikes += parseInt(post.metrics.likes) || 0;
            postComments += parseInt(post.metrics.comments) || 0;
            postShares += parseInt(post.metrics.shares) || 0;
          }
        });

        return {
          platform: connection.platform,
          accountName: connection.accountName,
          postsCount: accountPosts.length,
          likes: postLikes,
          comments: postComments,
          shares: postShares,
          followers: connection.followers,
          profilePicture: connection.profilePicture
        };
      });

      // Calculate total followers across all accounts
      const totalFollowers = platformStats.reduce((sum, stat) => sum + stat.followers, 0);

      // Calculate engagement rate
      const totalEngagement = totalLikes + totalComments + totalShares;
      const engagementRate = totalFollowers > 0 
        ? ((totalEngagement / totalFollowers) * 100).toFixed(2) 
        : 0;

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
          followers: totalFollowers // Use latest followers for each day
        };

        // Add post metrics for this day
        const dayPosts = publishedPosts.filter(post => 
          post.publishedAt && post.publishedAt.toISOString().split('T')[0] === dateStr
        );
        
        dayPosts.forEach(post => {
          if (post.metrics) {
            dayData.likes += parseInt(post.metrics.likes) || 0;
            dayData.comments += parseInt(post.metrics.comments) || 0;
            dayData.shares += parseInt(post.metrics.shares) || 0;
          }
        });

        chartData.push(dayData);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Top posts with engagement calculation
      const topPosts = publishedPosts
        .filter(post => post.metrics && Object.keys(post.metrics).length > 0)
        .map(post => {
          const metrics = post.metrics || {};
          const likes = parseInt(metrics.likes) || 0;
          const comments = parseInt(metrics.comments) || 0;
          const shares = parseInt(metrics.shares) || 0;
          
          const engagement = likes + comments + shares;
          
          return {
            id: post.id,
            content: post.draft?.masterContent?.substring(0, 100) || 'Post',
            platform: post.socialAccount.platform,
            platformName: post.socialAccount.accountName,
            publishedAt: post.publishedAt,
            metrics: {
              likes,
              comments,
              shares
            },
            engagement
          };
        })
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 5);

      return {
        success: true,
        data: {
          chartData,
          totals: {
            totalLikes,
            totalComments,
            totalShares,
            totalFollowers,
            engagementRate: parseFloat(engagementRate)
          },
          platformStats,
          topPosts,
          period,
          summary: {
            totalPosts: publishedPosts.length,
            totalAccounts: socialConnections.length,
            platforms: [...new Set(socialConnections.map(a => a.platform))]
          }
        }
      };
    } catch (error) {
      console.error('Error in getUserAnalytics:', error);
      throw error;
    }
  }

  // Fetch Facebook Page Insights
  async fetchFacebookPageInsights(socialAccount, accessToken, since, until) {
    try {
      if (!socialAccount.pageId && !socialAccount.platformUserId) {
        console.log('No page ID found for Facebook account');
        return null;
      }

      const pageId = socialAccount.pageId || socialAccount.platformUserId;
      console.log(`📊 Fetching Facebook insights for page ${pageId}`);

      // Get page info with fan count
      let followerCount = 0;
      try {
        const pageUrl = `https://graph.facebook.com/v18.0/${pageId}`;
        const pageRes = await axios.get(pageUrl, {
          params: {
            fields: 'fan_count',
            access_token: accessToken
          }
        });
        followerCount = pageRes.data.fan_count || 0;
      } catch (err) {
        console.error('Error fetching fan count:', err.message);
      }

      // Get posts data for likes/comments/shares
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;

      try {
        const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts`;
        const postsRes = await axios.get(postsUrl, {
          params: {
            fields: 'likes.summary(true),comments.summary(true),shares',
            limit: 100,
            access_token: accessToken
          }
        });

        if (postsRes.data.data) {
          postsRes.data.data.forEach(post => {
            totalLikes += post.likes?.summary?.total_count || 0;
            totalComments += post.comments?.summary?.total_count || 0;
            totalShares += post.shares?.count || 0;
          });
        }
      } catch (err) {
        console.log('Could not fetch posts:', err.message);
      }

      return {
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        followers: followerCount
      };
    } catch (error) {
      console.error('Error fetching Facebook insights:', error.response?.data || error.message);
      return null;
    }
  }

  // Fetch Instagram Business Insights
  async fetchInstagramInsights(socialAccount, accessToken) {
    try {
      if (!socialAccount.instagramId && !socialAccount.platformUserId) {
        console.log('No Instagram ID found');
        return null;
      }

      const instagramId = socialAccount.instagramId || socialAccount.platformUserId;
      console.log(`📸 Fetching Instagram data for ${socialAccount.accountName}`);

      // Get account info with follower count
      let followerCount = 0;
      let mediaCount = 0;
      try {
        const accountUrl = `https://graph.facebook.com/v18.0/${instagramId}`;
        const accountRes = await axios.get(accountUrl, {
          params: {
            fields: 'followers_count,media_count',
            access_token: accessToken
          }
        });
        followerCount = accountRes.data.followers_count || 0;
        mediaCount = accountRes.data.media_count || 0;
      } catch (err) {
        console.log('Could not fetch account info:', err.message);
      }

      // Get recent media to calculate total likes/comments
      let totalLikes = 0;
      let totalComments = 0;
      
      try {
        const mediaUrl = `https://graph.facebook.com/v18.0/${instagramId}/media`;
        const mediaRes = await axios.get(mediaUrl, {
          params: {
            fields: 'like_count,comments_count',
            limit: 50,
            access_token: accessToken
          }
        });

        if (mediaRes.data.data) {
          mediaRes.data.data.forEach(media => {
            totalLikes += media.like_count || 0;
            totalComments += media.comments_count || 0;
          });
        }
      } catch (err) {
        console.log('Could not fetch media insights:', err.message);
      }

      return {
        likes: totalLikes,
        comments: totalComments,
        shares: 0, // Instagram API doesn't provide shares
        followers: followerCount,
        mediaCount: mediaCount
      };
    } catch (error) {
      console.error('Error fetching Instagram data:', error.response?.data || error.message);
      return null;
    }
  }

  // Store daily analytics
  async storeDailyAnalytics(userId) {
    try {
      const socialConnections = await prisma.socialConnection.findMany({
        where: { 
          userId,
          isConnected: true 
        }
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      let storedCount = 0;

      for (const connection of socialConnections) {
        let insights = null;

        if (connection.platform === 'facebook') {
          insights = await this.fetchFacebookPageInsights(connection, connection.accessToken);
        } else if (connection.platform === 'instagram') {
          insights = await this.fetchInstagramInsights(connection, connection.accessToken);
        } else {
          continue;
        }

        if (insights) {
          // Prepare data
          const analyticsData = {
            followers: insights.followers || 0,
            likes: insights.likes || 0,
            comments: insights.comments || 0,
            shares: insights.shares || 0,
            mediaCount: insights.mediaCount || 0,
            date: yesterday
          };

          // Check if analytics already exist
          const existing = await prisma.analytics.findFirst({
            where: {
              socialAccountId: connection.id,
              date: yesterday
            }
          });

          if (existing) {
            // Update existing
            await prisma.analytics.update({
              where: { id: existing.id },
              data: analyticsData
            });
          } else {
            // Create new
            await prisma.analytics.create({
              data: {
                socialAccountId: connection.id,
                ...analyticsData
              }
            });
          }
          
          console.log(`✅ Stored analytics for ${connection.platform} - ${connection.accountName}`);
          storedCount++;
        }
      }

      return storedCount;
    } catch (error) {
      console.error('Error storing daily analytics:', error);
      throw error;
    }
  }
}

module.exports = new AnalyticsService();