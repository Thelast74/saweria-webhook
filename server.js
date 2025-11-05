const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}}));

// ✅ FIX 1: Gunakan UNIVERSE_ID bukan PLACE_ID
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID; // PENTING: Ini Universe ID, bukan Place ID!
const MESSAGING_TOPIC = process.env.MESSAGING_TOPIC || 'MedusaIDRBroadcast';

if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
    console.error('Environment variables ROBLOX_API_KEY dan UNIVERSE_ID wajib diatur!');
    process.exit(1);
}

const PUBLISH_API_URL = `https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/${encodeURIComponent(MESSAGING_TOPIC)}`;

console.log('Webhook Server Configuration:');
console.log('- Universe ID:', UNIVERSE_ID);
console.log('- Messaging Topic:', MESSAGING_TOPIC);
console.log('- API URL:', PUBLISH_API_URL);

// Endpoint webhook Saweria
app.post('/saweria-webhook', async (req, res) => {
    console.log('=== Webhook diterima dari Saweria ===');
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    const saweriaPayload = req.body;
    
    if (!saweriaPayload) {
        console.error('❌ Payload Saweria tidak ditemukan');
        return res.status(400).send('Bad Request: Payload tidak ditemukan');
    }

    // Validasi type donation
    if (saweriaPayload.type !== 'donation') {
        console.log('ℹ️ Bukan event donasi, diabaikan:', saweriaPayload.type);
        return res.status(200).send('OK - Bukan donation event');
    }

    // Ekstrak data
    const donatorName = saweriaPayload.donator_name || 'Anonymous';
    const amountRaw = saweriaPayload.amount_raw || 0;
    const message = saweriaPayload.message || '';
    const donatorEmail = saweriaPayload.donator_email || '';
    
    console.log(`💰 Donasi: ${donatorName} - Rp ${amountRaw.toLocaleString('id-ID')}`);
    if (message) console.log(`📝 Pesan: "${message}"`);

    // ✅ FIX 2: Coba parse Roblox username dari message atau donator_name
    // Format yang diharapkan di message: "[RobloxUsername] Pesan opsional"
    let robloxUsername = null;
    const usernameMatch = message.match(/^\[(\w+)\]/); // Match [Username]
    
    if (usernameMatch) {
        robloxUsername = usernameMatch[1];
        console.log(`✅ Roblox username ditemukan: ${robloxUsername}`);
    } else {
        // Fallback: gunakan donator_name sebagai username
        robloxUsername = donatorName;
        console.log(`⚠️ Username tidak ditemukan di message, gunakan donator_name: ${robloxUsername}`);
    }

    // Payload untuk Roblox
    const robloxPayload = {
        username: robloxUsername,
        displayName: donatorName, // Nama asli dari Saweria
        amount: Math.floor(amountRaw),
        timestamp: Math.floor(Date.now() / 1000),
        source: 'Saweria',
        message: message,
        email: donatorEmail // Untuk debugging
    };

    console.log('📤 Mengirim ke Roblox:', JSON.stringify(robloxPayload, null, 2));

    try {
        const response = await axios.post(PUBLISH_API_URL, robloxPayload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ROBLOX_API_KEY
            }
        });
        
        console.log('✅ Berhasil mengirim ke Roblox MessagingService:', response.status);
        console.log('Response:', response.data);
        res.status(200).send('OK - Donation processed');
        
    } catch (error) {
        console.error('❌ Gagal mengirim ke Roblox MessagingService');
        
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Headers:', error.response.headers);
        } else if (error.request) {
            console.error('Request Error:', error.request);
        } else {
            console.error('Error Message:', error.message);
        }
        
        res.status(500).send('Internal Server Error');
    }
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Saweria x Roblox Webhook',
        universeId: UNIVERSE_ID,
        messagingTopic: MESSAGING_TOPIC,
        endpoints: {
            webhook: '/saweria-webhook'
        }
    });
});

// Test endpoint (opsional, untuk testing manual)
app.post('/test', async (req, res) => {
    console.log('🧪 Test endpoint called');
    console.log('Request body:', req.body);
    
    const testPayload = {
        username: req.body.username || 'TestUser',
        displayName: req.body.displayName || 'Test Donator',
        amount: parseInt(req.body.amount) || 10000,
        timestamp: Math.floor(Date.now() / 1000),
        source: 'Test',
        message: req.body.message || 'Test donation'
    };
    
    console.log('Sending payload to Roblox:', testPayload);
    
    try {
        // CRITICAL: Wrap in "message" field for Roblox API
        const requestBody = {
            message: testPayload
        };
        
        const response = await axios.post(PUBLISH_API_URL, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ROBLOX_API_KEY
            }
        });
        
        console.log('✅ Successfully sent to Roblox');
        console.log('Response status:', response.status);
        console.log('Response data:', response.data);
        
        res.json({ 
            success: true, 
            status: response.status,
            sentPayload: testPayload,
            robloxResponse: response.data
        });
    } catch (error) {
        console.error('❌ Failed to send to Roblox');
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.response?.data || error.message,
            sentPayload: testPayload
        });
    }
});

// Debug endpoint untuk melihat konfigurasi (HAPUS DI PRODUCTION!)
app.get('/debug', (req, res) => {
    res.json({
        universeId: UNIVERSE_ID,
        messagingTopic: MESSAGING_TOPIC,
        apiUrl: PUBLISH_API_URL,
        hasApiKey: !!ROBLOX_API_KEY,
        apiKeyPrefix: ROBLOX_API_KEY ? ROBLOX_API_KEY.substring(0, 10) + '...' : 'NOT SET'
    });
});

app.listen(port, () => {
    console.log(`✅ Server berjalan di port ${port}`);
    console.log(`📡 Webhook endpoint: http://localhost:${port}/saweria-webhook`);
    console.log(`🧪 Test endpoint: http://localhost:${port}/test`);
});
