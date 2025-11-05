const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware untuk menyimpan raw body (opsional, untuk debugging)
app.use(express.json({ verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}}));

// 🔑 Konfigurasi environment
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID; // ❗ BUKAN Place ID!
const MESSAGING_TOPIC = process.env.MESSAGING_TOPIC || 'MedusaIDRBroadcast';

if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
    console.error('❌ Environment variables ROBLOX_API_KEY dan UNIVERSE_ID wajib diatur!');
    process.exit(1);
}

// ✅ URL tanpa spasi berlebih
const PUBLISH_API_URL = `https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/${encodeURIComponent(MESSAGING_TOPIC)}`;

console.log('🚀 Webhook Server Configuration:');
console.log('- Universe ID:', UNIVERSE_ID);
console.log('- Messaging Topic:', MESSAGING_TOPIC);
console.log('- API URL:', PUBLISH_API_URL);

// 📥 Endpoint utama: Saweria Webhook
app.post('/saweria-webhook', async (req, res) => {
    console.log('=== 📩 Webhook diterima dari Saweria ===');
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    const saweriaPayload = req.body;

    if (!saweriaPayload) {
        console.error('❌ Payload tidak ditemukan');
        return res.status(400).send('Bad Request: Payload tidak ditemukan');
    }

    // Hanya proses event donasi
    if (saweriaPayload.type !== 'donation') {
        console.log('ℹ️ Diabaikan: bukan event donasi (type:', saweriaPayload.type, ')');
        return res.status(200).send('OK - Ignored non-donation event');
    }

    // Ambil data donasi
    const donatorName = saweriaPayload.donator_name || 'Anonymous';
    const amountRaw = saweriaPayload.amount_raw || 0;
    const message = saweriaPayload.message || '';
    const donatorEmail = saweriaPayload.donator_email || '';

    console.log(`💰 Donasi: ${donatorName} - Rp ${amountRaw.toLocaleString('id-ID')}`);
    if (message) console.log(`📝 Pesan: "${message}"`);

    // 🔍 Ekstrak username Roblox dari format [Username]
    let robloxUsername = null;
    const usernameMatch = message.match(/^\[(\w+)\]/);
    if (usernameMatch) {
        robloxUsername = usernameMatch[1];
        console.log(`✅ Username Roblox ditemukan: ${robloxUsername}`);
    } else {
        robloxUsername = donatorName;
        console.log(`⚠️ Username tidak ditemukan di pesan; gunakan: ${robloxUsername}`);
    }

    // 🧾 Siapkan payload data
    const donationData = {
        username: robloxUsername,
        displayName: donatorName,
        amount: Math.floor(amountRaw),
        timestamp: Math.floor(Date.now() / 1000),
        source: 'Saweria',
        message: message,
        email: donatorEmail
    };

    // 🔁 KIRIM KE ROBLOX: HARUS DALAM FORMAT { "message": "string" }
    const robloxRequest = {
        message: JSON.stringify(donationData) // ⚠️ Ini HARUS string!
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
        console.log('Response:', response.data);
        return res.status(200).send('OK - Donation processed and forwarded to Roblox');

    } catch (error) {
        console.error('❌ Gagal kirim ke Roblox MessagingService');

        if (error.response) {
            console.error('HTTP Status:', error.response.status);
            console.error('Response body:', JSON.stringify(error.response.data, null, 2));
            console.error('Response headers:', error.response.headers);
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error:', error.message);
        }

        return res.status(500).send('Internal Server Error: Failed to forward to Roblox');
    }
});

// 🏥 Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Saweria → Roblox Webhook',
        universeId: UNIVERSE_ID,
        messagingTopic: MESSAGING_TOPIC
    });
});

// 🧪 Endpoint test manual (untuk debugging)
app.post('/test', async (req, res) => {
    console.log('🧪 Test endpoint dipanggil');
    const testPayload = {
        username: req.body.username || 'TestUser',
        displayName: req.body.displayName || 'Test Donator',
        amount: parseInt(req.body.amount) || 10000,
        timestamp: Math.floor(Date.now() / 1000),
        source: 'Test',
        message: req.body.message || 'Test message'
    };

    const robloxRequest = {
        message: JSON.stringify(testPayload) // ✅ Jadikan string!
    };

    console.log('📤 Mengirim payload test ke Roblox:', robloxRequest);

    try {
        const response = await axios.post(PUBLISH_API_URL, robloxRequest, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ROBLOX_API_KEY
            }
        });

        res.json({
            success: true,
            status: response.status,
            sentPayload: testPayload,
            robloxResponse: response.data
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

// 🔍 Debug info (HAPUS DI PRODUKSI jika tidak diperlukan)
app.get('/debug', (req, res) => {
    res.json({
        universeId: UNIVERSE_ID,
        messagingTopic: MESSAGING_TOPIC,
        apiUrl: PUBLISH_API_URL,
        hasApiKey: !!ROBLOX_API_KEY,
        apiKeyPrefix: ROBLOX_API_KEY ? ROBLOX_API_KEY.substring(0, 8) + '...' : '❌ NOT SET'
    });
});

// ▶️ Jalankan server
app.listen(port, () => {
    console.log(`✅ Server berjalan di port ${port}`);
    console.log(`📡 Webhook: http://localhost:${port}/saweria-webhook`);
    console.log(`🧪 Test:    http://localhost:${port}/test`);
    console.log(`🔍 Debug:   http://localhost:${port}/debug`);
});
