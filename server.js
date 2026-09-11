const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

const getDaysMs = (days) => days * 24 * 60 * 60 * 1000;
const getHoursMs = (hours) => hours * 60 * 60 * 1000;

// Дефолтные ключи, если база пустая
const INITIAL_KEYS = {
    // --- 1 день ---
    "ASCF-ASVG-IFDI": getDaysMs(1), "XQWE-RTYU-IOPL": getDaysMs(1), "ZXCV-BNMK-JHGF": getDaysMs(1),
    "POIU-YTRE-WQAS": getDaysMs(1), "LKJH-GFDS-AMNB": getDaysMs(1), "MNBV-CXZL-KJH1": getDaysMs(1),
    "QAZX-SWED-CVFR": getDaysMs(1), "PLKM-IJUN-BHYT": getDaysMs(1), "VFRT-GBNH-YUIK": getDaysMs(1), "EDCR-FVTG-BYHN": getDaysMs(1),
    // --- 3 дня ---
    "KJH1-GFD2-SZA3": getDaysMs(3), "MKOI-UYTR-EWAQ": getDaysMs(3), "ZSEX-DCRT-FVGY": getDaysMs(3),
    "HUIJ-KOLP-QAWS": getDaysMs(3), "XSWQ-AZDE-FRCV": getDaysMs(3), "BGTF-VCRD-XSWZ": getDaysMs(3),
    "NMKJ-IUYH-GTRE": getDaysMs(3), "LOPK-JIUH-YFDC": getDaysMs(3), "QAZW-SXED-CRFV": getDaysMs(3), "TGYH-UNJM-IKOL": getDaysMs(3),
    // --- 7 дней ---
    "WK7D-ASDF-GHJK": getDaysMs(7), "RT7D-ZXCV-BNMQ": getDaysMs(7), "UI7D-POIU-TREW": getDaysMs(7),
    "DF7D-LKJH-GFDS": getDaysMs(7), "CV7D-MNBV-CXZA": getDaysMs(7), "GH7D-QWER-TYUI": getDaysMs(7),
    "JK7D-POIU-YTRE": getDaysMs(7), "ZX7D-ASDF-GHJK": getDaysMs(7), "BN7D-ZXCV-BNMK": getDaysMs(7), "OP7D-LKJH-GFDC": getDaysMs(7),
    // --- 14 дней ---
    "M14X-QAZW-SXED": getDaysMs(14), "K14X-CRFV-TGYH": getDaysMs(14), "P14X-UJMI-KOLP": getDaysMs(14),
    "L14X-QWER-TYUI": getDaysMs(14), "H14X-ASDF-GHJK": getDaysMs(14), "N14X-ZXCV-BNMK": getDaysMs(14),
    "B14X-POIU-YTRE": getDaysMs(14), "V14X-LKJH-GFDS": getDaysMs(14), "C14X-MNBV-CXZA": getDaysMs(14), "X14X-PLKM-IJUN": getDaysMs(14),
    // --- 30 дней ---
    "VIP3-0ASW-EDCR": getDaysMs(30), "VIP3-0FVG-YHNU": getDaysMs(30), "VIP3-0JMI-KOLP": getDaysMs(30),
    "VIP3-0QAZ-WSXE": getDaysMs(30), "VIP3-0DCF-VTGB": getDaysMs(30), "VIP3-0YH1-UNJM": getDaysMs(30),
    "VIP3-0IK1-OLPM": getDaysMs(30), "VIP3-0ZA1-QWSX": getDaysMs(30), "VIP3-0ED2-CFRV": getDaysMs(30), "VIP3-0TG3-BYHN": getDaysMs(30)
};

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocker_keys (
        key_code VARCHAR(50) PRIMARY KEY,
        duration_ms BIGINT,
        device_id VARCHAR(100),
        expires_at BIGINT,
        last_ping BIGINT,
        is_generated BOOLEAN DEFAULT FALSE,
        label VARCHAR(50)
      );
    `);

    const res = await pool.query('SELECT COUNT(*) FROM blocker_keys');
    if (parseInt(res.rows[0].count) === 0) {
      for (const [k, duration] of Object.entries(INITIAL_KEYS)) {
        await pool.query(
          'INSERT INTO blocker_keys (key_code, duration_ms, expires_at, last_ping, is_generated) VALUES ($1, $2, 0, 0, FALSE) ON CONFLICT DO NOTHING',
          [k, duration]
        );
      }
    }
    console.log("PostgreSQL Database initialized for Blocker successfully.");
  } catch (err) {
    console.error("DB init error:", err);
  }
}

initDB();

function generateRandomKeyString() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

app.get('/', (req, res) => res.redirect('/admin/view-devices'));

app.post('/api/activate-key', async (req, res) => {
    const { key, deviceId } = req.body;
    if (!key || !deviceId) return res.json({ valid: false, expiresAt: 0 });

    const cleanKey = key.trim().toUpperCase();
    const now = Date.now();

    try {
        const keyQuery = await pool.query('SELECT * FROM blocker_keys WHERE key_code = $1', [cleanKey]);
        if (keyQuery.rows.length === 0) {
            return res.json({ valid: false, expiresAt: 0 });
        }

        const keyData = keyQuery.rows[0];

        // Ключ еще ни к кому не был привязан
        if (!keyData.device_id) {
            const expiresAt = now + parseInt(keyData.duration_ms);
            await pool.query(
                'UPDATE blocker_keys SET device_id = $1, expires_at = $2, last_ping = $3 WHERE key_code = $4',
                [deviceId, expiresAt, now, cleanKey]
            );
            console.log(`⏱️ [КЛЮЧ АКТИВИРОВАН] Ключ ${cleanKey} привязан к: ${deviceId}`);
            return res.json({ valid: true, expiresAt: expiresAt });
        }

        // Ключ привязан к этому же устройству
        if (keyData.device_id === deviceId) {
            if (now > parseInt(keyData.expires_at)) {
                return res.json({ valid: false, expiresAt: 0 });
            }
            await pool.query('UPDATE blocker_keys SET last_ping = $1 WHERE key_code = $2', [now, cleanKey]);
            return res.json({ valid: true, expiresAt: parseInt(keyData.expires_at) });
        }

        // Ключ занят другим устройством
        return res.json({ valid: false, expiresAt: 0 });

    } catch (err) {
        console.error(err);
        res.status(500).json({ valid: false, expiresAt: 0 });
    }
});

app.get('/api/check-ban/:deviceId', async (req, res) => {
    const deviceId = req.params.deviceId;
    const now = Date.now();
    
    try {
        const devQuery = await pool.query('SELECT * FROM blocker_keys WHERE device_id = $1', [deviceId]);
        if (devQuery.rows.length > 0) {
            const data = devQuery.rows[0];
            await pool.query('UPDATE blocker_keys SET last_ping = $1 WHERE key_code = $2', [now, data.key_code]);
            if (now > parseInt(data.expires_at)) {
                return res.status(403).send("EXPIRED");
            }
        }
        return res.status(200).send("OK");
    } catch (err) {
        console.error(err);
        return res.status(200).send("OK");
    }
});

// АДМИНКА С АНАЛИТИКОЙ
app.get('/admin/view-devices', async (req, res) => {
    try {
        const allKeys = await pool.query('SELECT * FROM blocker_keys ORDER BY key_code');
        const now = Date.now();

        let totalDevices = 0;
        let onlineDevices = 0;
        let activeSubs = 0;
        let expiredSubs = 0;
        let unboundCount = 0;

        let tableRows = '';
        let newlyGeneratedHtml = '';

        allKeys.rows.forEach(data => {
            if (data.device_id) totalDevices++;
            else unboundCount++;

            const isExpired = data.expires_at && now > parseInt(data.expires_at);
            const lastPing = data.last_ping ? parseInt(data.last_ping) : 0;
            const isOnline = data.device_id && lastPing && (now - lastPing < 120000) && !isExpired;

            if (data.device_id) {
                if (isExpired) expiredSubs++;
                else activeSubs++;
                if (isOnline) onlineDevices++;
            }

            const dateStr = data.expires_at && data.expires_at > 0 
                ? new Date(parseInt(data.expires_at)).toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" }) 
                : 'Не активирован';

            let statusHtml = '<span class="status-offline">⚪ Оффлайн</span>';
            if (isOnline) {
                statusHtml = '<span class="status-online">🟢 Онлайн</span>';
            } else if (isExpired && data.device_id) {
                statusHtml = '<span style="color:#e74c3c; font-weight:bold;">⏳ Истек</span>';
            }

            tableRows += `
                <tr>
                    <td>${statusHtml}</td>
                    <td><strong>${data.key_code}</strong></td>
                    <td>${data.device_id ? `<code>${data.device_id}</code>` : '<span style="color:#e74c3c;">Свободен / Сброшен</span>'}</td>
                    <td>${dateStr}</td>
                    <td>
                        <button class="btn btn-blue" onclick="resetDevice('${data.key_code}')">Сбросить</button>
                        <button class="btn btn-yellow" onclick="unbindDevice('${data.key_code}')">Удалить</button>
                    </td>
                </tr>
            `;

            if (data.is_generated) {
                newlyGeneratedHtml += `<li><code>${data.key_code}</code> — (${data.label || 'Ключ'})</li>`;
            }
        });

        res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Панель управления Блокером (PostgreSQL)</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background-color: #f4f7f6; padding: 20px; }
                .container { max-width: 1100px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; margin-bottom: 10px; }
                .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
                .stat-num { font-size: 24px; font-weight: bold; color: #3498db; margin-top: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 14px; }
                th { background-color: #3498db; color: white; font-weight: bold; }
                .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; margin-right: 5px; }
                .btn-green { background-color: #2ecc71; }
                .btn-purple { background-color: #9b59b6; }
                .btn-yellow { background-color: #f39c12; }
                .btn-blue { background-color: #2980b9; }
                .badge { background-color: #2ecc71; color: white; padding: 5px 10px; border-radius: 20px; font-size: 14px; }
                code { background: #eee; padding: 4px 8px; border-radius: 4px; color: #d35400; font-family: monospace; font-size: 14px; }
                .gen-panel { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
                .status-online { color: #2ecc71; font-weight: bold; }
                .status-offline { color: #95a5a6; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>📊 Аналитика и Статистика (Блокер)</h2>
                <div class="stats-grid">
                    <div class="stat-box"><div>Всего в базе</div><div class="stat-num">${allKeys.rows.length}</div></div>
                    <div class="stat-box"><div>⚡ Онлайн сейчас</div><div class="stat-num" style="color:#2ecc71;">${onlineDevices}</div></div>
                    <div class="stat-box"><div>✅ Активных</div><div class="stat-num" style="color:#2980b9;">${activeSubs}</div></div>
                    <div class="stat-box"><div>⏳ Истекли</div><div class="stat-num" style="color:#e74c3c;">${expiredSubs}</div></div>
                    <div class="stat-box"><div>🔓 Свободных</div><div class="stat-num" style="color:#95a5a6;">${unboundCount}</div></div>
                </div>
            </div>

            <div class="container">
                <h2>🛠️ Генератор ключей и Триалов</h2>
                <div class="gen-panel">
                    <button class="btn btn-purple" onclick="generateKey(1, '1 час', true)">⏱️ Триальный на 1 час</button>
                    <button class="btn btn-purple" onclick="generateKey(12, '12 часов', true)">⏱️ Триальный на 12 часов</button>
                    <button class="btn btn-green" onclick="generateKey(1, '1 день', false)">+ 1 день</button>
                    <button class="btn btn-green" onclick="generateKey(7, '7 дней', false)">+ 7 дней</button>
                    <button class="btn btn-green" onclick="generateKey(30, '30 дней', false)">+ 30 дней</button>
                </div>
                ${newlyGeneratedHtml ? `
                <h4>Созданные ключи:</h4>
                <ul>${newlyGeneratedHtml}</ul>
                ` : ''}
            </div>

            <div class="container">
                <h2>🔑 Ключи и Устройства <span class="badge">Всего: ${allKeys.rows.length}</span></h2>
                <table>
                    <thead>
                        <tr>
                            <th>Статус</th>
                            <th>Ключ</th>
                            <th>ID Устройства</th>
                            <th>Истекает (Местное)</th>
                            <th>Управление</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>

            <script>
                async function resetDevice(key) {
                    if(!confirm('Сбросить привязку для ключа ' + key + '?')) return;
                    await fetch('/admin/reset', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                    location.reload();
                }
                async function unbindDevice(key) {
                    if(!confirm('Удалить ключ ' + key + ' из базы?')) return;
                    await fetch('/admin/unbind', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                    location.reload();
                }
                async function generateKey(value, label, isHours) {
                    await fetch('/admin/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ value, label, isHours }) });
                    location.reload();
                }
            </script>
        </body>
        </html>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка загрузки панели администрирования");
    }
});

app.post('/admin/reset', async (req, res) => {
    const { key } = req.body;
    try {
        await pool.query('UPDATE blocker_keys SET device_id = NULL, expires_at = 0, last_ping = 0 WHERE key_code = $1', [key]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.post('/admin/unbind', async (req, res) => {
    const { key } = req.body;
    try {
        await pool.query('DELETE FROM blocker_keys WHERE key_code = $1', [key]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.post('/admin/generate', async (req, res) => {
    const { value, label, isHours } = req.body;
    const newKey = generateRandomKeyString();
    let durationMs = isHours ? getHoursMs(value) : getDaysMs(value);

    try {
        await pool.query(
            'INSERT INTO blocker_keys (key_code, duration_ms, expires_at, last_ping, is_generated, label) VALUES ($1, $2, 0, 0, TRUE, $3)',
            [newKey, durationMs, label]
        );
        console.log(`[АДМИН] Создан ключ: ${newKey} на ${label}`);
        res.json({ success: true, key: newKey });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер Блокера запущен на порту ${PORT}`));
