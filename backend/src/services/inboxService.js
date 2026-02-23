const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class InboxService {
  // Fetch Facebook Page comments and messages
  async fetchFacebookMessages(socialAccount) {
    try {
      const messages = [];
      const accessToken = socialAccount.accessToken;
      const pageId = socialAccount.metadata?.pageId || socialAccount.platformUserId;

      if (!pageId) return [];

      console.log(`📱 Fetching Facebook messages for ${socialAccount.accountName}`);

      // 1. Get page conversations (messages)
      try {
        const conversationsUrl = `https://graph.facebook.com/v18.0/${pageId}/conversations`;
        const convResponse = await axios.get(conversationsUrl, {
          params: {
            fields: 'id,participants,updated_time,message_count,unread_count',
            access_token: accessToken,
            limit: 50
          }
        });

        for (const conv of convResponse.data.data || []) {
          // Get messages for this conversation
          const messagesUrl = `https://graph.facebook.com/v18.0/${conv.id}/messages`;
          const msgResponse = await axios.get(messagesUrl, {
            params: {
              fields: 'id,created_time,from,message,attachments,to',
              access_token: accessToken,
              limit: 20
            }
          });

          for (const msg of msgResponse.data.data || []) {
            const existing = await prisma.inboxMessage.findFirst({
              where: {
                socialAccountId: socialAccount.id,
                platformMessageId: msg.id
              }
            });

            if (!existing) {
              messages.push({
                socialAccountId: socialAccount.id,
                platform: 'facebook',
                platformMessageId: msg.id,
                senderId: msg.from?.id || 'unknown',
                senderName: msg.from?.name || 'Unknown User',
                senderAvatar: msg.from?.picture?.data?.url,
                content: msg.message || '',
                messageType: 'message',
                mediaUrls: msg.attachments?.data?.map(a => a.image_data?.url) || [],
                receivedAt: new Date(msg.created_time),
                isRead: false
              });
            }
          }
        }
      } catch (err) {
        console.log('Error fetching Facebook conversations:', err.message);
      }

      // 2. Get page post comments
      try {
        const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/feed`;
        const postsResponse = await axios.get(postsUrl, {
          params: {
            fields: 'id,comments{id,created_time,from,message,attachment,comment_count}',
            access_token: accessToken,
            limit: 20
          }
        });

        for (const post of postsResponse.data.data || []) {
          if (post.comments?.data) {
            for (const comment of post.comments.data) {
              const existing = await prisma.inboxMessage.findFirst({
                where: {
                  socialAccountId: socialAccount.id,
                  platformMessageId: comment.id
                }
              });

              if (!existing) {
                messages.push({
                  socialAccountId: socialAccount.id,
                  platform: 'facebook',
                  platformMessageId: comment.id,
                  senderId: comment.from?.id || 'unknown',
                  senderName: comment.from?.name || 'Unknown User',
                  content: comment.message || '',
                  messageType: 'comment',
                  postId: post.id,
                  receivedAt: new Date(comment.created_time),
                  isRead: false
                });
              }

              // Check for replies to comments
              if (comment.comments?.data) {
                for (const reply of comment.comments.data) {
                  const existingReply = await prisma.inboxMessage.findFirst({
                    where: {
                      socialAccountId: socialAccount.id,
                      platformMessageId: reply.id
                    }
                  });

                  if (!existingReply) {
                    messages.push({
                      socialAccountId: socialAccount.id,
                      platform: 'facebook',
                      platformMessageId: reply.id,
                      parentId: comment.id,
                      senderId: reply.from?.id || 'unknown',
                      senderName: reply.from?.name || 'Unknown User',
                      content: reply.message || '',
                      messageType: 'reply',
                      postId: post.id,
                      receivedAt: new Date(reply.created_time),
                      isRead: false
                    });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.log('Error fetching Facebook comments:', err.message);
      }

      return messages;
    } catch (error) {
      console.error('Error in fetchFacebookMessages:', error);
      return [];
    }
  }

  // Fetch Instagram comments
  async fetchInstagramMessages(socialAccount) {
    try {
      const messages = [];
      const accessToken = socialAccount.accessToken;
      const instagramId = socialAccount.metadata?.instagramId || socialAccount.platformUserId;

      if (!instagramId) return [];

      console.log(`📱 Fetching Instagram messages for ${socialAccount.accountName}`);

      // Get recent media posts
      const mediaUrl = `https://graph.facebook.com/v18.0/${instagramId}/media`;
      const mediaResponse = await axios.get(mediaUrl, {
        params: {
          fields: 'id,caption,comments_count',
          limit: 20,
          access_token: accessToken
        }
      });

      for (const media of mediaResponse.data.data || []) {
        // Get comments for this media
        const commentsUrl = `https://graph.facebook.com/v18.0/${media.id}/comments`;
        const commentsResponse = await axios.get(commentsUrl, {
          params: {
            fields: 'id,text,timestamp,username,user,like_count,replies',
            access_token: accessToken,
            limit: 50
          }
        });

        for (const comment of commentsResponse.data.data || []) {
          const existing = await prisma.inboxMessage.findFirst({
            where: {
              socialAccountId: socialAccount.id,
              platformMessageId: comment.id
            }
          });

          if (!existing) {
            messages.push({
              socialAccountId: socialAccount.id,
              platform: 'instagram',
              platformMessageId: comment.id,
              senderId: comment.user?.id || comment.id,
              senderName: comment.username,
              senderUsername: comment.username,
              senderAvatar: comment.user?.profile_picture,
              content: comment.text || '',
              messageType: 'comment',
              postId: media.id,
              receivedAt: new Date(comment.timestamp),
              isRead: false
            });
          }

          // Check for replies
          if (comment.replies?.data) {
            for (const reply of comment.replies.data) {
              const existingReply = await prisma.inboxMessage.findFirst({
                where: {
                  socialAccountId: socialAccount.id,
                  platformMessageId: reply.id
                }
              });

              if (!existingReply) {
                messages.push({
                  socialAccountId: socialAccount.id,
                  platform: 'instagram',
                  platformMessageId: reply.id,
                  parentId: comment.id,
                  senderId: reply.user?.id || reply.id,
                  senderName: reply.username,
                  senderUsername: reply.username,
                  content: reply.text || '',
                  messageType: 'reply',
                  postId: media.id,
                  receivedAt: new Date(reply.timestamp),
                  isRead: false
                });
              }
            }
          }
        }
      }

      return messages;
    } catch (error) {
      console.error('Error in fetchInstagramMessages:', error.response?.data || error.message);
      return [];
    }
  }

  // Fetch all messages for user
  async fetchAllMessages(userId) {
    try {
      const socialAccounts = await prisma.socialConnection.findMany({
        where: { 
          userId,
          isConnected: true,
          platform: { in: ['facebook', 'instagram'] }
        }
      });

      let totalNew = 0;

      for (const account of socialAccounts) {
        let newMessages = [];
        
        if (account.platform === 'facebook') {
          newMessages = await this.fetchFacebookMessages(account);
        } else if (account.platform === 'instagram') {
          newMessages = await this.fetchInstagramMessages(account);
        }

        if (newMessages.length > 0) {
          await prisma.inboxMessage.createMany({
            data: newMessages,
            skipDuplicates: true
          });
          totalNew += newMessages.length;
          console.log(`✅ Added ${newMessages.length} new messages for ${account.platform} - ${account.accountName}`);
        }
      }

      return totalNew;
    } catch (error) {
      console.error('Error fetching all messages:', error);
      throw error;
    }
  }

  // Reply to a message
  async replyToMessage(messageId, content, userId) {
    try {
      const message = await prisma.inboxMessage.findFirst({
        where: { 
          id: messageId,
          socialAccount: { userId }
        },
        include: { socialAccount: true }
      });

      if (!message) {
        throw new Error('Message not found');
      }

      let platformReplyId = null;
      let success = false;

      // Post reply to platform
      if (message.platform === 'facebook') {
        if (message.messageType === 'comment' || message.messageType === 'reply') {
          // Reply to comment
          const replyUrl = `https://graph.facebook.com/v18.0/${message.platformMessageId}/comments`;
          const response = await axios.post(replyUrl, {
            message: content,
            access_token: message.socialAccount.accessToken
          });
          platformReplyId = response.data.id;
          success = true;
        } else {
          // Reply to private message
          const replyUrl = `https://graph.facebook.com/v18.0/me/messages`;
          const response = await axios.post(replyUrl, {
            recipient: { id: message.senderId },
            message: { text: content },
            access_token: message.socialAccount.accessToken
          });
          platformReplyId = response.data.message_id;
          success = true;
        }
      } else if (message.platform === 'instagram') {
        // Reply to Instagram comment
        const replyUrl = `https://graph.facebook.com/v18.0/${message.platformMessageId}/replies`;
        const response = await axios.post(replyUrl, {
          message: content,
          access_token: message.socialAccount.accessToken
        });
        platformReplyId = response.data.id;
        success = true;
      }

      // Store reply in database
      const reply = await prisma.inboxReply.create({
        data: {
          messageId,
          content,
          platformReplyId,
          status: success ? 'sent' : 'failed'
        }
      });

      // Mark message as replied
      await prisma.inboxMessage.update({
        where: { id: messageId },
        data: { isReplied: true }
      });

      return { success: true, reply };
    } catch (error) {
      console.error('Error replying to message:', error.response?.data || error.message);
      
      // Store failed reply
      await prisma.inboxReply.create({
        data: {
          messageId,
          content,
          status: 'failed',
          errorMessage: error.message
        }
      });

      throw error;
    }
  }


async getUserInbox(userId, filters = {}) {
  try {
    const { 
      platform, 
      messageType, 
      isRead, 
      search, 
      limit = 50, 
      offset = 0,
      startDate,
      endDate 
    } = filters;

    const where = {
      socialAccount: {
        userId
      }
    };

    if (platform) where.platform = platform;
    if (messageType) where.messageType = messageType;
    if (isRead !== undefined) where.isRead = isRead === 'true';
    
    if (search) {
      where.OR = [
        { content: { contains: search, mode: 'insensitive' } },
        { senderName: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (startDate || endDate) {
      where.receivedAt = {};
      if (startDate) where.receivedAt.gte = new Date(startDate);
      if (endDate) where.receivedAt.lte = new Date(endDate);
    }

    const messages = await prisma.inboxMessage.findMany({
      where,
      include: {
        socialAccount: {
          select: {
            platform: true,
            accountName: true,
            profilePicture: true
          }
        },
        replies: {
          orderBy: {
            createdAt: 'desc'  // Changed from sentAt to createdAt
          },
          take: 1
        }
      },
      orderBy: { receivedAt: 'desc' },
      skip: parseInt(offset),
      take: parseInt(limit)
    });

    const total = await prisma.inboxMessage.count({ where });

    const unreadCount = await prisma.inboxMessage.count({
      where: {
        ...where,
        isRead: false
      }
    });

    return {
      success: true,
      data: {
        messages,
        pagination: {
          total,
          unread: unreadCount,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + messages.length < total
        },
        summary: {
          totalMessages: total,
          unreadMessages: unreadCount,
          platforms: [...new Set(messages.map(m => m.platform))]
        }
      }
    };
  } catch (error) {
    console.error('Error getting user inbox:', error);
    throw error;
  }
}
  // Mark message as read
  async markAsRead(messageId) {
    return prisma.inboxMessage.update({
      where: { id: messageId },
      data: { isRead: true }
    });
  }

  // Mark multiple messages as read
  async markMultipleAsRead(messageIds) {
    return prisma.inboxMessage.updateMany({
      where: { id: { in: messageIds } },
      data: { isRead: true }
    });
  }

  // Get unread count
  async getUnreadCount(userId) {
    return prisma.inboxMessage.count({
      where: {
        socialAccount: { userId },
        isRead: false
      }
    });
  }
}

module.exports = new InboxService();