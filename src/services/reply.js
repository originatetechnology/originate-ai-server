const axios = require('axios');

async function sendReply(channel, recipientId, message) {
  try {
    if (channel === 'page' || channel === 'instagram') {
      await axios.post(
        `https://graph.facebook.com/v19.0/me/messages`,
        {
          recipient: { id: recipientId },
          message: { text: message },
        },
        {
          params: { access_token: process.env.FB_PAGE_TOKEN },
        }
      );
      console.log(`[reply] Sent to ${channel} user ${recipientId}`);
    }

    if (channel === 'whatsapp') {
      await axios.post(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: recipientId,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`[reply] Sent to WhatsApp user ${recipientId}`);
    }

    if (channel === 'sms') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        new URLSearchParams({
          From: process.env.TWILIO_PHONE_NUMBER,
          To: recipientId,
          Body: message,
        }),
        {
          auth: { username: accountSid, password: authToken },
        }
      );
      console.log(`[reply] Sent SMS to ${recipientId}`);
    }
  } catch (err) {
    console.error(`[reply] Error sending to ${channel}:`, err.response?.data || err.message);
  }
}

module.exports = { sendReply };