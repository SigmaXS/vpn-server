const express = require('express');
const app = express();
app.use(express.json());

// База данных ключей и их время жизни в миллисекундах:
const db = {
    // 5 ключей на 1 минуту (60 секунд) - удобно для проверки таймера
    "MIN_KEY_1": 60 * 1000,
    "MIN_KEY_2": 60 * 1000,
    "MIN_KEY_3": 60 * 1000,
    "MIN_KEY_4": 60 * 1000,
    "MIN_KEY_5": 60 * 1000,

    // 5 ключей на 1 день (24 часа)
    "DAY_KEY_1": 24 * 60 * 60 * 1000,
    "DAY_KEY_2": 24 * 60 * 60 * 1000,
    "DAY_KEY_3": 24 * 60 * 60 * 1000,
    "DAY_KEY_4": 24 * 60 * 60 * 1000,
    "DAY_KEY_5": 24 * 60 * 60 * 1000,

    // 5 ключей на 7 дней (неделя)
    "WEEK_KEY_1": 7 * 24 * 60 * 60 * 1000,
    "WEEK_KEY_2": 7 * 24 * 60 * 60 * 1000,
    "WEEK_KEY_3": 7 * 24 * 60 * 60 * 1000,
    "WEEK_KEY_4": 7 * 24 * 60 * 60 * 1000,
    "WEEK_KEY_5": 7 * 24 * 60 * 60 * 1000,

    // 5 ключей на 30 дней (месяц)
    "MONTH_KEY_1": 30 * 24 * 60 * 60 * 1000,
    "MONTH_KEY_2": 30 * 24 * 60 * 60 * 1000,
    "MONTH_KEY_3": 30 * 24 * 60 * 60 * 1000,
    "MONTH_KEY_4": 30 * 24 * 60 * 60 * 1000,
    "MONTH_KEY_5": 30 * 24 * 60 * 60 * 1000
};

// Хранилище активаций (запоминает, когда ключ был активирован впервые)
const activations = {};

app.post('/api/activate-key', (req, res) => {
    const { key } = req.body;
    
    if (!db[key]) {
        return res.json({ valid: false });
    }

    // Если ключ вводят впервые, отсчитываем срок от текущего момента
    if (!activations[key]) {
        activations[key] = Date.now() + db[key];
    }

    const expiresAt = activations[key];

    // Если срок действия истек
    if (Date.now() > expiresAt) {
        return res.json({ valid: false });
    }

    res.json({ valid: true, expiresAt: expiresAt });
});

app.listen(3000, () => console.log('Сервер запущен на порту 3000'));