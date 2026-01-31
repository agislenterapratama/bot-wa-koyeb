const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const express = require('express');
const axios = require('axios');

// --- SERVER WEB (Pancingan agar Koyeb mendeteksi App Healthy) ---
const app = express();
const port = process.env.PORT || 8000;

app.get('/', (req, res) => {
    res.send('Bot WhatsApp is Running on Koyeb!');
});

app.listen(port, () => {
    console.log(`Server web nyala di port ${port}`);
});

// --- AI GEMINI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
async function tanyaGemini(text) {
    if (!GEMINI_API_KEY) return "⚠️ API Key belum di-set!";
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await axios.post(url, { contents: [{ parts: [{ text: text }] }] });
        return response.data.candidates[0].content.parts[0].text;
    } catch (e) { return "Maaf, AI Error."; }
}

// --- BOT ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false, // Kita handle manual
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n=======================");
            console.log("SCAN QR DI BAWAH INI:");
            console.log("=======================");
            qrcode.generate(qr, { small: true });
            console.log("=======================\n");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ LOGIN SUKSES! Bot Koyeb Aktif.');
        }
    });

    sock.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;
            const from = mek.key.remoteJid;
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || "";
            const command = body.trim().split(/ +/).shift().toLowerCase();
            const text = body.trim().split(/ +/).slice(1).join(" ");

            if (command === '.ai') {
                const jawaban = await tanyaGemini(text);
                await sock.sendMessage(from, { text: jawaban }, { quoted: mek });
            }
        } catch (e) {}
    });
}

startBot();
