const express = require('express');
const app = express();
app.use(express.json());

// Ваши ключи (можете добавлять сюда любые через запятую)
const validKeys = [
    "MY-VIP-KEY-2026",
    "TAXI-PRO-30DAYS-1",
    "TAXI-PRO-30DAYS-2",
    "TAXI-PRO-7DAYS-1"
];

app.post('/api/activate-key', (req, res) => {
    const { key } = req.body;
    
    // 1 января 2099 года в миллисекундах (вечный доступ)
    const foreverExpires = 4102444800000;

    // Если хотите, чтобы работал ТОЛЬКО список ключей выше:
    // (если введенного ключа нет в списке, вернет valid: false)
    /*
    if (!validKeys.includes(key)) {
        return res.json({ valid: false });
    }
    */

    // А если хотите, чтобы вообще любой ключ из списка (или даже новый) работал:
    return res.json({ 
        valid: true, 
        expiresAt: foreverExpires 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));