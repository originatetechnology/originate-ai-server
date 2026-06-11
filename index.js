require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

// Meta webhook (Instagram + Messenger + WhatsApp)
app.use('/webhook', require('./src/routes/meta'));

// Twilio SMS webhook
app.use('/webhook/sms', require('./src/routes/sms'));

// Health check — confirms server is running
app.get('/', (req, res) => {
  res.json({ status: 'Originate AI server running', version: '1.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Originate AI server running on port ${PORT}`);
});