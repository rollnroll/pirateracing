const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Раздаем статические файлы из папки public
app.use(express.static('public'));

let waitingPlayer = null; // Переменная для игрока, который ждет соперника

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Логика поиска соперника (матчмейкинг)
    if (!waitingPlayer) {
        waitingPlayer = socket;
        socket.emit('game_status', 'Ожидание второго игрока...');
    } else {
        // Создаем уникальное имя комнаты для этой пары
        const roomName = `room_${waitingPlayer.id}_${socket.id}`;
        
        waitingPlayer.join(roomName);
        socket.join(roomName);

        // Сообщаем обоим игрокам, что игра началась
        waitingPlayer.emit('start_game', { room: roomName, message: 'Соперник найден! Ваш ход.' });
        socket.emit('start_game', { room: roomName, message: 'Соперник найден! Ждите ход соперника.' });

        console.h = `Создана комната: ${roomName}`;
        waitingPlayer = null; // Сбрасываем очередь
    }

    // Обработка броска кубика
    socket.on('roll_dice', (data) => {
        // Отправляем результат броска только сопернику в этой же комнате
        socket.to(data.room).emit('opponent_rolled', { result: data.result });
    });

    // Обработка отключения игрока
    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Раздаем статические файлы (ваш HTML, CSS и JS) из папки 'public'
app.use(express.static('public'));

// Обработка подключения игроков
io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Когда игрок делает ход
    socket.on('roll_dice', (data) => {
        // Пересылаем ход сопернику
        socket.broadcast.emit('opponent_rolled', data);
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
