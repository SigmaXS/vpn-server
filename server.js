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

// Только твои конкретные 9 устройств со статусами и актуальными датами на 2026 год
const ACTIVE_DEVICES_KEYS = [
    { key: "VIP3-0TG3-BYHN", duration: getDaysMs(30), dev: "4249ff61a9706bfa", exp: new Date('2026-09-12T23:04:20').getTime() },
    { key: "VIP3-0ED2-CFRV", duration: getDaysMs(30), dev: "42a5d4cb52fade31", exp: new Date('2026-09-13T01:20:22').getTime() },
    { key: "VIP3-0YH1-UNJM", duration: getDaysMs(30), dev: "7db82014c369c3e5", exp: new Date('2026-09-14T14:14:06').getTime() },
    { key: "VIP3-0QAZ-WSXE", duration: getDaysMs(30), dev: "7fbb76d7859d9cc3", exp: new Date('2026-09-14T17:39:08').getTime() },
    { key: "VIP3-0FVG-YHNU", duration: getDaysMs(30), dev: "6f3b0aafa0faf49c", exp: new Date('2026-09-19T23:09:07').getTime() },
    { key: "VIP3-0ZA1-QWSX", duration: getDaysMs(30), dev: "59024857645375c0", exp: new Date('2026-10-01T19:23:00').getTime() },
    { key: "VIP3-0IK1-OLPM", duration: getDaysMs(30), dev: "62866b04b44db3fb", exp: new Date('2026-10-10T12:08:16').getTime() },
    { key: "ZLRH-2V9R-7BRA", duration: getDaysMs(14), dev: "8785dca4721e59b9", exp: new Date('2026-09-18T09:54:49').getTime() },
    { key: "ISK5-TSUE-K413", duration: getDaysMs(30), dev: "d8240e33874cd220", exp: new Date('2026-10-11T18:23:15').getTime() }
];

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
        label VARCHAR(50),
        status VARCHAR(20) DEFAULT 'active'
      );
    `);

    await pool.query(`ALTER TABLE blocker_keys ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';`);

    // Очищаем старые мусорные ключи, которых нет в списке активных
    const activeKeysList = ACTIVE_DEVICES_KEYS.map(item => item.key);
    await pool.query(`DELETE FROM blocker_keys WHERE is_generated = FALSE AND key_code <> ALL($1::text[])`, [activeKeysList]);

    // Заливаем/обновляем только нужные 9 устройств
    for (const item of ACTIVE_DEVICES_KEYS) {
      await pool.query(
        `INSERT INTO blocker_keys (key_code, duration_ms, device_id, expires_at, last_ping, is_generated, status) 
         VALUES ($1, $2, $3, $4, 0, FALSE, 'active') 
         ON CONFLICT (key_code) DO UPDATE 
         SET device_id = EXCLUDED.device_id, expires_at = EXCLUDED.expires_at`,
        [item.key, item.duration, item.dev, item.exp]
      );
    }

    console.log("Database initialized with exact 9 active devices.");
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

// Активация ключа с защитой по серверному времени
app.post('/api/activate-key', async (req, res) => {
    const { key, deviceId } = req.body;
    const serverNow = Date.now();

    if (!key || !deviceId) return res.json({ valid: false, expiresAt: 0, serverTime: serverNow });

    const cleanKey = key.trim().toUpperCase();

    try {
        const keyQuery = await pool.query('SELECT * FROM blocker_keys WHERE key_code = $1', [cleanKey]);
        if (keyQuery.rows.length === 0) {
            return res.json({ valid: false, expiresAt: 0, serverTime: serverNow });
        }

        const keyData = keyQuery.rows[0];

        if (keyData.status === 'banned') {
            return res.json({ valid: false, expiresAt: 0, is_banned: true, serverTime: serverNow, message: "Устройство заблокировано!" });
        }

        if (!keyData.device_id) {
            const expiresAt = serverNow + parseInt(keyData.duration_ms);
            await pool.query(
                'UPDATE blocker_keys SET device_id = $1, expires_at = $2, last_ping = $3, status = $4 WHERE key_code = $5',
                [deviceId, expiresAt, serverNow, 'active', cleanKey]
            );
            return res.json({ valid: true, expiresAt: expiresAt, serverTime: serverNow });
        }

        if (keyData.device_id === deviceId) {
            if (serverNow > parseInt(keyData.expires_at)) {
                return res.json({ valid: false, expiresAt: 0, serverTime: serverNow });
            }
            await pool.query('UPDATE blocker_keys SET last_ping = $1 WHERE key_code = $2', [serverNow, cleanKey]);
            return res.json({ valid: true, expiresAt: parseInt(keyData.expires_at), serverTime: serverNow });
        }

        return res.json({ valid: false, expiresAt: 0, serverTime: serverNow });

    } catch (err) {
        console.error(err);
        res.status(500).json({ valid: false, expiresAt: 0, serverTime: serverNow });
    }
});

// Фоновая проверка банов и пинг
app.get('/api/check-ban/:deviceId', async (req, res) => {
    const deviceId = req.params.deviceId;
    const serverNow = Date.now();
    
    try {
        const devQuery = await pool.query('SELECT * FROM blocker_keys WHERE device_id = $1', [deviceId]);
        if (devQuery.rows.length > 0) {
            const data = devQuery.rows[0];
            if (data.status === 'banned') {
                return res.status(403).json({ status: "BANNED", serverTime: serverNow });
            }
            await pool.query('UPDATE blocker_keys SET last_ping = $1 WHERE key_code = $2', [serverNow, data.key_code]);
            if (serverNow > parseInt(data.expires_at)) {
                return res.status(403).json({ status: "EXPIRED", serverTime: serverNow });
            }
        }
        return res.status(200).json({ status: "OK", serverTime: serverNow });
    } catch (err) {
        console.error(err);
        return res.status(200).json({ status: "OK", serverTime: serverNow });
    }
});

// Админ-панель (только нужные устройства + генератор)
app.get('/admin/view-devices', async (req, res) => {
    try {
        const allKeys = await pool.query('SELECT * FROM blocker_keys ORDER BY key_code');
        const now = Date.now();

        let onlineDevices = 0;
        let activeSubs = 0;
        let expiredSubs = 0;
        let bannedCount = 0;
        let unboundCount = 0;

        let tableRows = '';
        let newlyGeneratedHtml = '';

        allKeys.rows.forEach(data => {
            if (!data.device_id) unboundCount++;

            const isBanned = data.status === 'banned';
            const isExpired = data.expires_at && now > parseInt(data.expires_at);
            const lastPing = data.last_ping ? parseInt(data.last_ping) : 0;
            const isOnline = data.device_id && lastPing && (now - lastPing < 120000) && !isExpired && !isBanned;

            if (isBanned) bannedCount++;
            else if (data.device_id) {
                if (isExpired) expiredSubs++;
                else activeSubs++;
                if (isOnline) onlineDevices++;
            }

            const dateStr = data.expires_at && data.expires_at > 0 
                ? new Date(parseInt(data.expires_at)).toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" }) 
                : 'Не активирован';

            let statusHtml = '<span class="status-offline">⚪ Оффлайн</span>';
            if (isBanned) {
                statusHtml = '<span style="color:#e53e3e; font-weight:bold;">● В бане</span>';
            } else if (isOnline) {
                statusHtml = '<span class="status-online">🟢 Онлайн</span>';
            } else if (isExpired && data.device_id) {
                statusHtml = '<span style="color:#e74c3c; font-weight:bold;">⏳ Истек</span>';
            }

            tableRows += `
                <tr>
                    <td>${statusHtml}</td>
                    <td><strong>${data.key_code}</strong></td>
                    <td>${data.device_id ? `<code>${data.device_id}</code>` : '<span style="color:#95a5a6;">Свободен</span>'}</td>
                    <td>${dateStr}</td>
                    <td>
                        <form method="POST" action="/admin/action" style="display:inline;">
                            <input type="hidden" name="key_code" value="${data.key_code}">
                            <button name="action" value="reset" style="background:#3182ce;color:#fff;border:none;padding:5px 9px;border-radius:4px;cursor:pointer;margin-right:3px;">+30 дней</button>
                            ${isBanned 
                                ? '<button name="action" value="unban" style="background:#38a169;color:#fff;border:none;padding:5px 9px;border-radius:4px;cursor:pointer;margin-right:3px;font-weight:bold;">Разбанить</button>' 
                                : '<button name="action" value="ban" style="background:#e53e3e;color:#fff;border:none;padding:5px 9px;border-radius:4px;cursor:pointer;margin-right:3px;">В БАН</button>'
                            }
                            <button name="action" value="delete" style="background:#718096;color:#fff;border:none;padding:5px 9px;border-radius:4px;cursor:pointer;">Удалить</button>
                        </form>
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
            <title>Панель управления Блокером</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background-color: #f4f7f6; padding: 20px; }
                .container { max-width: 1150px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 10px; }
                .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
                .stat-num { font-size: 24px; font-weight: bold; color: #3498db; margin-top: 5px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; font-size: 14px; }
                th { background-color: #3498db; color: white; font-weight: bold; }
                .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; margin-right: 5px; }
                .btn-green { background-color: #2ecc71; }
                .btn-purple { background-color: #9b59b6; }
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
                    <div class="stat-box"><div>Всего ключей</div><div class="stat-num">${allKeys.rows.length}</div></div>
                    <div class="stat-box"><div>⚡ Онлайн</div><div class="stat-num" style="color:#2ecc71;">${onlineDevices}</div></div>
                    <div class="stat-box"><div>✅ Активных</div><div class="stat-num" style="color:#2980b9;">${activeSubs}</div></div>
                    <div class="stat-box"><div>⏳ Истекли</div><div class="stat-num" style="color:#e74c3c;">${expiredSubs}</div></div>
                    <div class="stat-box"><div>🚫 В бане</div><div class="stat-num" style="color:#e53e3e;">${bannedCount}</div></div>
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
                            <th>Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>

            <script>
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

app.post('/admin/action', async (req, res) => {
    const { key_code, action } = req.body;
    try {
        if (action === 'ban') {
            await pool.query("UPDATE blocker_keys SET status = 'banned' WHERE key_code = $1", [key_code]);
        } else if (action === 'unban') {
            await pool.query("UPDATE blocker_keys SET status = 'active' WHERE key_code = $1", [key_code]);
        } else if (action === 'delete') {
            await pool.query("DELETE FROM blocker_keys WHERE key_code = $1", [key_code]);
        } else if (action === 'reset') {
            const newExp = Date.now() + 720 * 3600 * 1000;
            await pool.query("UPDATE blocker_keys SET status = 'active', expires_at = $1 WHERE key_code = $2", [newExp, key_code]);
        }
    } catch (err) {
        console.error(err);
    }
    res.redirect('/admin/view-devices');
});

app.post('/admin/generate', async (req, res) => {
    const { value, label, isHours } = req.body;
    const newKey = generateRandomKeyString();
    let durationMs = isHours ? getHoursMs(value) : getDaysMs(value);

    try {
        await pool.query(
            'INSERT INTO blocker_keys (key_code, duration_ms, expires_at, last_ping, is_generated, label, status) VALUES ($1, $2, 0, 0, TRUE, $3, $4)',
            [newKey, durationMs, label, 'active']
        );
        res.json({ success: true, key: newKey });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер Блокера запущен на порту ${PORT}`));
