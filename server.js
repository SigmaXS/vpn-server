const express = require('express');
const app = express();
app.use(express.json());

const ipAttempts = {};
const BLOCK_TIME = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const getDaysMs = (days) => days * 24 * 60 * 60 * 1000;

// ЧЕРНЫЙ СПИСОК УСТРОЙСТВ (Бан по железу)
// Просто добавляйте сюда ID нарушителей в кавычках через запятую
const bannedDevices = [
    "8fa580c215c482fe", // <- Тот самый телефон со скриншота (для примера)
    "еще-один-id-нарушителя",
    "и-еще-один-плохой-парень"
];

// Твоя база ключей
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

// БАЗА ДЛЯ ПРИВЯЗКИ УСТРОЙСТВ
const activeKeys = {};

app.post('/api/activate-key', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = Date.now();
    const dateStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" });

    // Блок по IP за перебор
    if (ipAttempts[ip] && ipAttempts[ip].blockUntil > now) {
        console.log(`🟡 [БЛОК IP] IP: ${ip} временно заблокирован. Время: ${dateStr}`);
        return res.status(429).json({ valid: false, message: "Заблокировано" });
    }

    const { key, deviceId } = req.body;

    // --- ПРОВЕРКА НА БАН ПО ЖЕЛЕЗУ ---
    if (bannedDevices.includes(deviceId)) {
        console.log(`💀 [БАН ПО ЖЕЛЕЗУ] Заблокированное устройство пытается войти! Вор: ${deviceId} | IP: ${ip}`);
        return res.json({ valid: false, expiresAt: 0 }); // Отправляем приложению отказ
    }

    if (keysDatabase.hasOwnProperty(key)) {
        if (ipAttempts[ip]) delete ipAttempts[ip];

        // Логика привязки к телефону
        if (activeKeys.hasOwnProperty(key)) {
            if (activeKeys[key].deviceId === deviceId) {
                const expiresAt = activeKeys[key].expiresAt;
                
                if (now > expiresAt) {
                    console.log(`🔴 [ПРОСРОЧЕН] Ключ: ${key} | Устройство: ${deviceId} | Срок истек`);
                    return res.json({ valid: false, expiresAt: 0 });
                }

                console.log(`🔵 [ПОВТОРНЫЙ ВХОД] Тот же телефон. Ключ: ${key} | Устройство: ${deviceId}`);
                return res.json({ valid: true, expiresAt: expiresAt });
            } else {
                console.log(`⛔ [ПОПЫТКА КРАЖИ] Ключ ${key} привязан к другому устройству! Вор: ${deviceId}`);
                return res.json({ valid: false, expiresAt: 0 });
            }
        } else {
            const durationMs = keysDatabase[key];
            const expiresAt = now + durationMs;

            activeKeys[key] = { deviceId: deviceId, expiresAt: expiresAt };

            const expiresDateStr = new Date(expiresAt).toLocaleString("ru-RU", { timeZone: "Europe/Chisinau" });
            const daysLeft = durationMs / (24 * 60 * 60 * 1000);

            console.log(`🟢 [ПЕРВАЯ АКТИВАЦИЯ] Ключ ${key} НАМЕРТВО ПРИВЯЗАН к: ${deviceId} | На: ${daysLeft} дн. | Истекает: ${expiresDateStr}`);

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

    console.log(`🔴 [ОШИБКА] Неверный ключ: ${key} | Устройство: ${deviceId} | IP: ${ip} | Время: ${dateStr}`);
    return res.json({ valid: false, expiresAt: 0 });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер с БАНОМ ПО ЖЕЛЕЗУ запущен на порту ${PORT}`));
