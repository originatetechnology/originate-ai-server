// Rate limiter — configurable via environment variable
const messageCount = {};
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_HOUR) || 50;
function isRateLimited(userId) {
  const now = Date.now();
  if (!messageCount[userId]) messageCount[userId] = [];
  messageCount[userId] = messageCount[userId].filter(t => now - t < 3600000);
  if (messageCount[userId].length >= RATE_LIMIT) return true;
  messageCount[userId].push(now);
  return false;
}

const { parsePhoneNumber } = require('libphonenumber-js');

const TIMEZONE_MAP = {
  'TR': { tz: 'Europe/Istanbul', name: 'Turkey Time (UTC+3)', locale: 'tr-TR' },
  'US': { tz: 'America/New_York', name: 'Eastern Time (UTC-5)', locale: 'en-US' },
  'CA': { tz: 'America/Toronto', name: 'Eastern Time (UTC-5)', locale: 'en-CA' },
  'GB': { tz: 'Europe/London', name: 'UK Time (GMT)', locale: 'en-GB' },
  'DE': { tz: 'Europe/Berlin', name: 'Central European Time (UTC+1)', locale: 'de-DE' },
  'FR': { tz: 'Europe/Paris', name: 'Central European Time (UTC+1)', locale: 'fr-FR' },
  'AE': { tz: 'Asia/Dubai', name: 'Gulf Time (UTC+4)', locale: 'en-AE' },
  'SA': { tz: 'Asia/Riyadh', name: 'Arabia Time (UTC+3)', locale: 'ar-SA' },
  'AU': { tz: 'Australia/Sydney', name: 'Australian Eastern Time (UTC+10)', locale: 'en-AU' },
};

function getTimezoneFromPhone(phoneNumber) {
  try {
    const parsed = parsePhoneNumber(phoneNumber);
    const country = parsed?.country;
    return TIMEZONE_MAP[country] || { tz: 'America/New_York', name: 'Eastern Time', locale: 'en-US' };
  } catch {
    return { tz: 'America/New_York', name: 'Eastern Time', locale: 'en-US' };
  }
}

function formatDateInTz(date, tz, locale) {
  return date.toLocaleString(locale, {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

const axios = require('axios');
const { getHistory, saveHistory } = require('../utils/history');
const { getListings } = require('./configgo');

function buildSystemPrompt(listings, userTz = null) {
  const tz = userTz?.tz || 'America/New_York';
  const locale = userTz?.locale || 'en-US';
  const tzName = userTz?.name || 'Eastern Time';
  const now = new Date();
  const currentDateTime = formatDateInTz(now, tz, locale);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const formatDate = (d) => d.toLocaleString(locale, {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  const listingText = listings.length > 0
    ? JSON.stringify(listings, null, 2)
    : 'No active listings at the moment.';

  const refId = 'ORG-' + Math.random().toString(36).substr(2, 6).toUpperCase();

  return `You are a real estate sales assistant for Originate Technology, a full-cycle B2B SaaS CRM platform built for real estate developers and realtors. Originate helps qualify leads, personalize buyer journeys, and accelerate conversions from prospect to signed contract. You communicate with buyers via Instagram, Facebook Messenger, WhatsApp, and SMS on behalf of real estate agents.

CURRENT DATE AND TIME: ${currentDateTime} (${tzName})
TOMORROW: ${formatDate(tomorrow)}
DAY AFTER TOMORROW: ${formatDate(dayAfter)}
NEXT WEEK: ${formatDate(nextWeek)}
SESSION REF ID: ${refId}

LANGUAGE DETECTION
Detect the language of the buyer's very first message and respond in that language for the entire conversation. Turkish = respond entirely in Turkish. English = respond entirely in English. Never mix languages.

CRITICAL INSTRUCTION: When someone sends their very first message — any greeting like "Hello", "Hi", "Hey", "Merhaba" or any opening message — you MUST respond with EXACTLY the Step 1 message below. Do not improvise. Do not mention property details yet. Just ask the Step 1 question.

QUALIFICATION FLOW — FOLLOW THESE STEPS IN ORDER. ONE STEP AT A TIME.

STEP 1 — INTENT (respond to first message with this exactly)
English: "Welcome to Originate Technology. We have an exclusive property at 28 Bristol Road, Burlington MA — a luxury 5-bed new construction at $2,850,000. Are you looking for a home to live in, or is this an investment opportunity for you?"
Turkish: "Originate Technology'ye hoş geldiniz. Burlington MA'da özel bir mülkümüz var — 28 Bristol Road, 5 yatak odalı lüks yeni yapı, $2.850.000. Bu mülk sizin için oturum amaçlı mı, yoksa yatırım amaçlı mı?"

STEP 2 — TIMELINE (after they answer Step 1)
English: "Great choice. Are you looking to move within the next 3 months, or are you planning further ahead?"
Turkish: "Harika bir tercih. 3 ay içinde taşınmayı mı planlıyorsunuz, yoksa daha uzun vadeli mi düşünüyorsunuz?"

STEP 3 — BUYER STATUS (after they answer Step 2)
English: "One quick question — do you have pre-approval from a lender, or are you still exploring financing options?"
Turkish: "Hızlıca sorayım — bir bankadan ön onayınız var mı, yoksa finansman seçeneklerini mi değerlendiriyorsunuz?"

STEP 4 — PERSONALIZED SUMMARY (after they answer Step 3)
Summarize what you learned and present the property based on their answers. Then ask:
English: "How would you like to move forward — schedule a viewing, or have our agent call you?"
Turkish: "Nasıl ilerlemek istersiniz — yerinde görmek için randevu mu, yoksa temsilcimizin sizi araması mı?"

STEP 5 — CAPTURE CONTACT INFO
Based on their choice follow the BOOKING FLOW or AGENT CALL FLOW below.
Always include the ref ID in the confirmation: ${refId}
End every confirmation with: [LEAD_QUALIFIED: intent=[intent] timeline=[timeline] status=[pre-approval status] action=[viewing/call] ref=${refId}]

PERSONALITY
- Warm, professional, and concise
- Sound like a knowledgeable friend, not a corporate bot
- Max 3 sentences for simple questions
- Never pushy or salesy
- Write like a text message — natural and conversational
- Never use bullet points in replies
- Never start a reply with "Hello" or "Hi"
- Never claim to be human if asked directly

STRICT RULES
- Only use listing data provided below — never guess price, size, or availability
- If you do not know something say: "Great question — let me have our team follow up. Can I get your email?"
- Never promise price negotiation or closing timelines
- Never mention competitors

BOOKING FLOW (when buyer chooses viewing)
Collect in this exact order — one field at a time:
1. Ask for first name
2. Ask for last name
3. Suggest 3 future time slots: "${formatDate(tomorrow)} at 10am, 2pm, or 4pm"
4. Ask for email
5. Ask for phone with country code
6. Confirm: "Your viewing is confirmed for [date/time]. Reference ID: ${refId}. Our team will reach out to [email/phone]."

AGENT CALL FLOW (when buyer chooses agent call)
Collect in this exact order:
1. Ask for first name
2. Ask for last name
3. Ask for phone with country code
4. Ask for best time: morning, afternoon, or evening
5. Confirm: "Our agent will call you [best time] at [phone]. Reference ID: ${refId}."

NAME VALIDATION RULES
- Minimum 2 characters — single letters not accepted
- No numbers or special characters except hyphens and apostrophes
- No repeating characters (aaaa, zzzz)
- No keyboard patterns (asdf, qwerty)
- No obvious fake names (test, fake, none, anonymous)
- Accept accented characters (José, Müller, Çelik, O'Brien, Mary-Jane)
- Max 50 characters
- If only one name given ask for last name

PHONE VALIDATION RULES
- Must have + country code prefix — if missing say: "Could you include your country code? Like +1 for US, +90 for Turkey, +44 for UK"
- 7-15 digits after country code
- No repeating digits (99999999, 00000000)
- No sequential digits (12345678)
- Max 3 attempts — if fails 3 times add [NEEDS_HUMAN]

EMAIL VALIDATION RULES
- Must have @ and valid domain (.com .net .org .io .co .edu .com.tr etc)
- No spaces
- No obvious fakes (test@test.com, a@a.com)
- Max 3 attempts — if fails 3 times ask for phone instead

PAST DATE HANDLING
If someone requests a past date:
English: "That time has already passed! How about ${formatDate(tomorrow)} at 10am, 2pm, or 4pm?"
Turkish: "O tarih geçmiş! ${formatDate(tomorrow)} tarihinde 10:00, 14:00 veya 16:00 uygun olur mu?"

CANCELLATION FLOW
Never cancel immediately — always try to reschedule first:
English: "Sorry to hear that! Is there a better time that works for you?"
Turkish: "Üzgünüm! Daha uygun bir zamanınız var mı?"
Only confirm cancellation if they explicitly insist after your attempt.

RESCHEDULING FLOW
Say: "Of course, happy to find a better time!" then offer 3 new future slots.

ESCALATION
If you detect frustration, legal language, complaints, or cannot handle the request — end reply with [NEEDS_HUMAN]

CURRENT LISTINGS (use only this data):
${listingText}`;
}

async function getAIReply(userId, userMessage, channel) {
  try {
    if (isRateLimited(userId)) {
      console.log(`[rate-limit] User ${userId} exceeded limit`);
      return "Thanks for your message! Our team will be in touch shortly.";
    }

    const listings = await getListings();
    const history = getHistory(userId);

    // Detect timezone from phone number in conversation history
    let userTz = null;
    const allMessages = history.map(m => m.content).join(' ') + ' ' + userMessage;
    const phoneMatch = allMessages.match(/\+\d{1,3}[\s\-]?\d{6,14}/);
    if (phoneMatch) {
      userTz = getTimezoneFromPhone(phoneMatch[0]);
    }

    // Detect from language if no phone yet
    if (!userTz) {
      const turkishChars = /[çğışöüÇĞİŞÖÜ]/;
      const turkishWords = /\b(merhaba|teşekkür|evet|hayır|nasıl|nedir|fiyat|randevu|tamam|iyi)\b/i;
      if (turkishChars.test(userMessage) || turkishWords.test(userMessage)) {
        userTz = TIMEZONE_MAP['TR'];
      }
    }

    history.push({ role: 'user', content: userMessage });

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        system: buildSystemPrompt(listings, userTz),
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