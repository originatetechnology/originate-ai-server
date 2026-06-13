const express = require('express');
const router = express.Router();
const { getAIReply } = require('../services/claude');
const { sendReply } = require('../services/reply');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Parse [LEAD_QUALIFIED] tag from Claude's reply
function parseLeadTag(reply) {
  const match = reply.match(/\[LEAD_QUALIFIED:\s*intent=([^\s]+)\s+timeline=([^\s]+)\s+status=([^\s]+)\s+action=([^\s]+)\s+ref=([^\]]+)\]/);
  if (!match) return null;
  return {
    intent: match[1],
    timeline: match[2],
    status: match[3],
    action: match[4],
    ref: match[5],
  };
}

// Save message to Supabase
async function saveToSupabase(senderId, channel, userMessage, aiReply, leadData) {
  try {
    // Upsert contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        { external_id: senderId, channel },
        { onConflict: 'external_id,channel' }
      )
      .select()
      .single();

    if (contactError) throw contactError;

    // Upsert conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .upsert(
        {
          contact_id: contact.id,
          channel,
          last_message: aiReply.replace(/\[LEAD_QUALIFIED[^\]]*\]/g, '').trim(),
          last_message_at: new Date().toISOString(),
          status: leadData ? 'qualified' : 'open',
        },
        { onConflict: 'contact_id' }
      )
      .select()
      .single();

    if (convError) throw convError;

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      contact_id: contact.id,
      role: 'user',
      content: userMessage,
      channel,
    });

    // Save AI reply (strip the tag from stored message)
    const cleanReply = aiReply.replace(/\[LEAD_QUALIFIED[^\]]*\]/g, '').trim();
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      contact_id: contact.id,
      role: 'assistant',
      content: cleanReply,
      channel,
    });

    // If lead qualified, save lead data
    if (leadData) {
      await supabase.from('contacts').update({
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);

      console.log(`[supabase] Lead qualified — ref: ${leadData.ref} intent: ${leadData.intent} timeline: ${leadData.timeline}`);
    }

    console.log(`[supabase] Saved message for contact ${senderId}`);
  } catch (err) {
    console.error('[supabase] Save error:', err.message);
  }
}

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
          const leadData = parseLeadTag(reply);
          if (leadData) console.log(`[lead] Qualified — ${JSON.stringify(leadData)}`);
          await sendReply(channel, senderId, reply.replace(/\[LEAD_QUALIFIED[^\]]*\]/g, '').trim());
          await saveToSupabase(senderId, channel, text, reply, leadData);
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
            const leadData = parseLeadTag(reply);
            if (leadData) console.log(`[lead] Qualified — ${JSON.stringify(leadData)}`);
            await sendReply('whatsapp', senderId, reply.replace(/\[LEAD_QUALIFIED[^\]]*\]/g, '').trim());
            await saveToSupabase(senderId, 'whatsapp', text, reply, leadData);
          }
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

module.exports = router;