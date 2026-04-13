const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ─── Email Transport ──────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const emailTemplates = {
  otpVerification: (otp) => ({
    subject: `${otp} — Your NextCharge OTP`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#060A0F">Your OTP is <span style="color:#00E676">${otp}</span></h2>
        <p>This code expires in ${process.env.OTP_EXPIRES_IN || 10} minutes.</p>
        <p style="color:#888;font-size:12px">If you didn't request this, please ignore this email.</p>
      </div>`
  }),
  bookingConfirmed: (booking) => ({
    subject: `Booking Confirmed — ${booking.bookingRef}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#060A0F">Your slot is confirmed ⚡</h2>
        <p><strong>Booking ID:</strong> ${booking.bookingRef}</p>
        <p><strong>Station:</strong> ${booking.station?.name}</p>
        <p><strong>Time:</strong> ${new Date(booking.scheduledStart).toLocaleString('en-IN')}</p>
        <p><strong>Connector:</strong> ${booking.connectorId} — ${booking.vehicle?.connectorType}</p>
        <div style="margin-top:24px;padding:16px;background:#f5f5f5;border-radius:8px">
          <p style="margin:0;font-size:13px;color:#666">Show your QR code at the station to start charging.</p>
        </div>
      </div>`
  }),
  bookingCancelled: (booking) => ({
    subject: `Booking Cancelled — ${booking.bookingRef}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2>Booking Cancelled</h2>
        <p>Your booking <strong>${booking.bookingRef}</strong> has been cancelled.</p>
        ${booking.cancellation?.refundAmount ? `<p>Refund of ₹${booking.cancellation.refundAmount} will be credited within 5–7 business days.</p>` : ''}
      </div>`
  }),
  passwordReset: (link) => ({
    subject: 'Reset Your NextCharge Password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2>Reset Your Password</h2>
        <p>Click the link below to reset your password. This link expires in 15 minutes.</p>
        <a href="${link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#00E676;color:#060A0F;text-decoration:none;border-radius:24px;font-weight:700">Reset Password</a>
      </div>`
  })
};

const sendEmail = async (to, templateName, templateData) => {
  try {
    const template = emailTemplates[templateName](templateData);
    await transporter.sendMail({
      from: `"NextCharge" <${process.env.SMTP_USER}>`,
      to,
      subject: template.subject,
      html: template.html
    });
    logger.info(`Email sent: ${templateName} → ${to}`);
  } catch (err) {
    logger.error(`Email failed: ${templateName} → ${to}:`, err.message);
    // Don't throw — notifications are non-critical
  }
};

// ─── SMS via Twilio ───────────────────────────────────────────────────────────
let twilioClient;
try {
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
} catch (_) {
  logger.warn('Twilio not configured — SMS disabled');
}

const sendSMS = async (to, message) => {
  if (!twilioClient) return;
  try {
    // Indian numbers need +91 prefix
    const formattedTo = to.startsWith('+') ? to : `+91${to}`;
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedTo
    });
    logger.info(`SMS sent to ${to}`);
  } catch (err) {
    logger.error(`SMS failed to ${to}:`, err.message);
  }
};

const sendOTPSMS = async (phone, otp) => {
  const message = `${otp} is your NextCharge OTP. Valid for ${process.env.OTP_EXPIRES_IN || 10} minutes. Do not share this with anyone. -NextCharge`;
  await sendSMS(phone, message);
};

const sendBookingConfirmationSMS = async (phone, booking) => {
  const message = `NextCharge: Booking ${booking.bookingRef} confirmed for ${new Date(booking.scheduledStart).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}. Show QR at station.`;
  await sendSMS(phone, message);
};

module.exports = { sendEmail, sendSMS, sendOTPSMS, sendBookingConfirmationSMS };
