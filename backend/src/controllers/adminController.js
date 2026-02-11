const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();



exports.getDashboardStats = async (req, res) => {
  try {
    const prisma = new PrismaClient();
    
    // Get all stats in parallel for better performance
    const [
      totalUsers,
      totalDrafts,
      publishedPosts,
      pendingApprovals,
      scheduledPosts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.draft.count(),
      prisma.draft.count({ where: { status: 'PUBLISHED' } }),
      prisma.draft.count({ where: { status: 'PENDING' } }),
      prisma.draft.count({ where: { status: 'SCHEDULED' } })
    ]);
    
    // Get active users (users with activity in last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: yesterday
        }
      }
    });

    res.json({
      totalUsers,
      totalDrafts,
      publishedPosts,
      pendingApprovals,
      scheduledPosts,
      activeUsers
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};


exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        profilePic: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch ( error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all drafts for admin - FIXED: using drafts
exports.getAllPosts = async (req, res) => {
  try {
    const drafts = await prisma.draft.findMany({ // ✅ FIXED: drafts instead of posts
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(drafts);
  } catch (error) {
    console.error('Get all drafts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Approve draft - FIXED
exports.approvePost = async (req, res) => {
  try {
    const { id } = req.params;
    const draft = await prisma.draft.update({ // ✅ FIXED
      where: { id: parseInt(id) },
      data: { status: 'APPROVED' }
    });
    res.json({ message: 'Draft approved', draft });
  } catch (error) {
    console.error('Approve draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Reject draft - FIXED
exports.rejectPost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const draft = await prisma.draft.update({ // ✅ FIXED
      where: { id: parseInt(id) },
      data: { 
        status: 'REJECTED',
        rejectionReason: reason 
      }
    });
    res.json({ message: 'Draft rejected', draft });
  } catch (error) {
    console.error('Reject draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    
    res.json({ 
      message: `User ${action} feature coming soon`,
      success: true
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
// Update user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { 
        name: name || null, // Allow empty name
        role: role || 'USER'
      }
    });

    res.json({ 
      success: true,
      message: 'User updated successfully', 
      user: updatedUser 
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user' 
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    // Check if valid ID
    if (isNaN(userId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid user ID' 
      });
    }

    console.log(`🗑️ Attempting to delete user ID: ${userId}`);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Prevent deleting self
    if (userId === req.user.userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot delete your own account' 
      });
    }

    // Prevent deleting admins (optional)
    if (user.role === 'ADMIN') {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot delete admin users' 
      });
    }

    console.log(`🗑️ Starting deletion process for user: ${user.email}`);

    await prisma.$transaction(async (tx) => {
      console.log('1️⃣ Deleting Social Connections (Published Posts first)...');
      
      await tx.publishedPost.deleteMany({
        where: {
          socialAccount: {
            userId: userId
          }
        }
      });
      console.log('✅ Published Posts deleted');

      console.log('2️⃣ Deleting Social Connections...');
      await tx.socialConnection.deleteMany({
        where: { userId: userId }
      });
      console.log('✅ Social Connections deleted');

      console.log('3️⃣ Deleting Drafts (Published Posts first)...');
      await tx.publishedPost.deleteMany({
        where: {
          draft: {
            userId: userId
          }
        }
      });
      console.log('✅ Published Posts for drafts deleted');

      console.log('4️⃣ Deleting Drafts...');
      await tx.draft.deleteMany({
        where: { userId: userId }
      });
      console.log('✅ Drafts deleted');

      console.log('5️⃣ Deleting FAQ Replies...');
      await tx.faqReply.deleteMany({
        where: { userId: userId }
      });
      console.log('✅ FAQ Replies deleted');

      console.log('6️⃣ Deleting FAQ Questions...');
      await tx.faqQuestion.deleteMany({
        where: { userId: userId }
      });
      console.log('✅ FAQ Questions deleted');

      console.log('7️⃣ Deleting Contact Messages...');
      await tx.contactMessage.deleteMany({
        where: { userId: userId }
      });
      console.log('✅ Contact Messages deleted');

      console.log('8️⃣ Deleting User...');
      await tx.user.delete({
        where: { id: userId }
      });
      console.log('✅ User deleted');
    });

    console.log(`✅ Successfully deleted user: ${user.email} (ID: ${userId})`);

    res.json({ 
      success: true,
      message: `User "${user.email}" has been deleted successfully along with all associated data.`,
      deletedUser: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    if (error.code === 'P2003') {
      const constraint = error.meta?.constraint || 'Unknown constraint';
      console.error(`Foreign key constraint violation: ${constraint}`);
      
      return res.status(500).json({ 
        success: false,
        error: 'Cannot delete user due to remaining related records',
        details: `Please check if all related records are being deleted. Constraint: ${constraint}`,
        code: error.code
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete user',
      details: error.message,
      code: error.code
    });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // You need to add a 'status' field to your User model first
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { status }
    });

    res.json({ message: 'User status updated', user });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};