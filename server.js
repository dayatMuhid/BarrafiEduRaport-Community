const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3005;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const DB_FILE = path.join(__dirname, 'raport.sqlite');
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS secure_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`);
});

// Kunci enkripsi tetap yang sangat aman
const ENCRYPTION_KEY = crypto.createHash('sha256').update('BarRafiSecureEduRaportKey2026_SaltSecure').digest();
const ALGORITHM = 'aes-256-cbc';

// Fungsi enkripsi AES-256-CBC
function encryptText(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// Fungsi dekripsi AES-256-CBC
function decryptText(encryptedText) {
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const ciphertext = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return null;
    }
}

// ==========================================
// AUTO-SHUTDOWN HEARTBEAT SYSTEM
// ==========================================
let lastHeartbeat = Date.now();

app.get('/api/heartbeat', (req, res) => {
    lastHeartbeat = Date.now();
    res.json({ success: true });
});

// Cek status keaktifan browser setiap 2 detik
setInterval(() => {
    if (Date.now() - lastHeartbeat > 8000) { // Toleransi 8 detik tanpa detak jantung dari browser
        console.log("Browser ditutup. Mematikan server BarRafi EduRaport secara otomatis...");
        db.close(() => {
            process.exit(0);
        });
    }
}, 2000);

// Endpoint Ambil Seluruh Data Terdekripsi
app.get('/api/db/get-all', (req, res) => {
    db.all(`SELECT key, value FROM secure_settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const data = {};
        rows.forEach(row => {
            const decryptedVal = decryptText(row.value);
            if (decryptedVal !== null) {
                try {
                    data[row.key] = JSON.parse(decryptedVal);
                } catch (e) {
                    data[row.key] = decryptedVal;
                }
            }
        });

        res.json({
            success: true,
            data: data
        });
    });
});

// Endpoint Simpan Data Terenkripsi
app.post('/api/db/set', (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined) {
        return res.status(400).json({ error: "Key dan Value wajib diisi!" });
    }

    const plainText = typeof value === 'string' ? value : JSON.stringify(value);
    const encryptedValue = encryptText(plainText);

    db.run(`INSERT OR REPLACE INTO secure_settings (key, value) VALUES (?, ?)`, [key, encryptedValue], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Data ${key} berhasil disimpan secara terenkripsi!` });
    });
});

// Reset Database
app.post('/api/db/reset', (req, res) => {
    db.run(`DELETE FROM secure_settings`, [], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Database SQLite berhasil direset!" });
    });
});

app.listen(PORT, () => {
    console.log(`Server BarRafi EduRaport berjalan di http://localhost:${PORT}`);
});
