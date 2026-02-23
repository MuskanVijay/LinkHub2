const inboxService = require('../services/inboxService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const inboxController = {
  // Get inbox messages
  getInbox: async (req, res) => {
    try {
      const userId = parseInt(req.user.userId);
      const { 
        platform, 
        messageType, 
        isRead, 
        search, 
        limit, 
        offset,
        startDate,
        endDate 
      } = req.query;

      const result = await inboxService.getUserInbox(userId, {
        platform,
        messageType,
        isRead,
        search,
        limit,
        offset,
        startDate,
        endDate
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting inbox:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch inbox messages',
        error: error.message
      });
    }
  },

  // Get single message with thread
  getMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = parseInt(req.user.userId);

      const message = await prisma.inboxMessage.findFirst({
        where: {
          id: parseInt(messageId),
          socialAccount: { userId }
        },
        include: {
          socialAccount: true,
          replies: {
            orderBy: { sentAt: 'asc' }
          },
          parent: true
        }
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      // Get thread (all messages in this conversation)
      let thread = [];
      if (message.parentId) {
        // This is a reply, get parent and all its replies
        thread = await prisma.inboxMessage.findMany({
          where: {
            OR: [
              { id: message.parentId },
              { parentId: message.parentId }
            ]
          },
          include: { socialAccount: true },
          orderBy: { receivedAt: 'asc' }
        });
      } else {
        // This is a parent, get all its replies
        thread = await prisma.inboxMessage.findMany({
          where: {
            OR: [
              { id: message.id },
              { parentId: message.id }
            ]
          },
          include: { socialAccount: true },
          orderBy: { receivedAt: 'asc' }
        });
      }

      res.json({
        success: true,
        data: {
          message,
          thread
        }
      });
    } catch (error) {
      console.error('Error getting message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch message',
        error: error.message
      });
    }
  },

  // Fetch new messages from platforms
  fetchMessages: async (req, res) => {
    try {
      const userId = parseInt(req.user.userId);
      
      const newCount = await inboxService.fetchAllMessages(userId);
      
      res.json({
        success: true,
        message: `Fetched ${newCount} new messages`,
        data: { newMessages: newCount }
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
        error: error.message
      });
    }
  },

  // Reply to a message
  replyToMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = parseInt(req.user.userId);

      if (!content || content.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Reply content is required'
        });
      }

      const result = await inboxService.replyToMessage(
        parseInt(messageId), 
        content, 
        userId
      );

      res.json({
        success: true,
        message: 'Reply sent successfully',
        data: result
      });
    } catch (error) {
      console.error('Error replying to message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send reply',
        error: error.message
      });
    }
  },

  // Mark message as read
  markAsRead: async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = parseInt(req.user.userId);

      const message = await prisma.inboxMessage.findFirst({
        where: {
          id: parseInt(messageId),
          socialAccount: { userId }
        }
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      await inboxService.markAsRead(parseInt(messageId));

      res.json({
        success: true,
        message: 'Message marked as read'
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark message as read',
        error: error.message
      });
    }
  },

  // Mark multiple messages as read
  markMultipleAsRead: async (req, res) => {
    try {
      const { messageIds } = req.body;
      const userId = parseInt(req.user.userId);

      if (!messageIds || !Array.isArray(messageIds)) {
        return res.status(400).json({
          success: false,
          message: 'Message IDs array is required'
        });
      }

      // Verify all messages belong to user
      const messages = await prisma.inboxMessage.findMany({
        where: {
          id: { in: messageIds.map(id => parseInt(id)) },
          socialAccount: { userId }
        }
      });

      if (messages.length !== messageIds.length) {
        return res.status(403).json({
          success: false,
          message: 'Some messages do not belong to you'
        });
      }

      await inboxService.markMultipleAsRead(messageIds.map(id => parseInt(id)));

      res.json({
        success: true,
        message: `${messageIds.length} messages marked as read`
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark messages as read',
        error: error.message
      });
    }
  },

  // Get unread count
  getUnreadCount: async (req, res) => {
    try {
      const userId = parseInt(req.user.userId);
      
      const unreadCount = await inboxService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { unread: unreadCount }
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: error.message
      });
    }
  },

  // Delete message
  deleteMessage: async (req, res) => {
    try {
      const { messageId } = req.params;
      const userId = parseInt(req.user.userId);

      const message = await prisma.inboxMessage.findFirst({
        where: {
          id: parseInt(messageId),
          socialAccount: { userId }
        }
      });

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }

      // Delete message and its replies
      await prisma.$transaction([
        prisma.inboxReply.deleteMany({
          where: { messageId: parseInt(messageId) }
        }),
        prisma.inboxMessage.deleteMany({
          where: {
            OR: [
              { id: parseInt(messageId) },
              { parentId: parseInt(messageId) }
            ]
          }
        })
      ]);

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete message',
        error: error.message
      });
    }
  },

getInboxStats: async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const messages = await prisma.inboxMessage.findMany({
      where: {
        socialAccount: { userId },
        receivedAt: { gte: startDate }
      },
      include: {
        socialAccount: true
      }
    });

    // Group by platform
    const byPlatform = {};
    messages.forEach(msg => {
      if (!byPlatform[msg.platform]) {
        byPlatform[msg.platform] = {
          total: 0,
          unread: 0,
          comments: 0,
          messages: 0
        };
      }
      byPlatform[msg.platform].total++;
      if (!msg.isRead) byPlatform[msg.platform].unread++;
      if (msg.messageType === 'comment') byPlatform[msg.platform].comments++;
      else byPlatform[msg.platform].messages++;
    });

    // Activity over time
    const activity = [];
    for (let i = 0; i < parseInt(days); i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayMessages = messages.filter(m => 
        m.receivedAt >= date && m.receivedAt < nextDate
      );

      activity.push({
        date: date.toISOString().split('T')[0],
        count: dayMessages.length,
        unread: dayMessages.filter(m => !m.isRead).length
      });
    }

    res.json({
      success: true,
      data: {
        totalMessages: messages.length,
        unreadMessages: messages.filter(m => !m.isRead).length,
        byPlatform,
        activity: activity.reverse(),
        period: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error getting inbox stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get inbox statistics',
      error: error.message
    });
  }
}
};

module.exports = inboxController;