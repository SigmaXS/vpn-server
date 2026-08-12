const express = require('express');
const app = express();
app.use(express.json());

// Ваши нормальные, красивые ключи и их время жизни
const db = {
    // Главный вечный ключ администратора / ваш личный
    "MY-VIP-KEY-2026": 365 * 24 * 60 * 60 * 1000 * 10, // На 10 лет вперед

    // Стандартные рабочие ключи на 30 дней
    "TAXI-PRO-30DAYS-1": 30 * 24 * 60 * 60 * 1000,
    "TAXI-PRO-30DAYS-2": 30 * 24 * 60 * 60 * 1000,

    // Ключи на 7 дней
    "TAXI-PRO-7DAYS-1": 7 * 24 * 60 * 60 * 1000
};

// Хранилище активаций
const activations = {};

app.post('/api/activate-key', (req, res) => {
    const { key } = req.body;
    
    // Если хотите, чтобы приложение принимало ВСЕГДА абсолютно любой текст как рабочий ключ:
    // Просто закомментируйте или удалите блок проверки ниже. 
    // Сейчас здесь настроено так: если ключ есть в базе — проверяем его, 
    // А если вы ввели свой "MY-VIP-KEY-2026" или хотите сделать универсальный вход — даем добро.

    let lifetime = db[key];

    // УНИВЕРСАЛЬНЫЙ СУПЕР-КЛЮЧ: 
    // Если вы в приложении вбьете любое слово или ваш VIP-ключ, сервер сгенерирует доступ до 2099 года!
    if (!lifetime) {
        // Задаем дату окончания: 1 января 2099 года (в миллисекундах)
        const foreverExpires = 4102444800000;
        return res.json({ 
            valid: true, 
            expiresAt: foreverExpires 
        });
    }

    // Стандартная логика для ключей из вашей базы с отсчетом времени
    if (!activations[key]) {
        activations[key] = Date.now() + lifetime;
    }

    const expiresAt = activations[key];

    if (Date.now() > expiresAt) {
        return res.json({ valid: false });
    }

    res.json({ valid: true, expiresAt: expiresAt });
});

// Railway сам назначает порт через process.env.PORT, поэтому используем его:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));