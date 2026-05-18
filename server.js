const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const { execSync } = require('child_process');

const app = express();
const PORT = 3005;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Support base64 school logo
app.use(express.static(__dirname));

// ==========================================
// DB & KRIPTOGRAFI LAYOUT
// ==========================================
const DB_FILE = path.join(__dirname, 'raport.sqlite');
const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS secure_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS secure_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`);
});

const ENCRYPTION_SALT = 'BarRafiSaltEduRaport';
const ALGORITHM = 'aes-256-cbc';

// Fungsi untuk mendapatkan hardware ID unik Windows tanpa butuh hak Administrator
function getMotherboardUuid() {
    try {
        const guid = execSync('powershell -Command "(Get-ItemProperty -Path \'HKLM:\\SOFTWARE\\Microsoft\\Cryptography\').MachineGuid"', { encoding: 'utf8' }).trim();
        if (guid && guid.length > 5) return guid;
    } catch (e) {
        console.warn("Gagal membaca Registry MachineGuid, mencoba CimInstance...");
    }
    try {
        const uuid = execSync('powershell -Command "(Get-CimInstance Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8' }).trim();
        if (uuid && uuid.length > 5) return uuid;
    } catch (e) {
        console.warn("Gagal membaca UUID Motherboard via CimInstance, mencoba BIOS...");
    }
    try {
        const serial = execSync('powershell -Command "(Get-CimInstance Win32_BIOS).SerialNumber"', { encoding: 'utf8' }).trim();
        if (serial && serial.length > 5) return serial;
    } catch (e) {
        console.warn("Gagal membaca serial BIOS...");
    }
    return "FALLBACK-HARDWARE-KEY-SALT-10293";
}

// Fungsi pembantu untuk membuat hash key 32-byte dari string kustom
function deriveKey(sourceString) {
    return crypto.createHash('sha256').update(sourceString + ENCRYPTION_SALT).digest();
}

// Fungsi enkripsi dasar dengan AES-256-CBC
function encryptText(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

// Fungsi dekripsi dasar dengan AES-256-CBC
function decryptText(encryptedText, key) {
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const ciphertext = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return null;
    }
}

// Generator nomor seri yang cocok dengan logika frontend
function generateSerial(name, deviceId) {
    let combined = (name.toUpperCase() + deviceId + "BARRAFI_SALT").split('');
    let hash = combined.reduce((acc, char) => acc + char.charCodeAt(0), 0);
    let part1 = (hash * 13).toString(16).toUpperCase().substring(0, 4);
    let part2 = (hash * 7).toString(16).toUpperCase().substring(0, 4);
    return `${part1}-${part2}`;
}

// Helper untuk membaca metadata dari database secara sinkron/promisified
function getMetadata(key) {
    return new Promise((resolve) => {
        db.get(`SELECT value FROM secure_metadata WHERE key = ?`, [key], (err, row) => {
            if (err || !row) resolve(null);
            else resolve(row.value);
        });
    });
}

// Helper untuk menyimpan metadata ke database
function setMetadata(key, value) {
    return new Promise((resolve) => {
        db.run(`INSERT OR REPLACE INTO secure_metadata (key, value) VALUES (?, ?)`, [key, value], () => {
            resolve();
        });
    });
}

// Fungsi mengambil Master Key Database (Membuat jika belum ada)
function getOrCreateMasterKey() {
    return new Promise(async (resolve, reject) => {
        const uuid = getMotherboardUuid();
        const currentHardwareKey = deriveKey(uuid);

        // 1. Cek apakah ada master key terenkripsi untuk perangkat saat ini
        const encMasterKey = await getMetadata('encrypted_master_key');
        if (encMasterKey) {
            const decKey = decryptText(encMasterKey, currentHardwareKey);
            if (decKey) {
                return resolve(Buffer.from(decKey, 'hex')); // Master key ditemukan & valid!
            }
        }

        // 2. Jika enkripsi gagal, periksa apakah database memiliki data terdaftar sebelumnya
        db.get(`SELECT COUNT(*) as count FROM secure_settings`, [], async (err, row) => {
            if (err) return reject(err);
            
            if (row && row.count > 0) {
                // Database ada isinya tetapi tidak bisa didekripsi dengan UUID saat ini = Butuh Migrasi PC!
                return resolve(null); 
            } else {
                // Database kosong = Inisialisasi Master Key Baru secara acak
                const newMasterKey = crypto.randomBytes(32);
                const newEncMasterKey = encryptText(newMasterKey.toString('hex'), currentHardwareKey);
                
                await setMetadata('encrypted_master_key', newEncMasterKey);
                return resolve(newMasterKey);
            }
        });
    });
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Ambil Seluruh Pengaturan & Data Terdekripsi
app.get('/api/db/get-all', async (req, res) => {
    try {
        const masterKey = await getOrCreateMasterKey();
        
        if (masterKey === null) {
            // Butuh Migrasi PC Baru!
            const ownerName = await getMetadata('owner_name') || 'Guru BarRafi';
            const oldDeviceId = await getMetadata('old_device_id') || 'Perangkat Lama';
            return res.json({
                success: true,
                needsMigration: true,
                ownerName: ownerName,
                oldDeviceId: oldDeviceId
            });
        }

        // Baca seluruh data settings
        db.all(`SELECT key, value FROM secure_settings`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const data = {};
            rows.forEach(row => {
                const decryptedVal = decryptText(row.value, masterKey);
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
                needsMigration: false,
                data: data
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Simpan/Perbarui Nilai Tertentu di SQLite
app.post('/api/db/set', async (req, res) => {
    const { key, value } = req.body;
    if (!key || value === undefined) {
        return res.status(400).json({ error: "Key dan Value wajib diisi!" });
    }

    try {
        const masterKey = await getOrCreateMasterKey();
        if (!masterKey) {
            return res.status(403).json({ error: "Akses ditolak! Perangkat tidak terotorisasi." });
        }

        const plainText = typeof value === 'string' ? value : JSON.stringify(value);
        const encryptedValue = encryptText(plainText, masterKey);

        db.run(`INSERT OR REPLACE INTO secure_settings (key, value) VALUES (?, ?)`, [key, encryptedValue], async function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Simpan metadata otorisasi ketika lisensi diatur oleh frontend
            if (key === 'barrafi_license') {
                const license = typeof value === 'string' ? JSON.parse(value) : value;
                if (license && license.name) {
                    await setMetadata('owner_name', license.name);
                    await setMetadata('old_device_id', license.deviceId);

                    // Buat recovery master key terenkripsi menggunakan Serial Key sebagai back-up migrasi
                    const uuid = getMotherboardUuid();
                    const correctSerial = generateSerial(license.name, license.deviceId);
                    const recoveryString = `${license.name.toUpperCase()}-${license.deviceId}-${correctSerial}`;
                    const recoveryKey = deriveKey(recoveryString);
                    const encRecoveryMasterKey = encryptText(masterKey.toString('hex'), recoveryKey);
                    
                    await setMetadata('recovery_master_key', encRecoveryMasterKey);
                }
            }

            // Simpan metadata trial jika status trial diatur
            if (key === 'barrafi_trial') {
                const trial = typeof value === 'string' ? JSON.parse(value) : value;
                if (trial && trial.deviceId) {
                    await setMetadata('old_device_id', trial.deviceId);
                }
            }

            res.json({ success: true, message: `Data ${key} berhasil diamankan ke SQLite!` });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Migrasi Database ke PC Baru dengan Serial Key Valid
app.post('/api/db/migrate', async (req, res) => {
    const { serialKey } = req.body;
    if (!serialKey) {
        return res.status(400).json({ error: "Serial Key wajib disertakan untuk migrasi perangkat!" });
    }

    try {
        const ownerName = await getMetadata('owner_name');
        const oldDeviceId = await getMetadata('old_device_id');
        const recoveryMasterKeyEnc = await getMetadata('recovery_master_key');

        if (!ownerName || !oldDeviceId || !recoveryMasterKeyEnc) {
            return res.status(400).json({ error: "Data migrasi tidak lengkap di database. Silakan jalankan ulang aplikasi asal." });
        }

        // 1. Validasi Serial Key secara kriptografis
        const correctSerial = generateSerial(ownerName, oldDeviceId);
        if (serialKey.trim().toUpperCase() !== correctSerial) {
            return res.status(403).json({ error: "Serial Key tidak cocok! Pemulihan database gagal." });
        }

        // 2. Dekripsi Master Key Database menggunakan Serial Key Recovery
        const recoveryString = `${ownerName.toUpperCase()}-${oldDeviceId}-${correctSerial}`;
        const recoveryKey = deriveKey(recoveryString);
        const masterKeyHex = decryptText(recoveryMasterKeyEnc, recoveryKey);

        if (!masterKeyHex) {
            return res.status(500).json({ error: "Gagal memecahkan master key pemulihan. Kontak admin." });
        }

        const masterKey = Buffer.from(masterKeyHex, 'hex');

        // 3. Re-enkripsi Master Key menggunakan Motherboard UUID PC baru saat ini
        const newUuid = getMotherboardUuid();
        const newHardwareKey = deriveKey(newUuid);
        const newEncMasterKey = encryptText(masterKey.toString('hex'), newHardwareKey);

        await setMetadata('encrypted_master_key', newEncMasterKey);

        // 4. Update Lisensi untuk Perangkat Baru
        db.get(`SELECT value FROM secure_settings WHERE key = 'barrafi_license'`, [], async (err, row) => {
            if (!err && row) {
                const decLicense = decryptText(row.value, masterKey);
                if (decLicense) {
                    const license = JSON.parse(decLicense);
                    
                    // Frontend akan memperbarui hal ini, tetapi server membantu re-mapping metadata
                    const newDeviceId = "BR-" + (window_guid_placeholder_calculation_logic()).toString(16).toUpperCase(); 
                    // Kita biarkan frontend memproses pembaruan Device ID lisensi penuh, 
                    // di sini kita hanya cukup menyelesaikan re-wrapping Master Key SQLite!
                }
            }
        });

        res.json({
            success: true,
            message: "Migrasi perangkat berhasil! Database SQLite berhasil dire-enkripsi dengan kunci perangkat baru."
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset Database
app.post('/api/db/reset', (req, res) => {
    db.run(`DELETE FROM secure_settings`, [], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM secure_metadata`, [], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ success: true, message: "Database SQLite berhasil direset sepenuhnya!" });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server BarRafi EduRaport berjalan di http://localhost:${PORT}`);
});
