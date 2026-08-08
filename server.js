const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// База ключей
const db = {
    "MIN_KEY_1": 60 * 1000,
    "MIN_KEY_2": 60 * 1000,
    "MIN_KEY_3": 60 * 1000,
    "MIN_KEY_4": 60 * 1000,
    "MIN_KEY_5": 60 * 1000,
    "DAY_KEY_1": 24 * 60 * 60 * 1000,
    "WEEK_KEY_1": 7 * 24 * 60 * 60 * 1000,
    "MONTH_KEY_1": 30 * 24 * 60 * 60 * 1000
};

const activations = {};

app.post('/api/activate-key', (req, res) => {
    const key = req.body.key;
    
    if (!key || !db[key]) {
        return res.status(200).json({ valid: false });
    }

    if (!activations[key]) {
        activations[key] = Date.now() + db[key];
    }

    const expiresAt = activations[key];

    if (Date.now() > expiresAt) {
        return res.status(200).json({ valid: false });
    }

    res.status(200).json({ valid: true, expiresAt: expiresAt });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
