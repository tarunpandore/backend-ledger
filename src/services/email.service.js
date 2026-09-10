require('dotenv').config();

const nodemailer = require('nodemailer');

/**
 * ============================================================================
 * EMAIL SERVICE
 * ============================================================================
 *
 * Provides transactional email delivery using Nodemailer with Google OAuth2 authentication.
 * OAuth2 provides superior security compared to basic username/password authentication.
 */
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

// Verify connection configuration with SMTP server on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('Email server connection status:', error.message);
  } else {
    console.log('Email server is ready to send messages');
  }
});

/**
 * Internal helper to send emails
 */
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"Backend Ledger" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('Email sent successfully. Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
};

/**
 * Send welcome email upon successful user registration
 */
async function sendRegistrationEmail(userEmail, name) {
  const subject = 'Welcome to Backend Ledger!';

  const text = `
Hello ${name},

Welcome to Backend Ledger!

Thank you for registering with us. Your account has been successfully created.

We are happy to have you with us.

Regards,
Backend Ledger Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2>Welcome to Backend Ledger, ${name}!</h2>

      <p>Thank you for registering with us.</p>

      <p>
        Your account has been successfully created, and we're happy
        to have you with us.
      </p>

      <p>
        Regards,<br>
        <strong>Backend Ledger Team</strong>
      </p>
    </div>
  `;

  await sendEmail(userEmail, subject, text, html);
}

/**
 * Send notification email when a transaction successfully completes
 */
async function sendTransactionEmail(userEmail, name, amount, toAccount) {
  const subject = 'Transaction Successful - Backend Ledger';

  const text = `
Hello ${name},

Your transaction has been successfully processed.

Transaction Details:
Amount: ₹${amount}
Recipient Account: ${toAccount}

If you did not authorize this transaction, please contact our support team immediately.

Regards,
Backend Ledger Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2>Transaction Successful</h2>

      <p>Hello ${name},</p>

      <p>
        Your transaction has been successfully processed.
      </p>

      <div style="
        background-color: #f5f5f5;
        padding: 15px;
        border-radius: 8px;
        margin: 20px 0;
      ">
        <h3>Transaction Details</h3>

        <p>
          <strong>Amount:</strong> ₹${amount}
        </p>

        <p>
          <strong>Recipient Account:</strong> ${toAccount}
        </p>
      </div>

      <p>
        If you did not authorize this transaction, please contact
        our support team immediately.
      </p>

      <p>
        Regards,<br>
        <strong>Backend Ledger Team</strong>
      </p>
    </div>
  `;

  await sendEmail(userEmail, subject, text, html);
}

/**
 * Send notification email when a transaction fails
 */
async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
  const subject = 'Transaction Failed - Backend Ledger';

  const text = `
Hello ${name},

Unfortunately, your transaction could not be completed.

Transaction Details:
Amount: ₹${amount}
Recipient Account: ${toAccount}
Status: Failed

No successful transaction was completed through Backend Ledger. Please verify your account details and available balance before trying again.

If you believe this is an error, please contact our support team.

Regards,
Backend Ledger Team
  `.trim();

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #d32f2f;">Transaction Failed</h2>

      <p>Hello ${name},</p>

      <p>
        Unfortunately, your transaction could not be completed.
      </p>

      <div style="
        background-color: #fff3f3;
        border: 1px solid #ffcdd2;
        padding: 15px;
        border-radius: 8px;
        margin: 20px 0;
      ">
        <h3>Transaction Details</h3>

        <p>
          <strong>Amount:</strong> ₹${amount}
        </p>

        <p>
          <strong>Recipient Account:</strong> ${toAccount}
        </p>

        <p>
          <strong>Status:</strong> <span style="color: #d32f2f; font-weight: bold;">Failed</span>
        </p>
      </div>

      <p>
        No successful transaction was completed through Backend Ledger.
      </p>

      <p>
        Please verify your account details and available balance before trying again.
      </p>

      <p>
        If you believe this is an error, please contact our support team.
      </p>

      <p>
        Regards,<br>
        <strong>Backend Ledger Team</strong>
      </p>
    </div>
  `;

  await sendEmail(userEmail, subject, text, html);
}

module.exports = {
  sendRegistrationEmail,
  sendTransactionEmail,
  sendTransactionFailureEmail
};