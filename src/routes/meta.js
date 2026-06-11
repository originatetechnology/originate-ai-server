const express = require('express');
const router = express.Router();
const { getAIReply } = require('../services/claude');
const { sendReply } = require('../services/reply');

// Meta webhook verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✓ Meta webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('✗ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Receive messages from Instagram, Messenger, WhatsApp
router.post('/', async (req, res) => {
  res.sendStatus(200); // always respond immediately to Meta

  const body = req.body;

  try {
    // Instagram or Messenger
    if (body.object === 'page' || body.object === 'instagram') {
      for (const entry of body.entry || []) {
        const messaging = entry.messaging?.[0];
        if (messaging?.message?.text && !messaging.message.is_echo) {
          const senderId = messaging.sender.id;
          const text = messaging.message.text;
          const channel = body.object;
          console.log(`[${channel}] From ${senderId}: ${text}`);
          const reply = await getAIReply(senderId, text, channel);
          await sendReply(channel, senderId, reply);
        }
      }
    }

    // WhatsApp
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const msg = change.value?.messages?.[0];
          if (msg?.type === 'text') {
            const senderId = msg.from;
            const text = msg.text.body;
            console.log(`[whatsapp] From ${senderId}: ${text}`);
            const reply = await getAIReply(senderId, text, 'whatsapp');
            await sendReply('whatsapp', senderId, reply);
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

module.exports = router;