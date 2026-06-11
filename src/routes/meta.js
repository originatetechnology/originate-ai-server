const express = require('express');
const router = express.Router();
const { getAIReply } = require('../services/claude');
const { sendReply } = require('../services/reply');
const { saveDraft, getDraft, clearDraft } = require('../utils/pendingDrafts');

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
    // WhatsApp
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const msg = change.value?.messages?.[0];
          if (msg?.type === 'text') {
            const senderId = msg.from;
            const text = msg.text.body;
            const agentNumber = process.env.AGENT_WHATSAPP_NUMBER;

            // Message is from the agent — handle as approval/edit
            if (agentNumber && senderId === agentNumber) {
              await handleAgentApproval('whatsapp', text);
              return;
            }

            // Message is from a lead
            console.log(`[whatsapp] Lead ${senderId}: ${text}`);
            const draft = await getAIReply(senderId, text, 'whatsapp');
            saveDraft(senderId, draft, 'whatsapp');
            await notifyAgent('whatsapp', senderId, text, draft);
          }
        }
      }
    }

    // Instagram or Messenger
    if (body.object === 'page' || body.object === 'instagram') {
      for (const entry of body.entry || []) {
        const messaging = entry.messaging?.[0];
        if (messaging?.message?.text && !messaging.message.is_echo) {
          const senderId = messaging.sender.id;
          const text = messaging.message.text;
          const channel = body.object;
          const agentId = process.env.AGENT_META_ID;

          // Message is from the agent — handle as approval/edit
          if (agentId && senderId === agentId) {
            await handleAgentApproval(channel, text);
            return;
          }

          // Message is from a lead
          console.log(`[${channel}] Lead ${senderId}: ${text}`);
          const draft = await getAIReply(senderId, text, channel);
          saveDraft(senderId, draft, channel);
          await notifyAgent(channel, senderId, text, draft);
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

// Send draft + approval prompt to the agent
async function notifyAgent(channel, leadId, leadMessage, draft) {
  const agentId = channel === 'whatsapp'
    ? process.env.AGENT_WHATSAPP_NUMBER
    : process.env.AGENT_META_ID;

  if (!agentId) {
    console.warn(`[approval] No agent ID set for channel ${channel} — auto-sending draft`);
    await sendReply(channel, leadId, draft);
    return;
  }

  const notification =
    `📩 New lead message\n` +
    `Lead ID: ${leadId}\n\n` +
    `*Lead said:*\n${leadMessage}\n\n` +
    `*Draft reply:*\n${draft}\n\n` +
    `Reply APPROVE to send, or type your own message to send instead.\n` +
    `(Reference lead: ${leadId})`;

  await sendReply(channel, agentId, notification);
  console.log(`[approval] Draft sent to agent for lead ${leadId}`);
}

// Parse agent reply and dispatch to the lead
async function handleAgentApproval(channel, agentReply) {
  const text = agentReply.trim();

  // Extract lead ID from "Reference lead: <id>" if agent forwarded notification
  // Alternatively use a simple APPROVE command with the last pending draft
  if (text.toUpperCase() === 'APPROVE') {
    // Approve the most recently created pending draft for this channel
    const { getAllPending } = require('../utils/pendingDrafts');
    const pending = getAllPending()
      .filter(d => d.channel === channel)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!pending.length) {
      console.warn('[approval] APPROVE received but no pending draft found');
      return;
    }

    const { leadId, draft } = pending[0];
    await sendReply(channel, leadId, draft);
    clearDraft(leadId);
    console.log(`[approval] Draft approved and sent to lead ${leadId}`);
    return;
  }

  // Format: APPROVE <leadId>  — approves specific lead's draft
  const approveMatch = text.match(/^APPROVE\s+(\S+)/i);
  if (approveMatch) {
    const leadId = approveMatch[1];
    const record = getDraft(leadId);
    if (!record) {
      console.warn(`[approval] No pending draft for lead ${leadId}`);
      return;
    }
    await sendReply(channel, leadId, record.draft);
    clearDraft(leadId);
    console.log(`[approval] Draft approved for lead ${leadId}`);
    return;
  }

  // Format: SEND <leadId> <message>  — send custom text to specific lead
  const sendMatch = text.match(/^SEND\s+(\S+)\s+([\s\S]+)/i);
  if (sendMatch) {
    const leadId = sendMatch[1];
    const customMessage = sendMatch[2].trim();
    await sendReply(channel, leadId, customMessage);
    clearDraft(leadId);
    console.log(`[approval] Custom reply sent to lead ${leadId}`);
    return;
  }

  console.log(`[approval] Agent message not recognized as approval command: "${text}"`);
}

module.exports = router;
