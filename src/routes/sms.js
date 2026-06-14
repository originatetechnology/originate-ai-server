const express = require('express');
const router = express.Router();
const { getAIReply } = require('../services/claude');
const { sendReply } = require('../services/reply');
const { saveDraft, getDraft, clearDraft, getAllPending } = require('../utils/pendingDrafts');

router.post('/', async (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>'); // always respond immediately to Twilio

  try {
    const senderId = req.body.From;
    const text = req.body.Body?.trim();
    if (!senderId || !text) return;

    const agentNumber = process.env.AGENT_SMS_NUMBER;

    // Message is from the agent — handle as approval
    if (agentNumber && senderId === agentNumber) {
      await handleAgentApproval(text);
      return;
    }

    // Message is from a lead
    console.log(`[sms] Lead ${senderId}: ${text}`);
    const draft = await getAIReply(senderId, text, 'sms');
    saveDraft(senderId, draft, 'sms');
    await notifyAgent(senderId, text, draft);

  } catch (err) {
    console.error('SMS error:', err.message);
  }
});

async function notifyAgent(leadId, leadMessage, draft) {
  const agentNumber = process.env.AGENT_SMS_NUMBER;

  if (!agentNumber) {
    console.warn('[sms] No AGENT_SMS_NUMBER set — auto-sending draft');
    await sendReply('sms', leadId, draft);
    return;
  }

  const notification =
    `📩 New lead via SMS\n` +
    `Lead: ${leadId}\n\n` +
    `They said:\n${leadMessage}\n\n` +
    `Draft reply:\n${draft}\n\n` +
    `Reply:\n` +
    `APPROVE — send draft\n` +
    `APPROVE ${leadId} — send draft to this lead\n` +
    `SEND ${leadId} your message — send custom reply`;

  await sendReply('sms', agentNumber, notification);
  console.log(`[sms] Draft sent to agent for lead ${leadId}`);
}

async function handleAgentApproval(text) {
  // APPROVE — approve most recent pending SMS draft
  if (text.toUpperCase() === 'APPROVE') {
    const pending = getAllPending()
      .filter(d => d.channel === 'sms')
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!pending.length) {
      console.warn('[sms] APPROVE received but no pending draft');
      return;
    }
    const { leadId, draft } = pending[0];
    await sendReply('sms', leadId, draft);
    clearDraft(leadId);
    console.log(`[sms] Draft approved and sent to lead ${leadId}`);
    return;
  }

  // APPROVE +16175550001
  const approveMatch = text.match(/^APPROVE\s+(\+?\d+)/i);
  if (approveMatch) {
    const leadId = approveMatch[1];
    const record = getDraft(leadId);
    if (!record) { console.warn(`[sms] No pending draft for ${leadId}`); return; }
    await sendReply('sms', leadId, record.draft);
    clearDraft(leadId);
    console.log(`[sms] Approved draft sent to ${leadId}`);
    return;
  }

  // SEND +16175550001 Hey, let's book a call!
  const sendMatch = text.match(/^SEND\s+(\+?\d+)\s+([\s\S]+)/i);
  if (sendMatch) {
    const leadId = sendMatch[1];
    const customMessage = sendMatch[2].trim();
    await sendReply('sms', leadId, customMessage);
    clearDraft(leadId);
    console.log(`[sms] Custom reply sent to ${leadId}`);
    return;
  }

  console.log(`[sms] Agent message not recognized as command: "${text}"`);
}

module.exports = router;
