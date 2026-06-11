const axios = require('axios');

async function getListings() {
  try {
    const url = process.env.LISTINGS_SHEET_URL;
    if (!url) {
      console.log('No listings URL set — using fallback data');
      return getFallbackListings();
    }
    const response = await axios.get(url);
    return response.data;
  } catch (err) {
    console.error('Listings fetch error:', err.message);
    return getFallbackListings();
  }
}

function getFallbackListings() {
  return [
    {
      id: '001',
      address: '28 Bristol Road, Burlington MA',
      price: '$2,850,000',
      beds: 5,
      baths: 4,
      sqft: 4200,
      status: 'Active',
      description: 'Luxury new construction by Originate Technology with digital twin visualization. Open floor plan, chef kitchen, primary suite with spa bath.',
    },
  ];
}

module.exports = { getListings };