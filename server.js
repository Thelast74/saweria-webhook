const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000; // Gunakan PORT dari Railway

// Gunakan middleware untuk parsing body JSON dari Saweria
app.use(express.json({ verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}}));

// Ambil konfigurasi dari Environment Variables
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY; // Akan diatur di Railway
const PLACE_ID = process.env.PLACE_ID; // Akan diatur di Railway
const MESSAGING_TOPIC = process.env.MESSAGING_TOPIC || 'MedusaIDRBroadcast'; // Default ke nilai kamu

// Validasi bahwa variabel penting ada
if (!ROBLOX_API_KEY || !PLACE_ID) {
    console.error('Environment variables ROBLOX_API_KEY dan PLACE_ID wajib diatur!');
    process.exit(1); // Hentikan server jika tidak ada
}

const PUBLISH_API_URL = `https://apis.roblox.com/messaging-service/v1/universes/${PLACE_ID}/topics/${encodeURIComponent(MESSAGING_TOPIC)}`;

// Endpoint untuk menerima webhook dari Saweria
app.post('/saweria-webhook', (req, res) => {
    console.log('Webhook diterima dari Saweria:', req.body);

    // 1. Validasi Signature (Opsional tapi sangat dianjurkan untuk keamanan)
    // Kamu bisa menambahkan validasi signature di sini jika Saweria menyediakannya.
    // Untuk sekarang, kita abaikan validasi untuk kesederhanaan.

    // 2. Ekstrak data dari payload Saweria
    const saweriaData = req.body.data;
    if (!saweriaData) {
        console.error('Payload Saweria tidak valid:', req.body);
        return res.status(400).send('Bad Request: Data tidak ditemukan');
    }

    const saweriaName = saweriaData.name || 'Anonymous';
    const saweriaAmount = saweriaData.amount || 0;
    const saweriaMessage = saweriaData.message || '';
    const created_at = saweriaData.created_at;

    console.log(`Donasi diterima: ${saweriaName} - Rp ${saweriaAmount}`);

    // 3. Siapkan payload untuk dikirim ke Roblox MessagingService
    // Format ini harus sesuai dengan yang diterima oleh MessagingService.SubscribeAsync di script Roblox kamu
    const robloxPayload = {
        userId: null, // Kita tidak bisa mendapatkan UserId langsung dari Saweria
        username: saweriaName, // Gunakan nama dari Saweria
        displayName: saweriaName, // Gunakan nama dari Saweria
        amount: Math.floor(saweriaAmount), // Asumsikan 1 IDR = 1 Point, sesuaikan jika perlu
        total: null, // Total akan dihitung ulang oleh script Roblox
        timestamp: Math.floor(Date.now() / 1000), // Timestamp saat webhook diterima
        source: 'Saweria' // Tandai sumbernya
    };

    // 4. Kirim ke Roblox MessagingService
    axios.post(PUBLISH_API_URL, robloxPayload, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ROBLOX_API_KEY // Gunakan API Key kamu
        }
    })
    .then(response => {
        console.log('Berhasil mengirim ke Roblox MessagingService:', response.status);
        res.status(200).send('OK');
    })
    .catch(error => {
        console.error('Gagal mengirim ke Roblox MessagingService:', error.response?.data || error.message);
        // Log error lebih detail
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
            console.error('Headers:', error.response.headers);
        } else if (error.request) {
            console.error('Request Error:', error.request);
        } else {
            console.error('Error Message:', error.message);
        }
        res.status(500).send('Internal Server Error');
    });
});

// Endpoint untuk mengecek apakah server berjalan
app.get('/', (req, res) => {
    res.send('Webhook Server untuk Saweria x Roblox aktif!');
});

app.listen(port, () => {
    console.log(`Server berjalan di port ${port}`);
    console.log(`Webhook Saweria akan menerima data di: /saweria-webhook`);
});
