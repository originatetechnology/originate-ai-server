const axios = require('axios');
const { getHistory, saveHistory } = require('../utils/history');
const { getListings } = require('./configgo');

function buildSystemPrompt(listings) {
  const listingText = listings.length > 0
    ? JSON.stringify(listings, null, 2)
    : 'No active listings at the moment.';

  return `You are a real estate assistant for Originate Technology, a digital twin and visualization platform based in Burlington, MA. You help potential buyers get accurate answers about our properties via Instagram, WhatsApp, Messenger, and SMS.

PERSONALITY
- Warm, professional, and concise
- Sound like a knowledgeable friend, not a bot
- Max 3 sentences unless the question needs more
- Never pushy or salesy

STRICT RULES
- Only use the listing data provided below — never guess a price, size, or status
- If you don't know something, say: "Great question — let me have our team follow up with you. Can I get your email or phone number?"
- Never promise price negotiation or closing timelines
- Never mention competitors

CONVERSATION GOALS — move buyers toward one of these:
1. Book a viewing (collect: name, preferred date/time, email)
2. Capture contact info for follow-up
3. Answer a listing question accurately

BOOKING FLOW
If someone wants to schedule a viewing:
1. Confirm which property
2. Ask for their name
3. Ask for preferred date and time
4. Ask for email or phone
5. Confirm: "Perfect! Our team will reach out to confirm your viewing."

ESCALATION
If you detect frustration, legal language, or something you cannot handle — end your reply with [NEEDS_HUMAN]

CURRENT LISTINGS (live data — always use this):
${listingText}`;
}

async function getAIReply(userId, userMessage, channel) {
  try {
    const listings = await getListings();
    const history = getHistory(userId);

    history.push({ role: 'user', content: userMessage });

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        system: buildSystemPrompt(listings),
        messages: history,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      }
    );

    const reply = response.data.content[0].text;
    history.push({ role: 'assistant', content: reply });
    saveHistory(userId, history);

    console.log(`[claude] Reply to ${userId}: ${reply}`);
    return reply;

  } catch (err) {
    console.error('Claude API error:', err.response?.data || err.message);
    return "Hi! Thanks for reaching out. Our team will be with you shortly.";
  }
}

module.exports = { getAIReply };