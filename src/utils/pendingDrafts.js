// In-memory store for AI drafts awaiting agent approval
// Key: leadId (WhatsApp phone number or Meta sender ID)
// Value: { draft, channel, leadId, createdAt }

const pending = {};

function saveDraft(leadId, draft, channel) {
  pending[leadId] = { draft, channel, leadId, createdAt: Date.now() };
}

function getDraft(leadId) {
  return pending[leadId] || null;
}

function clearDraft(leadId) {
  delete pending[leadId];
}

// Returns all lead IDs that have a pending draft
function getAllPending() {
  return Object.values(pending);
}

module.exports = { saveDraft, getDraft, clearDraft, getAllPending };
