
const express = require('express');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const bodyParser = require('body-parser'); // Middleware для разбора входящих данных
const axios = require('axios');



const app = express();
const port = 3030;

app.use(express.static('public'));

const dbPath = 'C:/data/db';
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.resolve(dbPath), { recursive: true });
}

app.use(express.static('C:/Users/Вов/Desktop/MOPRH/Public'));

app.get('', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
});


mongoose.connect('mongodb://127.0.0.1:27017/games', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})

// .catch((error) => {
//     console.error('Ошибка при подключении к базе данных:', error);
// });

const { Schema } = mongoose;



// Настройка Telegram Bot
const botToken = '6661495971:AAHktGgjEN897bj8Mr4R7n44ayUq42jWKJQ';
const bot = new TelegramBot(botToken, { polling: true });
const webappurl = 'http://192.168.1.6:3030'; // Замените на URL вашего веб-приложения



bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await bot.sendMessage(chatId, 'Добро пожаловать! Откройте веб-приложение:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Открыть веб-приложение', url: webappurl }]
                ]
            }
        });
    } catch (e) {
        console.log(e);
    }
});

