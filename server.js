const express = require('express');
const app = express();
app.use(express.json());

const ipAttempts = {};
const BLOCK_TIME = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const getDaysMs = (days) => days * 24 * 60 * 60 * 1000;
const getHoursMs = (hours) => hours * 60 * 60 * 1000; // НОВАЯ ФУНКЦИЯ ДЛЯ ЧАСОВ

// ЧЕРНЫЙ СПИСОК 
let bannedDevices = [];

// Ваша база ключей
const keysDatabase = {
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

const activeKeys = {};
const newlyGeneratedKeys = []; 

function generateRandomKeyString() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

app.post('/api/activate-key', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();

    if (ipAttempts[ip] && ipAttempts[ip].blockUntil > now) {
        return res.status(429).json({ valid: false, message: "Заблокировано" });
    }

    const { key, deviceId } = req.body;

    if (bannedDevices.includes(deviceId)) {
        return res.json({ valid: false, expiresAt: 0 });
    }

    if (keysDatabase.hasOwnProperty(key)) {
        if (ipAttempts[ip]) delete ipAttempts[ip];

        const durationMs = keysDatabase[key];

        if (activeKeys.hasOwnProperty(key)) {
            if (!activeKeys[key].deviceId) {
                activeKeys[key].deviceId = deviceId;
                const expiresAt = activeKeys[key].expiresAt;
                activeKeys[key].lastPing = now;
                return res.json({ valid: true, expiresAt: expiresAt });
            }

            if (activeKeys[key].deviceId === deviceId) {
                const expiresAt = activeKeys[key].expiresAt;
                if (now > expiresAt) {
                    return res.json({ valid: false, expiresAt: 0 });
                }
                activeKeys[key].lastPing = now; 
                return res.json({ valid: true, expiresAt: expiresAt });
            } else {
                return res.json({ valid: false, expiresAt: 0 });
            }
        } else {
            // ПЕРВАЯ АКТИВАЦИЯ: отсчет времени начинается прямо сейчас
            const expiresAt = now + durationMs;
            activeKeys[key] = { deviceId: deviceId, expiresAt: expiresAt, lastPing: now }; 
            console.log(`⏱️ [ТРИАЛ/КЛЮЧ АКТИВИРОВАН] Ключ ${key} на ${durationMs / 3600000} ч. привязан к: ${deviceId}`);
            return res.json({ valid: true, expiresAt: expiresAt });
        }
    }

    if (!ipAttempts[ip]) {
        ipAttempts[ip] = { count: 1, blockUntil: 0 };
    } else {
        ipAttempts[ip].count++;
        if (ipAttempts[ip].count >= MAX_ATTEMPTS) {
            ipAttempts[ip].blockUntil = now + BLOCK_TIME;
            ipAttempts[ip].count = 0;
        }
    }
    return res.json({ valid: false, expiresAt: 0 });
});

app.get('/api/check-ban/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    const now = Date.now();
    
    for (const [key, data] of Object.entries(activeKeys)) {
        if (data.deviceId === deviceId) {
            data.lastPing = now; 
            // Проверяем, не истек ли срок триала/подписки прямо во время работы
            if (now > data.expiresAt) {
                return res.status(403).send("EXPIRED");
            }
            break;
        }
    }

    for (const [key, data] of Object.entries(activeKeys)) {
        if (data.deviceId === deviceId && !data.deviceId) {
            return res.status(403).send("RESET");
        }
    }

    if (bannedDevices.includes(deviceId)) {
        return res.status(403).send("BANNED"); 
    }
    
    return res.status(200).send("OK");
});

// АДМИНКА
app.get('/admin/view-devices', (req, res) => {
    const total = Object.keys(activeKeys).length;
    const now = Date.now();
    
    let html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>Панель управления ключами</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background-color: #f4f7f6; padding: 20px; }
            .container { max-width: 1050px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #3498db; color: white; font-weight: bold; }
            .th-dark { background-color: #2c3e50; }
            .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; margin-right: 5px; }
            .btn-green { background-color: #2ecc71; }
            .btn-purple { background-color: #9b59b6; } /* Кнопка для триалов */
            .btn-yellow { background-color: #f39c12; }
            .btn-blue { background-color: #2980b9; }
            .btn-red { background-color: #e74c3c; }
            .badge { background-color: #2ecc71; color: white; padding: 5px 10px; border-radius: 20px; font-size: 14px; }
            code { background: #eee; padding: 4px 8px; border-radius: 4px; color: #d35400; font-family: monospace; font-size: 14px; }
            .gen-panel { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
            .status-online { color: #2ecc71; font-weight: bold; }
            .status-offline { color: #95a5a6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🛠️ Генератор ключей и Триалов</h2>
            <div class="gen-panel">
                <button class="btn btn-purple" onclick="generateKey(0.04, '1 час')">⏱️ Триальный на 1 час</button>
                <button class="btn btn-purple" onclick="generateKey(0.5, '12 часов')">⏱️ Триальный на 12 часов</button>
                <button class="btn btn-green" onclick="generateKey(1, '1 день')">+ 1 день</button>
                <button class="btn btn-green" onclick="generateKey(7, '7 дней')">+ 7 дней</button>
                <button class="btn btn-green" onclick="generateKey(30, '30 дней')">+ 30 дней</button>
            </div>
            ${newlyGeneratedKeys.length > 0 ? `
            <h4>Созданные в этой сессии:</h4>
            <ul>
                ${newlyGeneratedKeys.map(k => `<li><code>${k.key}</code> — (${k.label})</li>`).join('')}
            </ul>
            ` : ''}
        </div>

        <div class="container">
            <h2>🔑 Активированные устройства <span class="badge">Всего: ${total}</span></h2>
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
    `;

    for (const [key, data] of Object.entries(activeKeys)) {
        const dateStr = new Date(data.expiresAt).toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" });
        
        let statusHtml = '<span class="status-offline">⚪ Оффлайн</span>';
        if (data.deviceId && data.lastPing && (now - data.lastPing < 120000)) {
            statusHtml = '<span class="status-online">🟢 Онлайн</span>';
        }

        html += `
                    <tr>
                        <td>${statusHtml}</td>
                        <td><strong>${key}</strong></td>
                        <td>${data.deviceId ? `<code>${data.deviceId}</code>` : '<span style="color:#e74c3c;">Сброшен (ждет переноса)</span>'}</td>
                        <td>${dateStr}</td>
                        <td>
                            <button class="btn btn-blue" onclick="resetDevice('${key}')">Сбросить</button>
                            <button class="btn btn-yellow" onclick="unbindDevice('${key}')">Отвязать</button>
                            ${data.deviceId ? `<button class="btn btn-red" onclick="banDevice('${data.deviceId}', '${key}')">В БАН</button>` : ''}
                        </td>
                    </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>

        <div class="container">
            <h2>💀 Черный список (Забаненные устройства)</h2>
            ${bannedDevices.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th class="th-dark">ID Устройства</th>
                        <th class="th-dark">Управление</th>
                    </tr>
                </thead>
                <tbody>
                    ${bannedDevices.map(id => `
                    <tr>
                        <td><code>${id}</code></td>
                        <td>
                            <button class="btn btn-green" onclick="unbanDevice('${id}')">Разбанить</button>
                        </td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : '<p style="color: #7f8c8d;">Черный список пуст.</p>'}
        </div>

        <script>
            async function resetDevice(key) {
                if(!confirm('Сбросить привязку для ключа ' + key + '?')) return;
                await fetch('/admin/reset', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                location.reload();
            }
            async function unbindDevice(key) {
                if(!confirm('Удалить активацию ключа ' + key + '?')) return;
                await fetch('/admin/unbind', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                location.reload();
            }
            async function banDevice(deviceId, key) {
                if(!confirm('ВНИМАНИЕ! Баним устройство ' + deviceId)) return;
                await fetch('/admin/ban', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ deviceId, key }) });
                location.reload();
            }
            async function unbanDevice(deviceId) {
                if(!confirm('Разбанить устройство ' + deviceId + '?')) return;
                await fetch('/admin/unban', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ deviceId }) });
                location.reload();
            }
            async function generateKey(value, label) {
                await fetch('/admin/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ value, label }) });
                location.reload();
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/admin/reset', (req, res) => {
    const { key } = req.body;
    if (activeKeys[key]) {
        activeKeys[key].deviceId = null; 
    }
    res.json({ success: true });
});

app.post('/admin/unbind', (req, res) => {
    const { key } = req.body;
    if (activeKeys[key]) delete activeKeys[key];
    res.json({ success: true });
});

app.post('/admin/ban', (req, res) => {
    const { deviceId, key } = req.body;
    if (deviceId && !bannedDevices.includes(deviceId)) bannedDevices.push(deviceId);
    if (key && activeKeys[key]) delete activeKeys[key];
    res.json({ success: true });
});

app.post('/admin/unban', (req, res) => {
    const { deviceId } = req.body;
    bannedDevices = bannedDevices.filter(id => id !== deviceId); 
    res.json({ success: true });
});

// НОВЫЙ ГЕНЕРАТОР (ПОДДЕРЖИВАЕТ ЧАСЫ И ДНИ)
app.post('/admin/generate', (req, res) => {
    const { value, label } = req.body;
    const newKey = generateRandomKeyString();
    
    // Если value меньше 1, значит это часы (например, 0.04 часа ≈ 1 час, или 0.5 часа = 30 минут)
    // Но для простоты: если передано меньше 1, считаем что это доля дня или часы
    // Давайте сделаем точнее: если value < 1, переводим в часы. 0.0416 * 24 ≈ 1 час. 
    // Сделаем проще: передавать прямо миллисекунды или обрабатывать по условию.
    
    let durationMs;
    if (value < 1) {
        // Значит это часы (например, 1 час = getHoursMs(1), 12 часов = getHoursMs(12))
        // В кнопках ниже мы передадим количество часов прямо в value
        durationMs = getHoursMs(value); 
    } else {
        durationMs = getDaysMs(value);
    }

    keysDatabase[newKey] = durationMs; 
    newlyGeneratedKeys.push({ key: newKey, label: label }); 
    console.log(`[АДМИН] Создан триал/ключ: ${newKey} на ${label}`);
    res.json({ success: true, key: newKey });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер с триалами запущен на порту ${PORT}`));
