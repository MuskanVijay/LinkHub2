const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const { sendEmailOTP, sendPasswordResetEmail } = require('../utils/sendEmail');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// TEST EMAIL - DELETE AFTER SUCCESS
exports.testEmail = async (req, res) => {
  const success = await sendEmailOTP('muskanvijay942@gmail.com', '123456');
  res.json({ success });
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get current user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { 
        id: true, 
        email: true, 
        name: true, 
        username: true,
        phone: true,
        bio: true,
        timezone: true,
        notifications: true,
        role: true 
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
exports.uploadProfilePicture = async (req, res) => {
  try {
    console.log('🔄 Upload profile picture called');
    
    // Check if user is authenticated
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false,
        error: 'Unauthorized. Please login again.' 
      });
    }
    
    const userId = req.user.userId;
    
    // Check for file (multer puts it in req.file)
    if (!req.file) {
      console.log('❌ No file uploaded via multer');
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded. Please select a file.' 
      });
    }
    
    console.log('📁 File uploaded via multer:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    // Generate URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const imageUrl = `/uploads/profile-pictures/${req.file.filename}`;
    const fullUrl = `${baseUrl}${imageUrl}`;

    console.log('🌐 Image URL:', fullUrl);

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { 
        profilePic: fullUrl,
      },
      select: { id: true, email: true, profilePic: true, name: true }
    });

    console.log('✅ Database updated for user:', userId);

    res.json({
      success: true,
      profilePictureUrl: fullUrl,
      message: 'Profile picture uploaded successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('❌ Unexpected error uploading profile picture:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to upload profile picture',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
exports.deleteAccount = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const tokenUserId = req.user.userId;
    
    if (tokenUserId !== userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Unauthorized: You can only delete your own account' 
      });
    }
    
    // Use Prisma to delete the user
    const deletedUser = await prisma.user.delete({
      where: { id: userId }
    });
    
    console.log('✅ User account deleted successfully:', userId);
    
    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
};

exports.removeProfilePicture = async (req, res) => {
  try {
    const userId = req.user.userId;

    console.log('🔄 Removing profile picture for user:', userId);

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { profilePic: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📁 Current profilePic:', user.profilePic);

    // If user has a profile picture, delete the file
    if (user.profilePic) {
      // Extract filename from URL
      const fileName = user.profilePic.split('/').pop().split('?')[0]; // Remove query params
      
      // ✅ Use the same corrected path
      const filePath = path.join(__dirname, '..', 'uploads', 'profile-pictures', fileName);
      
      console.log('📁 File to delete:', filePath);
      console.log('📁 File exists?', fs.existsSync(filePath));
      
      // Delete the file from server
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ File deleted from server');
      } else {
        console.log('⚠️ File not found on server, but continuing...');
      }
    }

    // Update user to remove profile picture URL
    await prisma.user.update({
      where: { id: userId },
      data: { profilePic: null }
    });

    console.log('✅ Profile picture removed from database');
    
    res.json({
      success: true,
      message: 'Profile picture removed successfully'
    });

  } catch (error) {
    console.error('❌ Error removing profile picture:', error);
    res.status(500).json({ 
      error: 'Failed to remove profile picture',
      details: error.message 
    });
  }
};
exports.updateProfile = async (req, res) => {
  try {
    const { name, username, phone, bio, timezone, notifications, instagram, facebook, twitter, linkedin } = req.body;
    
    // Prepare update data
    const updateData = {
      name: name || null,
      phone: phone || null,
      bio: bio || null,
      timezone: timezone || 'Asia/Karachi',
      notifications: notifications !== false,
      instagram: instagram || null,
      facebook: facebook || null,
      twitter: twitter || null,
      linkedin: linkedin || null
    };
    
    // Handle username - only update if it has value
    if (username && username.trim() !== '') {
      const trimmedUsername = username.trim();
      
      // Check if username is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          username: trimmedUsername,
          id: { not: parseInt(req.params.id) }
        }
      });
      
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          error: 'Username already taken. Please choose another.' 
        });
      }
      
      updateData.username = trimmedUsername;
    } else {
      // Set to null if empty
      updateData.username = null;
    }
    
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: updateData
    });
    
    res.json({ 
      success: true,
      message: 'Profile updated successfully', 
      user 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.code === 'P2002') {
      // Unique constraint violation
      return res.status(400).json({ 
        success: false,
        error: 'Username already exists. Please choose a different one.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to update profile: ' + error.message 
    });
  }
};

exports.signup = async (req, res) => {
  const { email, password, name } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ 
      success: false,
      error: 'Email and password are required' 
    });
  }

  // Password validation
  if (password.length < 6) {
    return res.status(400).json({ 
      success: false,
      error: 'Password must be at least 6 characters long' 
    });
  }

  try {
    console.log('🔍 Starting signup for:', email);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ 
      where: { email } 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'Email already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Only specific emails can be ADMIN
    const adminEmails = ['bcsbs2212215@szabist.pk', 'muskanvijay942@gmail.com'];
    const userRole = adminEmails.includes(email) ? 'ADMIN' : 'USER';

    // Generate OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    console.log('🔍 Generated OTP:', otpCode);
    console.log('🔍 OTP expires at:', otpExpires);

    // Create user WITH OTP in User table
    const user = await prisma.user.create({
      data: { 
        email, 
        password: hashedPassword, 
        role: userRole,
        name: name || email.split('@')[0],
        otpCode,           // Save OTP in User table
        otpExpires,        // Save expiration in User table
        isVerified: false  // User is not verified yet
      }
    });

    console.log('✅ User created with ID:', user.id);

    // Send OTP email
    const emailSent = await sendEmailOTP(email, otpCode);
    
    if (!emailSent) {
      console.error('❌ Failed to send OTP email');
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP email'
      });
    }

    console.log(`✅ OTP sent to ${email}: ${otpCode} | Role: ${userRole}`);

    res.json({ 
      success: true,
      message: 'OTP sent to your email. Please verify to complete registration.',
      userId: user.id,
      email: user.email
    });
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Registration failed. Please try again.',
      details: error.message 
    });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({ 
      where: { email } 
    });
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }

    // // ✅ ADD THIS: Check if user is verified via OTP
    // if (!user.isVerified) {
    //   return res.status(403).json({ 
    //     success: false,
    //     error: 'Email not verified. Please check your email for OTP.',
    //     needsVerification: true,
    //     userId: user.id,
    //     email: user.email
    //   });
    // }

    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      success: true,
      message: 'Login successful',
      token, 
      userId: user.id, 
      role: user.role,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePic: user.profilePic,
        isVerified: user.isVerified
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed. Please try again.' 
    });
  }
};
exports.verifyOtp = async (req, res) => {
  console.log('📥 FULL REQUEST BODY:', JSON.stringify(req.body, null, 2));
  
  const { email, userId, otp } = req.body; // Accept both email and userId
  
  try {
    let user;
    
    // If email is provided, find by email
    if (email) {
      console.log('🔍 Finding user by email:', email);
      user = await prisma.user.findUnique({
        where: { email }
      });
    } 
    // If userId is provided, find by ID
    else if (userId) {
      console.log('🔍 Finding user by ID:', userId);
      user = await prisma.user.findUnique({
        where: { id: parseInt(userId) }
      });
    } 
    // Neither provided
    else {
      console.log('❌ Neither email nor userId provided');
      return res.status(400).json({
        success: false,
        error: 'Email or User ID is required'
      });
    }

    console.log('🔍 User found:', user ? user.id : 'NOT FOUND');
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('🔍 Stored OTP:', user.otpCode);
    console.log('🔍 OTP expires:', user.otpExpires);
    console.log('🔍 Current time:', new Date());

    // Check if OTP exists
    if (!user.otpCode) {
      console.log('❌ No OTP found for user');
      return res.status(400).json({
        success: false,
        error: 'No OTP found. Please request a new OTP.'
      });
    }

    // Check if OTP is expired
    if (new Date() > new Date(user.otpExpires)) {
      console.log('❌ OTP expired');
      return res.status(400).json({
        success: false,
        error: 'OTP has expired. Please request a new OTP.'
      });
    }

    // Check if OTP matches
    if (user.otpCode !== otp) {
      console.log('❌ OTP mismatch. Expected:', user.otpCode, 'Got:', otp);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP. Please try again.'
      });
    }

    // OTP is valid! Update user as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        otpCode: null,      // Clear OTP
        otpExpires: null    // Clear expiration
      }
    });

    console.log('✅ OTP verified for user:', updatedUser.id);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: updatedUser.id, 
        role: updatedUser.role,
        email: updatedUser.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ 
      success: true,
      message: 'Email verified successfully!',
      token, 
      userId: updatedUser.id, 
      role: updatedUser.role,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        isVerified: true
      }
    });
    
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP',
      message: error.message
    });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    console.log('🔍 BACKEND: getUserProfile called with ID:', req.params.id);
    
    const userId = parseInt(req.params.id);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        name: true,
        username: true,
        phone: true,
        bio: true,
        timezone: true,
        notifications: true,
        instagram: true,
        facebook: true,
        twitter: true,
        linkedin: true,
        profilePic: true,
        role: true
      }
    });

    console.log('🔍 BACKEND: Found user:', user);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('🔍 BACKEND: getUserProfile error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

// ========== PASSWORD RESET FUNCTIONS ==========

// Forgot Password - Generate reset token
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    // For security, don't reveal if email exists or not
    if (!user) {
      return res.json({ 
        message: 'If an account with that email exists, password reset instructions have been sent.' 
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save reset token to user in database
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetTokenExpiry
      }
    });

    // CREATE RESET LINK
    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;

    // Send password reset email
    const emailSent = await sendPasswordResetEmail(email, resetLink, user.name || 'there');

    if (emailSent) {
      console.log(`✅ Password reset email sent to: ${email}`);
      console.log(`🔐 Reset token: ${resetToken}`); // Keep for testing
      
      res.json({
        message: 'If an account with that email exists, password reset instructions have been sent.'
      });
    } else {
      throw new Error('Failed to send password reset email');
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error processing password reset' });
  }
};

// Validate reset token (GET request)
exports.validateResetToken = async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  try {
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          gt: new Date()
        }
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    res.json({ 
      success: true, 
      message: 'Token is valid',
      email: user.email,
      name: user.name
    });
    
  } catch (error) {
    console.error('Reset token validation error:', error);
    res.status(500).json({ error: 'Server error during token validation' });
  }
};

// Update password with token (POST request)
exports.updatePasswordWithToken = async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          gt: new Date()
        }
      }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });
    
    res.json({ success: true, message: 'Password updated successfully' });
    
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Server error during password update' });
  }
};

// Original reset password function (keep for compatibility)
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find user by valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    console.log(`✅ Password reset successfully for user: ${user.email}`);

    res.json({ 
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error resetting password' });
  }
};

// Test password reset email
exports.testPasswordResetEmail = async (req, res) => {
  try {
    console.log('🧪 Testing password reset email configuration...');
    
    const testEmail = 'muskanvijay942@gmail.com';
    const testLink = 'http://localhost:3000/reset-password?token=test123';
    
    console.log('📧 Sending test password reset email to:', testEmail);
    
    const emailSent = await sendPasswordResetEmail(testEmail, testLink, 'Test User');
    
    if (emailSent) {
      console.log('✅ Test password reset email sent successfully!');
      res.json({ success: true, message: 'Test password reset email sent successfully' });
    } else {
      console.log('❌ Test password reset email failed to send');
      res.json({ success: false, message: 'Test password reset email failed to send' });
    }
  } catch (error) {
    console.error('❌ Test password reset email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};  

exports.resendOtp = async (req, res) => {
  const { email } = req.body;

  try {
    console.log('🔍 Resending OTP for:', email);

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 5 * 60 * 1000);

    // Update user with new OTP
    await prisma.user.update({
      where: { email },
      data: {
        otpCode,
        otpExpires,
        isVerified: false
      }
    });

    console.log('🔍 New OTP generated:', otpCode);

    // Send email
    const emailSent = await sendEmailOTP(email, otpCode);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP email'
      });
    }

    console.log('✅ New OTP sent to:', email);

    res.json({
      success: true,
      message: 'New OTP sent to your email'
    });

  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend OTP'
    });
  }
};

// Test endpoint to verify route is working
exports.testVerifyRoute = async (req, res) => {
  console.log('✅ Test route called!');
  console.log('📥 Request body:', req.body);
  res.json({ 
    success: true, 
    message: 'Route is working!',
    received: req.body 
  });
};

