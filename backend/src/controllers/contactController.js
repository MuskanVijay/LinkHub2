const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const prisma = new PrismaClient();

// Email configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'muskanvijay942@gmail.com',
      pass: process.env.EMAIL_PASS
    }
  });
};

// Valid recipient emails
const VALID_RECIPIENTS = [
  'muskanvijay942@gmail.com',
  'bcsbs2212215@szabist.pk'
];

// Create contact message
exports.createContactMessage = async (req, res) => {
  try {
    console.log('📥 Contact form submission received');
    console.log('📧 Request body:', req.body);
    
    const { name, email, subject, message, category, recipientEmail } = req.body;
    const userId = req.user?.userId || null;

    // Validation
    if (!name || !email || !subject || !message || !recipientEmail) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'All fields are required including recipient email'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Validate recipient email
    if (!VALID_RECIPIENTS.includes(recipientEmail)) {
      console.log('❌ Invalid recipient email:', recipientEmail);
      return res.status(400).json({
        success: false,
        error: 'Invalid recipient email selected'
      });
    }

    // Check message length
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Message must be at least 10 characters long'
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message cannot exceed 2000 characters'
      });
    }

    // Create message in database
    console.log('💾 Saving contact message to database...');
    const contactMessage = await prisma.contactMessage.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        recipientEmail: recipientEmail.trim(),
        subject: subject.trim(),
        message: message.trim(),
        category: category || 'general',
        userId
      }
    });

    console.log('✅ Contact message saved to database with ID:', contactMessage.id);

    // Send email notification to selected recipient
    try {
      console.log('📧 Sending email notification to:', recipientEmail);
      await sendEmailToRecipient(name, email, subject, message, recipientEmail);
      console.log('✅ Email notification sent successfully');
      
      // Send confirmation email to user
      await sendConfirmationToUser(name, email, subject, message, recipientEmail);
      console.log('✅ Confirmation email sent to user');
    } catch (emailError) {
      console.error('❌ Email notification failed:', emailError);
      // Continue even if email fails - message is already saved in DB
    }

    res.json({
      success: true,
      message: `Thank you! Your message has been sent to ${recipientEmail} successfully.`,
      data: {
        id: contactMessage.id,
        name: contactMessage.name,
        email: contactMessage.email,
        recipientEmail: contactMessage.recipientEmail,
        subject: contactMessage.subject,
        createdAt: contactMessage.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Error creating contact message:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send message. Please try again later.',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Send email notification to selected recipient
const sendEmailToRecipient = async (name, userEmail, subject, message, recipientEmail) => {
  try {
    const transporter = createTransporter();
    
    const recipientName = recipientEmail === 'muskanvijay942@gmail.com' 
      ? 'Muskan Vijay' 
      : 'SZABIST Academic Support';
    
    const mailOptions = {
      from: 'muskanvijay942@gmail.com', 
  to: recipientEmail,
      to: recipientEmail,
      subject: `📧 New Contact Message: ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .info { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #667eea; }
            .message { background: #fff8e1; padding: 15px; border-radius: 5px; margin: 15px 0; border: 1px solid #ffd54f; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 10px 20px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>📬 New Contact Message Received</h2>
              <p>From: LinkHub Contact Form</p>
            </div>
            <div class="content">
              <div class="info">
                <p><strong>👤 From:</strong> ${name}</p>
                <p><strong>📧 Sender Email:</strong> ${userEmail}</p>
                <p><strong>🎯 Recipient:</strong> ${recipientName} (${recipientEmail})</p>
                <p><strong>📋 Subject:</strong> ${subject}</p>
                <p><strong>📅 Received:</strong> ${new Date().toLocaleString()}</p>
              </div>
              
              <div class="message">
                <h4>📝 Message:</h4>
                <p>${message.replace(/\n/g, '<br>')}</p>
              </div>
              
              <div style="margin-top: 20px;">
                <a href="mailto:${userEmail}" class="button">✉️ Reply to ${name}</a>
              </div>
            </div>
            <div class="footer">
              <p>This message was sent from your LinkHub contact form.</p>
              <p>Please respond within 24 hours.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('❌ Error sending email to recipient:', error);
    throw error;
  }
};

// Send confirmation email to user
const sendConfirmationToUser = async (name, userEmail, subject, message, recipientEmail) => {
  try {
    const transporter = createTransporter();
    
    const recipientName = recipientEmail === 'muskanvijay942@gmail.com' 
      ? 'Muskan Vijay' 
      : 'SZABIST Academic Support';
    
    const mailOptions = {
      from: `"LinkHub Support" <${process.env.EMAIL_USER || 'noreply@linkhub.com'}>`,
      to: userEmail,
      subject: `✅ Message Sent to ${recipientName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .info { background: white; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #4CAF50; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>✅ Message Successfully Sent!</h2>
            </div>
            <div class="content">
              <p>Dear <strong>${name}</strong>,</p>
              
              <div class="info">
                <p>Thank you for contacting us. Your message has been successfully delivered.</p>
                <p><strong>📨 Sent to:</strong> ${recipientName} (${recipientEmail})</p>
                <p><strong>📋 Subject:</strong> ${subject}</p>
                <p><strong>📅 Sent at:</strong> ${new Date().toLocaleString()}</p>
              </div>
              
              <div style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 15px 0; border: 1px solid #ffd54f;">
                <h4>📝 Your Message:</h4>
                <p>${message.replace(/\n/g, '<br>')}</p>
              </div>
              
              <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4>⏱️ What happens next?</h4>
                <ul>
                  <li>Your message has been received by ${recipientName}</li>
                  <li>You should receive a response within 24 hours</li>
                  <li>Check your spam folder if you don't see our response</li>
                </ul>
              </div>
              
              <p>Best regards,<br>
              <strong>The LinkHub Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated confirmation email. Please do not reply to this message.</p>
              <p>Need immediate assistance? Call us at +92 336 7390366</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('❌ Error sending confirmation email:', error);
    // Don't throw error - confirmation email failure shouldn't fail the whole request
    return false;
  }
};

// Get all contact messages (admin only)
exports.getAllContactMessages = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can view contact messages'
      });
    }

    const messages = await prisma.contactMessage.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contact messages'
    });
  }
};

// Update contact message status (admin only)
exports.updateMessageStatus = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can update message status'
      });
    }

    const { id } = req.params;
    const { status, responseNotes } = req.body;

    const validStatuses = ['PENDING', 'RESPONDED', 'RESOLVED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value'
      });
    }

    const message = await prisma.contactMessage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const updatedMessage = await prisma.contactMessage.update({
      where: { id: parseInt(id) },
      data: {
        status,
        responseNotes
      }
    });

    res.json({
      success: true,
      message: 'Message status updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update message status'
    });
  }
};

// Get contact statistics (admin only)
exports.getContactStats = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can view contact statistics'
      });
    }

    const totalMessages = await prisma.contactMessage.count();
    const pendingMessages = await prisma.contactMessage.count({
      where: { status: 'PENDING' }
    });
    const respondedMessages = await prisma.contactMessage.count({
      where: { status: 'RESPONDED' }
    });
    const resolvedMessages = await prisma.contactMessage.count({
      where: { status: 'RESOLVED' }
    });

    // Messages by recipient email
    const messagesByRecipient = await prisma.contactMessage.groupBy({
      by: ['recipientEmail'],
      _count: {
        id: true
      }
    });

    // Recent messages (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentMessages = await prisma.contactMessage.count({
      where: {
        createdAt: {
          gte: oneWeekAgo
        }
      }
    });

    res.json({
      success: true,
      data: {
        totalMessages,
        pendingMessages,
        respondedMessages,
        resolvedMessages,
        messagesByRecipient,
        recentMessages,
        last7Days: oneWeekAgo
      }
    });
  } catch (error) {
    console.error('Error fetching contact stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contact statistics'
    });
  }
};

// Test email endpoint
exports.testEmail = async (req, res) => {
  try {
    console.log('🧪 Testing email configuration...');
    
    const transporter = createTransporter();
    
    const testEmail = {
      from: process.env.EMAIL_USER || 'muskanvijay942@gmail.com',
      to: 'muskanvijay942@gmail.com',
      subject: '✅ LinkHub Email Test',
      text: 'This is a test email from LinkHub. If you received this, email is working correctly!',
      html: `
        <h2>✅ LinkHub Email Test Successful!</h2>
        <p>This is a test email sent at: ${new Date().toLocaleString()}</p>
        <p>If you received this, your email configuration is working correctly!</p>
      `
    };
    
    const info = await transporter.sendMail(testEmail);
    console.log('✅ Test email sent successfully:', info.messageId);
    
    res.json({
      success: true,
      message: 'Test email sent successfully!',
      messageId: info.messageId
    });
  } catch (error) {
    console.error('❌ Test email failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      message: error.message
    });
  }
};