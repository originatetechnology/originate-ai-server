// In-memory conversation history per user
// Stores last 10 messages per contact to keep context without token bloat
const histories = {};

function getHistory(userId) {
  if (!histories[userId]) {
    histories[userId] = [];
  }
  return histories[userId];
}

function saveHistory(userId, messages) {
  // Keep only last 10 messages to control token usage
  histories[userId] = messages.slice(-10);
}

function clearHistory(userId) {
  delete histories[userId];
}

module.exports = { getHistory, saveHistory, clearHistory };