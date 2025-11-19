const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware untuk menyimpan raw body
app.use(express.json({ verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}}));

// 🔑 Konfigurasi environment
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID;
const MESSAGING_TOPIC = process.env.MESSAGING_TOPIC || 'MedusaIDRBroadcast';

if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
    console.error('❌ Environment variables ROBLOX_API_KEY dan UNIVERSE_ID wajib diatur!');
    process.exit(1);
}

const PUBLISH_API_URL = `https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/${encodeURIComponent(MESSAGING_TOPIC)}`;

console.log('🚀 Webhook Server Configuration:');
console.log('- Universe ID:', UNIVERSE_ID);
console.log('- Messaging Topic:', MESSAGING_TOPIC);
console.log('- API URL:', PUBLISH_API_URL);

// ✅ Helper function untuk extract username
function extractUsername(message, donatorName) {
    // Format: [Username] message
    const usernameMatch = message.match(/^\[(\w+)\]/);
    if (usernameMatch) {
        return usernameMatch[1];
    }
    return donatorName;
}

// ✅ Helper function untuk kirim ke Roblox
async function sendToRoblox(donationData) {
    const robloxRequest = {
        message: JSON.stringify(donationData)
    };

    console.log('📤 Mengirim ke Roblox MessagingService:', JSON.stringify(robloxRequest, null, 2));

    try {
        const response = await axios.post(PUBLISH_API_URL, robloxRequest, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ROBLOX_API_KEY
            }
        });

        console.log('✅ Sukses kirim ke Roblox! Status:', response.status);
        return { success: true, status: response.status, data: response.data };
    } catch (error) {
        console.error('❌ Gagal kirim ke Roblox MessagingService');
        
        if (error.response) {
            console.error('HTTP Status:', error.response.status);
            console.error('Response body:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error:', error.message);
        }
        
        throw error;
    }
}

// 📥 Endpoint: Saweria Webhook
app.post('/saweria-webhook', async (req, res) => {
    console.log('=== 📩 Webhook Saweria diterima ===');
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    const payload = req.body;

    if (!payload) {
        console.error('❌ Payload tidak ditemukan');
        return res.status(400).send('Bad Request: Payload tidak ditemukan');
    }

    // Hanya proses event donasi
    if (payload.type !== 'donation') {
        console.log('ℹ️ Diabaikan: bukan event donasi (type:', payload.type, ')');
        return res.status(200).send('OK - Ignored non-donation event');
    }

    const donatorName = payload.donator_name || 'Anonymous';
    const amountRaw = payload.amount_raw || 0;
    const message = payload.message || '';
    const donatorEmail = payload.donator_email || '';

    console.log(`💰 Donasi Saweria: ${donatorName} - Rp ${amountRaw.toLocaleString('id-ID')}`);
    if (message) console.log(`📝 Pesan: "${message}"`);

    const robloxUsername = extractUsername(message, donatorName);
    console.log(`✅ Username Roblox: ${robloxUsername}`);

    const donationData = {
        username: robloxUsername,
        displayName: donatorName,
        amount: Math.floor(amountRaw),
        timestamp: Math.floor(Date.now() / 1000),
        source: 'Saweria',
        message: message,
        email: donatorEmail
    };

    try {
        await sendToRoblox(donationData);
        return res.status(200).send('OK - Saweria donation processed');
    } catch (error) {
        return res.status(500).send('Internal Server Error: Failed to forward to Roblox');
    }
});

// 📥 Endpoint: SocialBuzz Webhook
app.post('/socialbuzz-webhook', async (req, res) => {
    console.log('=== 📩 Webhook SocialBuzz diterima ===');
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    const payload = req.body;

    if (!payload) {
        console.error('❌ Payload tidak ditemukan');
        return res.status(400).send('Bad Request: Payload tidak ditemukan');
    }

    // SocialBuzz biasanya mengirim data dengan format berbeda
    // Sesuaikan dengan format actual dari SocialBuzz
    const donatorName = payload.supporter_name || payload.name || 'Anonymous';
    const amountRaw = payload.amount || payload.donation_amount || 0;
    const message = payload.message || payload.supporter_message || '';
    const donatorEmail = payload.supporter_email || payload.email || '';

    console.log(`💰 Donasi SocialBuzz: ${donatorName} - Rp ${amountRaw.toLocaleString('id-ID')}`);
    if (message) console.log(`📝 Pesan: "${message}"`);

    const robloxUsername = extractUsername(message, donatorName);
    console.log(`✅ Username Roblox: ${robloxUsername}`);

    const donationData = {
        username: robloxUsername,
        displayName: donatorName,
        amount: Math.floor(amountRaw),
        timestamp: Math.floor(Date.now() / 1000),
        source: 'SocialBuzz',
        message: message,
        email: donatorEmail
    };

    try {
        await sendToRoblox(donationData);
        return res.status(200).send('OK - SocialBuzz donation processed');
    } catch (error) {
        return res.status(500).send('Internal Server Error: Failed to forward to Roblox');
    }
});

// 🏥 Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Multi-Platform → Roblox Webhook',
        platforms: ['Saweria', 'SocialBuzz'],
        universeId: UNIVERSE_ID,
        messagingTopic: MESSAGING_TOPIC,
        endpoints: {
            saweria: '/saweria-webhook',
            socialbuzz: '/socialbuzz-webhook',
            test: '/test'
        }
    });
});

// 🧪 Endpoint test manual
app.post('/test', async (req, res) => {
    console.log('🧪 Test endpoint dipanggil');
    
    const source = req.body.source || 'Test';
    const testPayload = {
        username: req.body.username || 'TestUser',
        displayName: req.body.displayName || 'Test Donator',
        amount: parseInt(req.body.amount) || 10000,
        timestamp: Math.floor(Date.now() / 1000),
        source: source,
        message: req.body.message || 'Test message'
    };

    console.log('📤 Mengirim payload test ke Roblox:', testPayload);

    try {
        const result = await sendToRoblox(testPayload);
        res.json({
            success: true,
            status: result.status,
            sentPayload: testPayload,
            robloxResponse: result.data
        });
    } catch (error) {
        console.error('❌ Test gagal:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message,
            sentPayload: testPayload
        });
    }
});

// 🔍 Debug info
app.get('/debug', (req, res) => {
    res.json({
        universeId: UNIVERSE_ID,
        messagingTopic: MESSAGING_TOPIC,
        apiUrl: PUBLISH_API_URL,
        hasApiKey: !!ROBLOX_API_KEY,
        apiKeyPrefix: ROBLOX_API_KEY ? ROBLOX_API_KEY.substring(0, 8) + '...' : '❌ NOT SET',
        supportedPlatforms: ['Saweria', 'SocialBuzz']
    });
});

// ▶️ Jalankan server
app.listen(port, () => {
    console.log(`✅ Server berjalan di port ${port}`);
    console.log(`📡 Saweria:     http://localhost:${port}/saweria-webhook`);
    console.log(`📡 SocialBuzz:  http://localhost:${port}/socialbuzz-webhook`);
    console.log(`🧪 Test:        http://localhost:${port}/test`);
    console.log(`🔍 Debug:       http://localhost:${port}/debug`);
});
