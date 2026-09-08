require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    type: 'OAuth2',
    user: process.env.EMAIL_USER,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    refreshToken: process.env.REFRESH_TOKEN,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});


const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Your Name" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("Error sending email: ", error);
  }
};

async function sendRegisterationEmail(userEmail, name) {
  const subject = "Welcome to Backend Ledger";
  const text = "Hello User, Thank you for registering at the Backend Ledger";
  const html = "<p>Hello User</p><p>Thank you for registering to the Backend Ledger</p>";

  await sendEmail(userEmail, subject, text, html);
}



module.exports = {
  sendRegisterationEmail
}