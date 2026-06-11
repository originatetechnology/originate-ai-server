const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getListings() {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('status', 'Active');

    if (error || !data?.length) {
      console.log('Supabase listings fetch failed — using fallback');
      return getFallbackListings();
    }
    return data;
  } catch (err) {
    console.error('Listings error:', err.message);
    return getFallbackListings();
  }
}

async function saveMessage(contactId, conversationId, role, content, channel) {
  try {
    await supabase.from('messages').insert({
      contact_id: contactId,
      conversation_id: conversationId,
      role,
      content,
      channel,
    });
  } catch (err) {
    console.error('Save message error:', err.message);
  }
}

async function upsertContact(externalId, channel) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .upsert({ external_id: externalId, channel }, { onConflict: 'external_id,channel' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Upsert contact error:', err.message);
    return null;
  }
}

function getFallbackListings() {
  return [
    {
      listing_id: '001',
      address: '28 Bristol Road, Burlington MA',
      price: '$2,850,000',
      beds: 5,
      baths: 4,
      sqft: 4200,
      status: 'Active',
      description: 'Luxury new construction by Originate Technology with digital twin visualization.',
    },
  ];
}

module.exports = { getListings, saveMessage, upsertContact };