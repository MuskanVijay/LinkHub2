const nodemailer = require('nodemailer');

const sendEmailOTP = async (toEmail, otp) => {
  try {
    console.log('Sending email to:', toEmail);
    console.log('Using EMAIL_USER:', process.env.EMAIL_USER);

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
      from: `"LinkHub FYP" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'Your LinkHub OTP Code',
      html: `
        <div style="font-family: Arial; padding: 20px; background: #f4f4f4; border-radius: 10px;">
          <h2 style="color: #1a73e8;">LinkHub - Your OTP</h2>
          <p>Hello,</p>
          <p>Your verification code is:</p>
          <h1 style="background: #1a73e8; color: white; padding: 15px; border-radius: 8px; text-align: center; letter-spacing: 5px; font-size: 28px;">
            ${otp}
          </h1>
          <p>This code expires in <strong>5 minutes</strong>.</p>
          <p>If you didn't request this, ignore this email.</p>
          <hr>
          <small>LinkHub FYP © 2025</small>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('EMAIL SENT:', info.messageId);
    return true;
  } catch (error) {
    console.error('EMAIL ERROR:', error.message);
    return false;
  }
};

const sendPasswordResetEmail = async (toEmail, resetLink, userName = 'there') => {
  try {
    console.log('Sending password reset email to:', toEmail);
    console.log('Using EMAIL_USER:', process.env.EMAIL_USER);

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
      from: `"LinkHub FYP" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'Password Reset Request - LinkHub',
      html: `
        <div style="font-family: Arial; padding: 20px; background: #f4f4f4; border-radius: 10px;">
          <h2 style="color: #1a73e8;">LinkHub - Password Reset</h2>
          <p>Hello ${userName},</p>
          <p>You requested to reset your password for your LinkHub account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 25px 0;">
            <a href="${resetLink}" 
               style="background-color: #10b981; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 8px; font-weight: bold;
                      display: inline-block; font-size: 16px;">
              Reset Your Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center; background: white; padding: 10px; border-radius: 5px;">
            Or copy this link: <br>
            <code style="word-break: break-all;">${resetLink}</code>
          </p>
          <p>This link will expire in <strong>1 hour</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr>
          <small>LinkHub FYP © 2025</small>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('PASSWORD RESET EMAIL SENT:', info.messageId);
    return true;
  } catch (error) {
    console.error('PASSWORD RESET EMAIL ERROR:', error.message);
    return false;
  }
};

module.exports = { sendEmailOTP, sendPasswordResetEmail };