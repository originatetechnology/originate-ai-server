const express = require('express');
const router = express.Router();
const { getAIReply } = require('../services/claude');
const { sendReply } = require('../services/reply');

router.post('/', async (req, res) => {
  try {
    const senderId = req.body.From;
    const text = req.body.Body;
    console.log(`[sms] From ${senderId}: ${text}`);
    const reply = await getAIReply(senderId, text, 'sms');
    await sendReply('sms', senderId, reply);
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  } catch (err) {
    console.error('SMS error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;