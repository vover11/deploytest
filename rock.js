const express = require('express');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const app = express();
const port = 3000;

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

mongoose.connect('mongodb://127.0.0.1:27017/rockpaperscissors', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const { Schema } = mongoose;

const room2Schema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
    },
    participants: [
        {
            player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
            nick: String, // Добавляем поле nick
            stakeAmount: Number,
            choice: { type: String, enum: ['rock', 'paper', 'scissors', 'waiting'], required: false },
        },
    ],
    stake: {
        type: Number,
        required: true,
    },
    availableSpots: {
        type: Number,
        required: true,
    },
});

const Room2 = mongoose.model('Room2', room2Schema);


// Определение модели Player
const playerSchema = new Schema({
    userId: Number,
    nick: String,
    stakes: [
        {
            roomId: { type: Schema.Types.ObjectId, ref: 'Room2' },
            stakeAmount: Number,
            choice: { type: String, enum: ['rock', 'paper', 'scissors','waiting'], required: false }, // Изменили на required: false
        },
    ],
    points: Number,
    currentStep: String,
});

const Player = mongoose.model('Player', playerSchema);

const Winners = mongoose.model('Winner', {
    userId: Number,
    nick: String,
    stakeAmount: Number,
});



// Настройка Telegram Bot
const botToken = '6612857955:AAECtQdvDf8DnsM5BmBRcIjamXmjGEaiffY';
const bot = new TelegramBot(botToken, { polling: true });

// Обработчик кнопки Назад
bot.onText(/Назад/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const user = await Player.findOne({ userId });
    if (!user) {
        bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
        return;
    }

    if (user.currentStep === 'buy_points') {
        await Player.updateOne({ userId }, { $set: { currentStep: 'main' } });
        sendMainKeyboard(chatId);
    }
});

// Функция для отправки клавиатуры с главными действиями
function sendMainKeyboard(chatId) {
    const keyboard = {
        reply_markup: {
            keyboard: [
                ['Играть🕹️'],
                ['Победители🏆'],
                ['Купить поинты💎']
            ],
            one_time_keyboard: false
        }
    };
    bot.sendMessage(chatId, 'Выберите действие:', keyboard);
}
const adminUserIds = ['486479899', '987654321'];

// Обработчик старта игры
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isAdmin = adminUserIds.includes(userId.toString());

    let player = await Player.findOne({ userId });

    if (!player) {
        player = new Player({ userId, nick: msg.from.username, points: 0 });
        await player.save();
    }

    bot.sendMessage(chatId, ` Добро пожаловать, ${player.nick}!
    
    "Соревнуйтесь с друзьями онлайн в классической игре 'Камень, Ножницы, Бумага'! Угадайте их выбор, используйте ловкость и интуицию, чтобы одолеть всех. Присоединяйтесь сейчас и проверьте, кто из вас настоящий мастер в этой захватывающей игре!"`);

    const keyboard = {
        reply_markup: {
            keyboard: [
                ['Играть🕹️'],
                ['Победители🏆'],
                ['Купить поинты💎'],
                isAdmin ? ['Сервисные комнады ⚙️'] : [],
            ],
            one_time_keyboard: false
        }
    };

    bot.sendMessage(chatId, 'Выберите действие:', keyboard);

    // Получите текущий шаг пользователя
    const user = await Player.findOne({ userId });
    if (user) {
        // Установите значение currentStep для главной страницы
        await Player.updateOne({ userId }, { $set: { currentStep: 'main', previousStep: user.currentStep } });
    }
});

bot.onText(/Победители/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const winners = await Winners.find();
        if (winners.length === 0) {
            bot.sendMessage(chatId, 'Пока нет записанных победителей.');
            return;
        }

        const winnersList = await Promise.all(winners.map(async winner => {
            const player = await Player.findOne({ userId: winner.userId });
            return `${winner.nick} - Ставка: ${winner.stakeAmount}`;
        }));

        const formattedWinnersList = winnersList.join('\n');
        bot.sendMessage(chatId, `Список победителей:\n\n${formattedWinnersList}`);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении списка победителей.');
    }
});


// Обработчик кнопки Купить поинты
bot.onText(/Купить поинты/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const player = await Player.findOne({ userId });
    if (!player) {
        bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
        return;
    }

    const keyboard = {
        reply_markup: {
            keyboard: [
                ['1pnt💎', '10pnt💎', '1000pnt💎'],
                ['Назад']
            ],
            one_time_keyboard: false
        }
    };

    bot.sendMessage(chatId, 'Выберите количество поинтов для покупки:', keyboard);

    // Устанавливаем текущий шаг для игрока
    await Player.updateOne({ userId }, { $set: { currentStep: 'buy_points' } });
});

// Обработчик текстовых сообщений для покупки поинтов
bot.onText(/^(1pnt💎|10pnt💎|1000pnt💎)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const pointsAmountText = match[1];

    let pointsAmount;
    if (pointsAmountText === '1pnt💎') {
        pointsAmount = 1;
    } else if (pointsAmountText === '10pnt💎') {
        pointsAmount = 10;
    } else if (pointsAmountText === '1000pnt💎') {
        pointsAmount = 1000;
    } else {
        // Если пришло что-то неожиданное, отправляем сообщение об ошибке
        bot.sendMessage(chatId, 'Произошла ошибка при выборе количества поинтов.');
        return;
    }

    const player = await Player.findOne({ userId });
    if (!player) {
        bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
        return;
    }

    if (player.currentStep !== 'buy_points') {
        // Ничего не делаем, так как текущий шаг не соответствует покупке поинтов
        return;
    }

    // Обновляем количество поинтов игрока
    await Player.updateOne({ userId }, { $inc: { points: pointsAmount } });

    // Получаем актуальное значение баланса после обновления
    const updatedPlayer = await Player.findOne({ userId });

    // Используем актуальное значение баланса
    bot.sendMessage(chatId, `Вы успешно приобрели ${pointsAmount} поинтов. Теперь у вас ${updatedPlayer.points} поинтов.`);
});

function generateRoomId() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 8;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}



bot.onText(/Играть/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const player = await Player.findOne({ userId });

    const keyboard = {
        reply_markup: {
            keyboard: [
                ['Ставка 10', 'Ставка 100', 'Ставка 500'],
                ['Назад']
            ],
            one_time_keyboard: false
        }
    };
    bot.sendMessage(chatId, 'Выберите действие:', keyboard);

});

// Обработчик выбора ставки
bot.onText(/^(Ставка 10|Ставка 100|Ставка 500)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const player = await Player.findOne({ userId });

    if (!player) {
        bot.sendMessage(chatId, 'Сначала начните игру с команды /start.');
        return;
    }

    const stakeText = match[1];
    const stakeAmount = parseInt(stakeText.split(' ')[1]);

    if (player.points < stakeAmount) {
        bot.sendMessage(chatId, 'У вас недостаточно поинтов для выбранной ставки.');
        return;
    }

    const existingStake = player.stakes.find(stake => stake.stakeAmount === stakeAmount);
    if (existingStake) {
        bot.sendMessage(chatId, 'Вы уже сделали ставку на данную сумму.');
        return;
    }

    let room = await Room2.findOne({ stake: stakeAmount, availableSpots: { $gt: 0 } });

    if (!room) {
        room = await Room2.findOne({ stake: stakeAmount, availableSpots: 1 });

        if (room) {
            const existingRoomWithSpot = room.participants.find(p => !p.player && p.stakeAmount === stakeAmount);

            if (existingRoomWithSpot) {
                existingRoomWithSpot.player = player._id;
                existingRoomWithSpot.choice = 'waiting';
            } else {
                room.participants.push({
                    player: player._id,
                    stakeAmount: stakeAmount,
                    choice: 'waiting',
                });
                room.availableSpots -= 1;
            }
        } else {
            room = new Room2({
                roomId: generateRoomId(),
                participants: [{
                    player: player._id,
                    stakeAmount: stakeAmount,
                    choice: 'waiting',
                }],
                stake: stakeAmount,
                availableSpots: 1,
            });
        }
    } else {
        const existingRoomWithSpot = room.participants.find(p => !p.player && p.stakeAmount === stakeAmount);

        if (existingRoomWithSpot) {
            existingRoomWithSpot.player = player._id;
            existingRoomWithSpot.choice = 'waiting';
        } else {
            if (room.availableSpots === 0) {
                bot.sendMessage(chatId, 'В этой комнате уже недостаточно мест. Попробуйте выбрать другую ставку.');
                return;
            }

            room.participants.push({
                player: player._id,
                stakeAmount: stakeAmount,
                choice: 'waiting',
            });
            room.availableSpots -= 1;
        }
    }

    player.stakes.push({
        roomId: room._id,
        stakeAmount: stakeAmount,
    });

    player.points -= stakeAmount;
    await Promise.all([room.save(), player.save()]);

    bot.sendMessage(userId, `С вашего счета списано ${stakeAmount} поинтов. Текущий баланс: ${player.points} поинтов`);

    const options = [
        { text: '🗿 Камень', callback_data: `${room._id} rock` },
        { text: '✂️ Ножницы', callback_data: `${room._id} scissors` },
        { text: '🧻 Бумага', callback_data: `${room._id} paper` },
    ];
    const keyboard = {
        inline_keyboard: [options],
    };

    bot.sendMessage(chatId, `Вы выбрали ставку ${stakeAmount} поинтов. Ожидаем других игроков.`, { reply_markup: keyboard });
});

// Обработчик выбора игроком варианта "камень", "ножницы" или "бумага"
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const [roomId, choice] = query.data.split(' ');

    const player = await Player.findOne({ userId });

    if (!player) {
        bot.sendMessage(chatId, 'Сначала начните игру с команды /start.');
        return;
    }

    const roomChoice = player.stakes.find(stake => stake.roomId.toString() === roomId);
    if (!roomChoice) {
        bot.sendMessage(chatId, 'Вы не можете сделать выбор для этой комнаты.');
        return;
    }

    roomChoice.choice = choice;
    await player.save();

    bot.sendMessage(chatId, `Вы выбрали: ${choice}. Ожидаем выбор оппонента...`);

    const room = await Room2.findById(roomId);

    const participantIndexInRoom = room.participants.findIndex(p => p.player.toString() === player._id.toString());
    if (participantIndexInRoom !== -1) {
        room.participants[participantIndexInRoom].choice = choice;
        room.participants[participantIndexInRoom].nick = player.nick; // Добавляем nick из Player
        await room.save();

        // Обновляем количество доступных мест
        // room.availableSpots -= 1;
        await room.save();
    } else {
        console.log("Ошибка: Игрок не найден в комнате.");
    }

    if (room.participants.every(p => p.stakeAmount && p.choice)) {
        if (room.participants.length !== 2) {
            bot.sendMessage(chatId, 'В комнате должно быть два игрока для начала игры.');
            return;
        }

        const choices = room.participants.map(p => p.choice);

        if (choices.includes('waiting')) {
            bot.sendMessage(chatId, 'Один из игроков еще не сделал выбор. Ожидаем...');
            return;
        }

        let resultMessage = '';
        let winningParticipantIndex;

        if (choices[0] === choices[1]) {
            resultMessage = 'Ничья!';
        } else if (
            (choices[0] === 'rock' && choices[1] === 'scissors') ||
            (choices[0] === 'scissors' && choices[1] === 'paper') ||
            (choices[0] === 'paper' && choices[1] === 'rock')
        ) {
            resultMessage = `${room.participants[0].nick} победил!`; // Используем nick из Room2
            winningParticipantIndex = 0;
        } else {
            resultMessage = `${room.participants[1].nick} победил!`; // Используем nick из Room2
            winningParticipantIndex = 1;
        }

        for (const p of room.participants) {
            const playerToUpdate = await Player.findById(p.player);
            bot.sendMessage(playerToUpdate.userId, resultMessage);
            playerToUpdate.choice = null;
            await playerToUpdate.save();
        }

        if (winningParticipantIndex !== undefined) {
            const winningPlayer = await Player.findById(room.participants[winningParticipantIndex].player);
            if (winningPlayer) {
                winningPlayer.points += room.stake * 2;
                await winningPlayer.save();
                bot.sendMessage(winningPlayer.userId, `Вы выиграли ${room.stake * 2} поинтов. Текущий баланс: ${winningPlayer.points} поинтов`);

                // Сохраняем данные о победителе в базу данных
                await Winners.create({
                    userId: winningPlayer.userId,
                    nick: winningPlayer.nick,
                    stakeAmount: room.stake,
                });
                // Отправляем данные о новой комнате в другой телеграм канал
                await servicecall(room._id, room.participants.map(p => p.nick), room.stake, room.availableSpots,);
            } else {
                console.error(`Ошибка: Игрок с ID ${room.participants[winningParticipantIndex].player} не найден.`);
            }
        }

        // Перед удалением комнаты
        const roomToDelete = await Room2.findById(room._id);

        // Очищаем ставки у всех участников комнаты
        for (const participant of roomToDelete.participants) {
            const playerToUpdate = await Player.findById(participant.player);
            if (playerToUpdate) {
                const stakeIndex = playerToUpdate.stakes.findIndex(stake => stake.roomId.toString() === roomToDelete._id.toString());
                if (stakeIndex !== -1) {
                    playerToUpdate.stakes.splice(stakeIndex, 1); // Удаляем ставку
                    await playerToUpdate.save();
                }
            }
        }

        // Затем удаляем саму комнату
        await Room2.findByIdAndRemove(room._id);
    } else {
        const options = [
            { text: 'Камень', callback_data: `${roomId} rock` },
            { text: 'Ножницы', callback_data: `${roomId} scissors` },
            { text: 'Бумага', callback_data: `${roomId} paper` },
        ];
        const keyboard = {
            inline_keyboard: [options],
        };
        bot.sendMessage(userId, 'Вы еще не сделали выбор. Выберите вариант:', { reply_markup: keyboard });
    }
});
const axios = require('axios');

async function servicecall(roomId, participants, stake, availableSpots) {
    const token = '6612857955:AAECtQdvDf8DnsM5BmBRcIjamXmjGEaiffY'; // Замените на ваш токен бота
    const chatId = '@wintechservice'; // Замените на имя вашего канала

    const message = `Новая комната разграна!\n\nID: ${roomId}\nУчастники: ${participants}\nСтавка: ${stake}\nСвободные места: ${availableSpots}`;

    const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;


    try {
        const response = await axios.post(apiUrl, {
            chat_id: chatId,
            text: message
        });

        console.log('Сообщение отправлено:', response.data);
    } catch (error) {
        console.error('Ошибка при отправке сообщения:', error);
    }
}









// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const TelegramBot = require('node-telegram-bot-api');
// const mongoose = require('mongoose');

// const app = express();
// const port = 3000;

// const dbPath = 'C:/data/db';
// if (!fs.existsSync(dbPath)) {
//     fs.mkdirSync(path.resolve(dbPath), { recursive: true });
// }

// app.use(express.static('C:/Users/Вов/Desktop/MOPRH/Public'));

// app.get('', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));
// });

// app.listen(port, () => {
//     console.log(`Сервер запущен на порту ${port}`);
// });

// mongoose.connect('mongodb://127.0.0.1:27017/rockpaperscissors', {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
// });

// const { Schema } = mongoose;

// const room2Schema = new mongoose.Schema({
//     roomId: {
//         type: String,
//         required: true,
//         unique: true,
//     },
//     participants: [
//         {
//             player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
//             nick: String, // Добавляем поле nick
//             stakeAmount: Number,
//             choice: { type: String, enum: ['rock', 'paper', 'scissors', 'waiting'], required: false },
//         },
//     ],
//     stake: {
//         type: Number,
//         required: true,
//     },
//     availableSpots: {
//         type: Number,
//         required: true,
//     },
// });

// const Room2 = mongoose.model('Room2', room2Schema);


// // Определение модели Player
// const playerSchema = new Schema({
//     userId: Number,
//     nick: String,
//     stakes: [
//         {
//             roomId: { type: Schema.Types.ObjectId, ref: 'Room2' },
//             stakeAmount: Number,
//             choice: { type: String, enum: ['rock', 'paper', 'scissors','waiting'], required: false }, // Изменили на required: false
//         },
//     ],
//     points: Number,
//     currentStep: String,
// });

// const Player = mongoose.model('Player', playerSchema);

// const Winners = mongoose.model('Winner', {
//     userId: Number,
//     nick: String,
//     stakeAmount: Number,
// });



// // Настройка Telegram Bot
// const botToken = '6612857955:AAECtQdvDf8DnsM5BmBRcIjamXmjGEaiffY';
// const bot = new TelegramBot(botToken, { polling: true });

// // Обработчик кнопки Назад
// bot.onText(/Назад/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     const user = await Player.findOne({ userId });
//     if (!user) {
//         bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
//         return;
//     }

//     if (user.currentStep === 'buy_points') {
//         await Player.updateOne({ userId }, { $set: { currentStep: 'main' } });
//         sendMainKeyboard(chatId);
//     }
// });

// // Функция для отправки клавиатуры с главными действиями
// function sendMainKeyboard(chatId) {
//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['Играть🕹️'],
//                 ['Победители🏆'],
//                 ['Купить поинты💎']
//             ],
//             one_time_keyboard: false
//         }
//     };
//     bot.sendMessage(chatId, 'Выберите действие:', keyboard);
// }

// // Обработчик старта игры
// bot.onText(/\/start/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     let player = await Player.findOne({ userId });

//     if (!player) {
//         player = new Player({ userId, nick: msg.from.username, points: 0 });
//         await player.save();
//     }

//     bot.sendMessage(chatId, `Добро пожаловать, ${player.nick}!`);

//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['Играть🕹️'],
//                 ['Победители🏆'],
//                 ['Купить поинты💎'],
//             ],
//             one_time_keyboard: false
//         }
//     };

//     bot.sendMessage(chatId, 'Выберите действие:', keyboard);

//     // Получите текущий шаг пользователя
//     const user = await Player.findOne({ userId });
//     if (user) {
//         // Установите значение currentStep для главной страницы
//         await Player.updateOne({ userId }, { $set: { currentStep: 'main', previousStep: user.currentStep } });
//     }
// });

// bot.onText(/Победители/, async (msg) => {
//     const chatId = msg.chat.id;

//     try {
//         const winners = await Winners.find();
//         if (winners.length === 0) {
//             bot.sendMessage(chatId, 'Пока нет записанных победителей.');
//             return;
//         }

//         const winnersList = await Promise.all(winners.map(async winner => {
//             const player = await Player.findOne({ userId: winner.userId });
//             return `${winner.nick} - Ставка: ${winner.stakeAmount}`;
//         }));

//         const formattedWinnersList = winnersList.join('\n');
//         bot.sendMessage(chatId, `Список победителей:\n\n${formattedWinnersList}`);
//     } catch (error) {
//         console.error(error);
//         bot.sendMessage(chatId, 'Произошла ошибка при получении списка победителей.');
//     }
// });


// // Обработчик кнопки Купить поинты
// bot.onText(/Купить поинты/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     const player = await Player.findOne({ userId });
//     if (!player) {
//         bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
//         return;
//     }

//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['1pnt💎', '10pnt💎', '1000pnt💎'],
//                 ['Назад']
//             ],
//             one_time_keyboard: false
//         }
//     };

//     bot.sendMessage(chatId, 'Выберите количество поинтов для покупки:', keyboard);

//     // Устанавливаем текущий шаг для игрока
//     await Player.updateOne({ userId }, { $set: { currentStep: 'buy_points' } });
// });

// // Обработчик текстовых сообщений для покупки поинтов
// bot.onText(/^(1pnt💎|10pnt💎|1000pnt💎)$/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const pointsAmountText = match[1];

//     let pointsAmount;
//     if (pointsAmountText === '1pnt💎') {
//         pointsAmount = 1;
//     } else if (pointsAmountText === '10pnt💎') {
//         pointsAmount = 10;
//     } else if (pointsAmountText === '1000pnt💎') {
//         pointsAmount = 1000;
//     } else {
//         // Если пришло что-то неожиданное, отправляем сообщение об ошибке
//         bot.sendMessage(chatId, 'Произошла ошибка при выборе количества поинтов.');
//         return;
//     }

//     const player = await Player.findOne({ userId });
//     if (!player) {
//         bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
//         return;
//     }

//     if (player.currentStep !== 'buy_points') {
//         // Ничего не делаем, так как текущий шаг не соответствует покупке поинтов
//         return;
//     }

//     // Обновляем количество поинтов игрока
//     await Player.updateOne({ userId }, { $inc: { points: pointsAmount } });

//     // Получаем актуальное значение баланса после обновления
//     const updatedPlayer = await Player.findOne({ userId });

//     // Используем актуальное значение баланса
//     bot.sendMessage(chatId, `Вы успешно приобрели ${pointsAmount} поинтов. Теперь у вас ${updatedPlayer.points} поинтов.`);
// });

// function generateRoomId() {
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const length = 8;
//     let result = '';
//     for (let i = 0; i < length; i++) {
//         result += characters.charAt(Math.floor(Math.random() * characters.length));
//     }
//     return result;
// }



// bot.onText(/Играть/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     const player = await Player.findOne({ userId });

//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['Ставка 10', 'Ставка 100', 'Ставка 500'],
//                 ['Назад']
//             ],
//             one_time_keyboard: false
//         }
//     };
//     bot.sendMessage(chatId, 'Выберите действие:', keyboard);

// });

// // Обработчик выбора ставки
// bot.onText(/^(Ставка 10|Ставка 100|Ставка 500)$/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const player = await Player.findOne({ userId });

//     if (!player) {
//         bot.sendMessage(chatId, 'Сначала начните игру с команды /start.');
//         return;
//     }

//     const stakeText = match[1];
//     const stakeAmount = parseInt(stakeText.split(' ')[1]);

//     if (player.points < stakeAmount) {
//         bot.sendMessage(chatId, 'У вас недостаточно поинтов для выбранной ставки.');
//         return;
//     }

//     const existingStake = player.stakes.find(stake => stake.stakeAmount === stakeAmount);
//     if (existingStake) {
//         bot.sendMessage(chatId, 'Вы уже сделали ставку на данную сумму.');
//         return;
//     }

//     let room = await Room2.findOne({ stake: stakeAmount, availableSpots: { $gt: 0 } });

//     if (!room) {
//         room = await Room2.findOne({ stake: stakeAmount, availableSpots: 1 });

//         if (room) {
//             const existingRoomWithSpot = room.participants.find(p => !p.player && p.stakeAmount === stakeAmount);

//             if (existingRoomWithSpot) {
//                 existingRoomWithSpot.player = player._id;
//                 existingRoomWithSpot.choice = 'waiting';
//             } else {
//                 room.participants.push({
//                     player: player._id,
//                     stakeAmount: stakeAmount,
//                     choice: 'waiting',
//                 });
//                 room.availableSpots -= 1;
//             }
//         } else {
//             room = new Room2({
//                 roomId: generateRoomId(),
//                 participants: [{
//                     player: player._id,
//                     stakeAmount: stakeAmount,
//                     choice: 'waiting',
//                 }],
//                 stake: stakeAmount,
//                 availableSpots: 1,
//             });
//         }
//     } else {
//         const existingRoomWithSpot = room.participants.find(p => !p.player && p.stakeAmount === stakeAmount);

//         if (existingRoomWithSpot) {
//             existingRoomWithSpot.player = player._id;
//             existingRoomWithSpot.choice = 'waiting';
//         } else {
//             if (room.availableSpots === 0) {
//                 bot.sendMessage(chatId, 'В этой комнате уже недостаточно мест. Попробуйте выбрать другую ставку.');
//                 return;
//             }

//             room.participants.push({
//                 player: player._id,
//                 stakeAmount: stakeAmount,
//                 choice: 'waiting',
//             });
//             room.availableSpots -= 1;
//         }
//     }

//     player.stakes.push({
//         roomId: room._id,
//         stakeAmount: stakeAmount,
//     });

//     player.points -= stakeAmount;
//     await Promise.all([room.save(), player.save()]);

//     bot.sendMessage(userId, `С вашего счета списано ${stakeAmount} поинтов. Текущий баланс: ${player.points} поинтов`);

//     const options = [
//         { text: 'Камень', callback_data: `${room._id} rock` },
//         { text: 'Ножницы', callback_data: `${room._id} scissors` },
//         { text: 'Бумага', callback_data: `${room._id} paper` },
//     ];
//     const keyboard = {
//         inline_keyboard: [options],
//     };

//     bot.sendMessage(chatId, `Вы выбрали ставку ${stakeAmount} поинтов. Ожидаем других игроков.`, { reply_markup: keyboard });
// });

// // Обработчик выбора игроком варианта "камень", "ножницы" или "бумага"
// bot.on('callback_query', async (query) => {
//     const chatId = query.message.chat.id;
//     const userId = query.from.id;
//     const [roomId, choice] = query.data.split(' ');

//     const player = await Player.findOne({ userId });

//     if (!player) {
//         bot.sendMessage(chatId, 'Сначала начните игру с команды /start.');
//         return;
//     }

//     const roomChoice = player.stakes.find(stake => stake.roomId.toString() === roomId);
//     if (!roomChoice) {
//         bot.sendMessage(chatId, 'Вы не можете сделать выбор для этой комнаты.');
//         return;
//     }

//     roomChoice.choice = choice;
//     await player.save();

//     bot.sendMessage(chatId, `Вы выбрали: ${choice}. Ожидаем выбор оппонента...`);

//     const room = await Room2.findById(roomId);

//     const participantIndexInRoom = room.participants.findIndex(p => p.player.toString() === player._id.toString());
//     if (participantIndexInRoom !== -1) {
//         room.participants[participantIndexInRoom].choice = choice;
//         room.participants[participantIndexInRoom].nick = player.nick; // Добавляем nick из Player
//         await room.save();

//         // Обновляем количество доступных мест
//         // room.availableSpots -= 1;
//         await room.save();
//     } else {
//         console.log("Ошибка: Игрок не найден в комнате.");
//     }

//     if (room.participants.every(p => p.stakeAmount && p.choice)) {
//         if (room.participants.length !== 2) {
//             bot.sendMessage(chatId, 'В комнате должно быть два игрока для начала игры.');
//             return;
//         }

//         const choices = room.participants.map(p => p.choice);

//         if (choices.includes('waiting')) {
//             bot.sendMessage(chatId, 'Один из игроков еще не сделал выбор. Ожидаем...');
//             return;
//         }

//         let resultMessage = '';
//         let winningParticipantIndex;

//         if (choices[0] === choices[1]) {
//             resultMessage = 'Ничья!';
//         } else if (
//             (choices[0] === 'rock' && choices[1] === 'scissors') ||
//             (choices[0] === 'scissors' && choices[1] === 'paper') ||
//             (choices[0] === 'paper' && choices[1] === 'rock')
//         ) {
//             resultMessage = `${room.participants[0].nick} победил!`; // Используем nick из Room2
//             winningParticipantIndex = 0;
//         } else {
//             resultMessage = `${room.participants[1].nick} победил!`; // Используем nick из Room2
//             winningParticipantIndex = 1;
//         }

//         for (const p of room.participants) {
//             const playerToUpdate = await Player.findById(p.player);
//             bot.sendMessage(playerToUpdate.userId, resultMessage);
//             playerToUpdate.choice = null;
//             await playerToUpdate.save();
//         }

//         if (winningParticipantIndex !== undefined) {
//             const winningPlayer = await Player.findById(room.participants[winningParticipantIndex].player);
//             if (winningPlayer) {
//                 winningPlayer.points += room.stake * 2;
//                 await winningPlayer.save();
//                 bot.sendMessage(winningPlayer.userId, `Вы выиграли ${room.stake * 2} поинтов. Текущий баланс: ${winningPlayer.points} поинтов`);

//                 // Сохраняем данные о победителе в базу данных
//                 await Winners.create({
//                     userId: winningPlayer.userId,
//                     nick: winningPlayer.nick,
//                     stakeAmount: room.stake,
//                 });
//                 // Отправляем данные о новой комнате в другой телеграм канал
//                 await servicecall(room._id, room.participants.map(p => p.nick), room.stake, room.availableSpots);
//             } else {
//                 console.error(`Ошибка: Игрок с ID ${room.participants[winningParticipantIndex].player} не найден.`);
//             }
//         }

//         // Перед удалением комнаты
//         const roomToDelete = await Room2.findById(room._id);

//         // Очищаем ставки у всех участников комнаты
//         for (const participant of roomToDelete.participants) {
//             const playerToUpdate = await Player.findById(participant.player);
//             if (playerToUpdate) {
//                 const stakeIndex = playerToUpdate.stakes.findIndex(stake => stake.roomId.toString() === roomToDelete._id.toString());
//                 if (stakeIndex !== -1) {
//                     playerToUpdate.stakes.splice(stakeIndex, 1); // Удаляем ставку
//                     await playerToUpdate.save();
//                 }
//             }
//         }

//         // Затем удаляем саму комнату
//         await Room2.findByIdAndRemove(room._id);
//     } else {
//         const options = [
//             { text: 'Камень', callback_data: `${roomId} rock` },
//             { text: 'Ножницы', callback_data: `${roomId} scissors` },
//             { text: 'Бумага', callback_data: `${roomId} paper` },
//         ];
//         const keyboard = {
//             inline_keyboard: [options],
//         };
//         bot.sendMessage(userId, 'Вы еще не сделали выбор. Выберите вариант:', { reply_markup: keyboard });
//     }
// });
// const axios = require('axios');

// async function servicecall(roomId, participants, stake, availableSpots) {
//     const token = '6612857955:AAECtQdvDf8DnsM5BmBRcIjamXmjGEaiffY'; // Замените на ваш токен бота
//     const chatId = '@wintechservice'; // Замените на имя вашего канала

//     const message = `Новая комната создана!\n\nID: ${roomId}\nУчастники: ${participants}\nСтавка: ${stake}\nСвободные места: ${availableSpots}`;

//     const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;


//     try {
//         const response = await axios.post(apiUrl, {
//             chat_id: chatId,
//             text: message
//         });

//         console.log('Сообщение отправлено:', response.data);
//     } catch (error) {
//         console.error('Ошибка при отправке сообщения:', error);
//     }
// }





// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const TelegramBot = require('node-telegram-bot-api');
// const mongoose = require('mongoose');

// const app = express();
// const port = 3000;

// const dbPath = 'C:/data/db';
// if (!fs.existsSync(dbPath)) {
//     fs.mkdirSync(path.resolve(dbPath), { recursive: true });
// }

// app.use(express.static('C:/Users/Вов/Desktop/MOPRH/Public'));

// app.get('', (req, res) => {
//     res.sendFile(path.join(__dirname, 'index.html'));
// });

// app.listen(port, () => {
//     console.log(`Сервер запущен на порту ${port}`);
// });

// mongoose.connect('mongodb://127.0.0.1:27017/rockpaperscissors', {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
// });

// const { Schema } = mongoose;

// const room2Schema = new mongoose.Schema({
//     roomId: {
//         type: String,
//         required: true,
//         unique: true,
//     },
//     participants: [
//         {
//             player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
//             nick: String, // Добавляем поле nick
//             stakeAmount: Number,
//             choice: { type: String, enum: ['rock', 'paper', 'scissors'], required: false },
//         },
//     ],
//     stake: {
//         type: Number,
//         required: true,
//     },
//     availableSpots: {
//         type: Number,
//         required: true,
//     },
// });

// const Room2 = mongoose.model('Room2', room2Schema);


// // Определение модели Player
// const playerSchema = new Schema({
//     userId: Number,
//     nick: String,
//     stakes: [
//         {
//             roomId: { type: Schema.Types.ObjectId, ref: 'Room2' },
//             stakeAmount: Number,
//             choice: { type: String, enum: ['rock', 'paper', 'scissors'], required: false }, // Изменили на required: false
//         },
//     ],
//     points: Number,
//     currentStep: String,
// });

// const Player = mongoose.model('Player', playerSchema);

// const Winners = mongoose.model('Winner', {
//     userId: Number,
//     nick: String,
//     stakeAmount: Number,
// });



// // Настройка Telegram Bot
// const botToken = '6612857955:AAECtQdvDf8DnsM5BmBRcIjamXmjGEaiffY';
// const bot = new TelegramBot(botToken, { polling: true });

// // Обработчик кнопки Назад
// bot.onText(/Назад/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     const user = await Player.findOne({ userId });
//     if (!user) {
//         bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
//         return;
//     }

//     if (user.currentStep === 'buy_points') {
//         await Player.updateOne({ userId }, { $set: { currentStep: 'main' } });
//         sendMainKeyboard(chatId);
//     }
// });

// // Функция для отправки клавиатуры с главными действиями
// function sendMainKeyboard(chatId) {
//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['Играть🕹️'],
//                 ['Победители🏆'],
//                 ['Купить поинты💎']
//             ],
//             one_time_keyboard: false
//         }
//     };
//     bot.sendMessage(chatId, 'Выберите действие:', keyboard);
// }

// // Обработчик старта игры
// bot.onText(/\/start/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     let player = await Player.findOne({ userId });

//     if (!player) {
//         player = new Player({ userId, nick: msg.from.username, points: 0 });
//         await player.save();
//     }

//     bot.sendMessage(chatId, `Добро пожаловать, ${player.nick}!`);

//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['Играть🕹️'],
//                 ['Победители🏆'],
//                 ['Купить поинты💎'],
//             ],
//             one_time_keyboard: false
//         }
//     };

//     bot.sendMessage(chatId, 'Выберите действие:', keyboard);

//     // Получите текущий шаг пользователя
//     const user = await Player.findOne({ userId });
//     if (user) {
//         // Установите значение currentStep для главной страницы
//         await Player.updateOne({ userId }, { $set: { currentStep: 'main', previousStep: user.currentStep } });
//     }
// });

// bot.onText(/Победители/, async (msg) => {
//     const chatId = msg.chat.id;

//     try {
//         const winners = await Winners.find();
//         if (winners.length === 0) {
//             bot.sendMessage(chatId, 'Пока нет записанных победителей.');
//             return;
//         }

//         const winnersList = await Promise.all(winners.map(async winner => {
//             const player = await Player.findOne({ userId: winner.userId });
//             return `${winner.nick} - Ставка: ${winner.stakeAmount}`;
//         }));

//         const formattedWinnersList = winnersList.join('\n');
//         bot.sendMessage(chatId, `Список победителей:\n\n${formattedWinnersList}`);
//     } catch (error) {
//         console.error(error);
//         bot.sendMessage(chatId, 'Произошла ошибка при получении списка победителей.');
//     }
// });


// // Обработчик кнопки Купить поинты
// bot.onText(/Купить поинты/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     const player = await Player.findOne({ userId });
//     if (!player) {
//         bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
//         return;
//     }

//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['1pnt💎', '10pnt💎', '1000pnt💎'],
//                 ['Назад']
//             ],
//             one_time_keyboard: false
//         }
//     };

//     bot.sendMessage(chatId, 'Выберите количество поинтов для покупки:', keyboard);

//     // Устанавливаем текущий шаг для игрока
//     await Player.updateOne({ userId }, { $set: { currentStep: 'buy_points' } });
// });

// // Обработчик текстовых сообщений для покупки поинтов
// bot.onText(/^(1pnt💎|10pnt💎|1000pnt💎)$/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const pointsAmountText = match[1];

//     let pointsAmount;
//     if (pointsAmountText === '1pnt💎') {
//         pointsAmount = 1;
//     } else if (pointsAmountText === '10pnt💎') {
//         pointsAmount = 10;
//     } else if (pointsAmountText === '1000pnt💎') {
//         pointsAmount = 1000;
//     } else {
//         // Если пришло что-то неожиданное, отправляем сообщение об ошибке
//         bot.sendMessage(chatId, 'Произошла ошибка при выборе количества поинтов.');
//         return;
//     }

//     const player = await Player.findOne({ userId });
//     if (!player) {
//         bot.sendMessage(chatId, 'Вы не зарегистрированы. Для начала зарегистрируйтесь.');
//         return;
//     }

//     if (player.currentStep !== 'buy_points') {
//         // Ничего не делаем, так как текущий шаг не соответствует покупке поинтов
//         return;
//     }

//     // Обновляем количество поинтов игрока
//     await Player.updateOne({ userId }, { $inc: { points: pointsAmount } });

//     // Получаем актуальное значение баланса после обновления
//     const updatedPlayer = await Player.findOne({ userId });

//     // Используем актуальное значение баланса
//     bot.sendMessage(chatId, `Вы успешно приобрели ${pointsAmount} поинтов. Теперь у вас ${updatedPlayer.points} поинтов.`);
// });

// function generateRoomId() {
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
//     const length = 8;
//     let result = '';
//     for (let i = 0; i < length; i++) {
//         result += characters.charAt(Math.floor(Math.random() * characters.length));
//     }
//     return result;
// }



// bot.onText(/Играть/, async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;

//     const player = await Player.findOne({ userId });

//     const keyboard = {
//         reply_markup: {
//             keyboard: [
//                 ['Ставка 10', 'Ставка 100', 'Ставка 500'],
//                 ['Назад']
//             ],
//             one_time_keyboard: false
//         }
//     };
//     bot.sendMessage(chatId, 'Выберите действие:', keyboard);

// });

// // Обработчик выбора ставки
// bot.onText(/^(Ставка 10|Ставка 100|Ставка 500)$/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const player = await Player.findOne({ userId });

//     if (!player) {
//         bot.sendMessage(chatId, 'Сначала начните игру с команды /start.');
//         return;
//     }

//     const stakeText = match[1];
//     const stakeAmount = parseInt(stakeText.split(' ')[1]);

//     if (player.points < stakeAmount) {
//         bot.sendMessage(chatId, 'У вас недостаточно поинтов для выбранной ставки.');
//         return;
//     }

//     const existingStake = player.stakes.find(stake => stake.stakeAmount === stakeAmount);
//     if (existingStake) {
//         bot.sendMessage(chatId, 'Вы уже сделали ставку на данную сумму.');
//         return;
//     }

//     let room = await Room2.findOne({ stake: stakeAmount, availableSpots: { $gt: 0 } });

//     if (!room) {
//         room = new Room2({
//             roomId: generateRoomId(),
//             participants: [{ player: player._id, stakeAmount: stakeAmount }],
//             stake: stakeAmount,
//             availableSpots: 2,
//         });
//         await room.save();
//     } else {
//         room.participants.push({ player: player._id, stakeAmount: stakeAmount });
//         room.availableSpots -= 1;
//         await room.save();
//     }

//     player.stakes.push({
//         roomId: room._id,
//         stakeAmount: stakeAmount,
//     });

//     player.points -= stakeAmount;
//     await player.save();

//     bot.sendMessage(userId, `С вашего счета списано ${stakeAmount} поинтов. Текущий баланс: ${player.points} поинтов`);

//     const options = [
//         { text: 'Камень', callback_data: `rock ${stakeAmount}` },
//         { text: 'Ножницы', callback_data: `scissors ${stakeAmount}` },
//         { text: 'Бумага', callback_data: `paper ${stakeAmount}` },
//     ];
//     const keyboard = {
//         inline_keyboard: [options],
//     };

//     bot.sendMessage(chatId, `Вы выбрали ставку ${stakeAmount} поинтов. Ожидаем других игроков.`, { reply_markup: keyboard });
// });

// const axios = require('axios');

// async function servicecall(roomId, participants, stake, availableSpots) {
//     const token = '6612857955:AAECtQdvDf8DnsM5BmBRcIjamXmjGEaiffY'; // Замените на ваш токен бота
//     const chatId = '@wintechservice'; // Замените на имя вашего канала

//     const message = `Новая комната создана!\n\nID: ${roomId}\nУчастники: ${participants}\nСтавка: ${stake}\nСвободные места: ${availableSpots}`;

//     const apiUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}`;


//     try {
//         const response = await axios.post(apiUrl, {
//             chat_id: chatId,
//             text: message
//         });

//         console.log('Сообщение отправлено:', response.data);
//     } catch (error) {
//         console.error('Ошибка при отправке сообщения:', error);
//     }
// }

// // Обработчик выбора игроком варианта "камень", "ножницы" или "бумага"
// bot.on('callback_query', async (query) => {
//     const chatId = query.message.chat.id;
//     const userId = query.from.id;
//     const [choice, stake] = query.data.split(' ');

//     const player = await Player.findOne({ userId });

//     if (!player || !player.stakes.some(s => s.stakeAmount === parseInt(stake))) {
//         bot.sendMessage(chatId, 'Вы не можете сделать выбор, так как не сделали ставку.');
//         return;
//     }

//     const stakeObject = player.stakes.find(s => s.stakeAmount === parseInt(stake));
//     stakeObject.choice = choice;
//     await player.save();

//     bot.sendMessage(chatId, `Вы выбрали: ${choice}. Ожидаем выбор оппонента...`);

//     const room = await Room2.findById(stakeObject.roomId);

//     const participantIndexInRoom = room.participants.findIndex(p => p.player.toString() === player._id.toString());
//     if (participantIndexInRoom !== -1) {
//         room.participants[participantIndexInRoom].choice = choice;
//         room.participants[participantIndexInRoom].nick = player.nick; // Добавляем nick из Player
//         await room.save();

//         // Обновляем количество доступных мест
//         room.availableSpots -= 1;
//         await room.save();
//     } else {
//         console.log("Ошибка: Игрок не найден в комнате.");
//     }


//     if (room.participants.every(p => p.stakeAmount && p.choice)) {
//         if (room.participants.length !== 2) {
//             bot.sendMessage(chatId, 'В комнате должно быть два игрока для начала игры.');
//             return;
//         }

//         const choices = room.participants.map(p => p.choice);

//         if (choices.includes(null)) {
//             bot.sendMessage(chatId, 'Один из игроков еще не сделал выбор. Ожидаем...');
//             return;
//         }

//         let resultMessage = '';
//         let winningParticipantIndex;

//         if (choices[0] === choices[1]) {
//             resultMessage = 'Ничья!';
//         } else if (
//             (choices[0] === 'rock' && choices[1] === 'scissors') ||
//             (choices[0] === 'scissors' && choices[1] === 'paper') ||
//             (choices[0] === 'paper' && choices[1] === 'rock')
//         ) {
//             resultMessage = `${room.participants[0].nick} победил!`; // Используем nick из Room2
//             winningParticipantIndex = 0;
//         } else {
//             resultMessage = `${room.participants[1].nick} победил!`; // Используем nick из Room2
//             winningParticipantIndex = 1;
//         }

//         for (const p of room.participants) {
//             const playerToUpdate = await Player.findById(p.player);
//             bot.sendMessage(playerToUpdate.userId, resultMessage);
//             playerToUpdate.choice = null;
//             await playerToUpdate.save();
//         }

//         if (winningParticipantIndex !== undefined) {
//             const winningPlayer = await Player.findById(room.participants[winningParticipantIndex].player);
//             if (winningPlayer) {
//                 winningPlayer.points += room.stake * 2;
//                 await winningPlayer.save();
//                 bot.sendMessage(winningPlayer.userId, `Вы выиграли ${room.stake * 2} поинтов. Текущий баланс: ${winningPlayer.points} поинтов`);

//                 // Сохраняем данные о победителе в базу данных
//                 await Winners.create({
//                     userId: winningPlayer.userId,
//                     nick: winningPlayer.nick,
//                     stakeAmount: room.stake,
//                 });
//                 // Отправляем данные о новой комнате в другой телеграм канал
//                 await servicecall(room._id, room.participants.map(p => p.nick), room.stake, room.availableSpots);
//             } else {
//                 console.error(`Ошибка: Игрок с ID ${room.participants[winningParticipantIndex].player} не найден.`);
//             }
//         }

//         // Перед удалением комнаты
//         const roomToDelete = await Room2.findById(room._id);

//         // Очищаем ставки у всех участников комнаты
//         for (const participant of roomToDelete.participants) {
//             const playerToUpdate = await Player.findById(participant.player);
//             if (playerToUpdate) {
//                 const stakeIndex = playerToUpdate.stakes.findIndex(stake => stake.roomId.toString() === roomToDelete._id.toString());
//                 if (stakeIndex !== -1) {
//                     playerToUpdate.stakes.splice(stakeIndex, 1); // Удаляем ставку
//                     await playerToUpdate.save();
//                 }
//             }
//         }

//         // Затем удаляем саму комнату
//         await Room2.findByIdAndRemove(room._id);

//     } else {
//         const options = [
//             { text: 'Камень', callback_data: `rock ${stake}` },
//             { text: 'Ножницы', callback_data: `scissors ${stake}` },
//             { text: 'Бумага', callback_data: `paper ${stake}` },
//         ];
//         const keyboard = {
//             inline_keyboard: [options],
//         };
//         bot.sendMessage(userId, 'Вы еще не сделали выбор. Выберите вариант:', { reply_markup: keyboard });
//     }
// });