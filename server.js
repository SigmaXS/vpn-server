const express = require('express');
const app = express();
app.use(express.json());

const ipAttempts = {};
const BLOCK_TIME = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const getDaysMs = (days) => days * 24 * 60 * 60 * 1000;

// ЧЕРНЫЙ СПИСОК (Сюда будут попадать забаненные через админку)
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
    const dateStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" });

    if (ipAttempts[ip] && ipAttempts[ip].blockUntil > now) {
        return res.status(429).json({ valid: false, message: "Заблокировано" });
    }

    const { key, deviceId } = req.body;

    // ПРОВЕРКА НА БАН
    if (bannedDevices.includes(deviceId)) {
        console.log(`💀 [БАН] Заблокированное устройство ломится на сервер! ID: ${deviceId}`);
        return res.json({ valid: false, expiresAt: 0 });
    }

    if (keysDatabase.hasOwnProperty(key)) {
        if (ipAttempts[ip]) delete ipAttempts[ip];

        if (activeKeys.hasOwnProperty(key)) {
            if (activeKeys[key].deviceId === deviceId) {
                const expiresAt = activeKeys[key].expiresAt;
                if (now > expiresAt) {
                    console.log(`🔴 [ПРОСРОЧЕН] Ключ: ${key} | Устройство: ${deviceId}`);
                    return res.json({ valid: false, expiresAt: 0 });
                }
                console.log(`🔵 [ПОВТОРНЫЙ ВХОД] Ключ: ${key} | Устройство: ${deviceId}`);
                return res.json({ valid: true, expiresAt: expiresAt });
            } else {
                console.log(`⛔ [ПОПЫТКА КРАЖИ] Ключ ${key} привязан к другому! Вор: ${deviceId}`);
                return res.json({ valid: false, expiresAt: 0 });
            }
        } else {
            const durationMs = keysDatabase[key];
            const expiresAt = now + durationMs;
            activeKeys[key] = { deviceId: deviceId, expiresAt: expiresAt };
            console.log(`🟢 [ПЕРВАЯ АКТИВАЦИЯ] Ключ ${key} привязан к: ${deviceId}`);
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
    console.log(`🔴 [ОШИБКА] Неверный ключ: ${key} | Устройство: ${deviceId}`);
    return res.json({ valid: false, expiresAt: 0 });
});

// ==========================================
//           ИНТЕРАКТИВНАЯ АДМИНКА
// ==========================================

app.get('/admin/view-devices', (req, res) => {
    const total = Object.keys(activeKeys).length;
    
    let html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>Панель управления ключами</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background-color: #f4f7f6; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #3498db; color: white; font-weight: bold; }
            .th-dark { background-color: #2c3e50; }
            .btn { padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; margin-right: 5px; }
            .btn-green { background-color: #2ecc71; }
            .btn-yellow { background-color: #f39c12; }
            .btn-red { background-color: #e74c3c; }
            .badge { background-color: #2ecc71; color: white; padding: 5px 10px; border-radius: 20px; font-size: 14px; }
            code { background: #eee; padding: 4px 8px; border-radius: 4px; color: #d35400; font-family: monospace; font-size: 14px; }
            .gen-panel { display: flex; gap: 10px; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🛠️ Генератор новых ключей</h2>
            <div class="gen-panel">
                <button class="btn btn-green" onclick="generateKey(1)">+ 1 день</button>
                <button class="btn btn-green" onclick="generateKey(3)">+ 3 дня</button>
                <button class="btn btn-green" onclick="generateKey(7)">+ 7 дней</button>
                <button class="btn btn-green" onclick="generateKey(30)">+ 30 дней</button>
            </div>
            ${newlyGeneratedKeys.length > 0 ? `
            <h4>Неактивированные сгенерированные ключи:</h4>
            <ul>
                ${newlyGeneratedKeys.map(k => `<li><code>${k.key}</code> — на ${k.days} дн.</li>`).join('')}
            </ul>
            ` : '<p style="color: #7f8c8d;">Вы еще не создавали новые ключи в этой сессии.</p>'}
        </div>

        <div class="container">
            <h2>🔑 Активированные устройства <span class="badge">Всего: ${total}</span></h2>
            <table>
                <thead>
                    <tr>
                        <th>Ключ</th>
                        <th>ID Устройства</th>
                        <th>Истекает (Время местное)</th>
                        <th>Управление</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const [key, data] of Object.entries(activeKeys)) {
        const dateStr = new Date(data.expiresAt).toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" });
        html += `
                    <tr>
                        <td><strong>${key}</strong></td>
                        <td><code>${data.deviceId}</code></td>
                        <td>${dateStr}</td>
                        <td>
                            <button class="btn btn-yellow" onclick="unbindDevice('${key}')">Отвязать</button>
                            <button class="btn btn-red" onclick="banDevice('${data.deviceId}', '${key}')">Забанить</button>
                        </td>
                    </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>

        <!-- НОВЫЙ БЛОК: ЧЕРНЫЙ СПИСОК -->
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
            async function unbindDevice(key) {
                if(!confirm('Вы уверены, что хотите отвязать телефон от ключа ' + key + '?')) return;
                await fetch('/admin/unbind', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                location.reload();
            }

            async function banDevice(deviceId, key) {
                if(!confirm('ВНИМАНИЕ! Вы навсегда баните телефон ' + deviceId + '. Продолжить?')) return;
                await fetch('/admin/ban', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ deviceId, key }) });
                location.reload();
            }

            // НОВАЯ ФУНКЦИЯ ДЛЯ РАЗБАНА
            async function unbanDevice(deviceId) {
                if(!confirm('Разбанить устройство ' + deviceId + '?')) return;
                await fetch('/admin/unban', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ deviceId }) });
                location.reload();
            }

            async function generateKey(days) {
                await fetch('/admin/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ days }) });
                location.reload();
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// 2. Команды (API) для кнопок админки
app.post('/admin/unbind', (req, res) => {
    const { key } = req.body;
    if (activeKeys[key]) delete activeKeys[key];
    console.log(`[АДМИН] Ключ ${key} принудительно отвязан.`);
    res.json({ success: true });
});

app.post('/admin/ban', (req, res) => {
    const { deviceId, key } = req.body;
    if (!bannedDevices.includes(deviceId)) bannedDevices.push(deviceId);
    if (key && activeKeys[key]) delete activeKeys[key];
    console.log(`[АДМИН] Устройство ${deviceId} отправлено в БАН.`);
    res.json({ success: true });
});

// НОВЫЙ МАРШРУТ ДЛЯ РАЗБАНА
app.post('/admin/unban', (req, res) => {
    const { deviceId } = req.body;
    bannedDevices = bannedDevices.filter(id => id !== deviceId); // Удаляем ID из списка
    console.log(`[АДМИН] Устройство ${deviceId} РАЗБАНЕНО.`);
    res.json({ success: true });
});

app.post('/admin/generate', (req, res) => {
    const { days } = req.body;
    const newKey = generateRandomKeyString();
    keysDatabase[newKey] = getDaysMs(days); 
    newlyGeneratedKeys.push({ key: newKey, days: days }); 
    console.log(`[АДМИН] Создан новый ключ: ${newKey} на ${days} дн.`);
    res.json({ success: true, key: newKey });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер с панелью (включая разбан) запущен на порту ${PORT}`));
