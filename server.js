const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayer = null;
const rooms = {};

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Игрок выбирает режим "Тренировка с ботом"
    socket.on('start_pve', () => {
        // Если этот игрок уже стоял в очереди PvP, убираем его оттуда
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        socket.emit('pve_started', { message: 'Режим тренировки с ботом активирован!' });
        console.log(`Игрок ${socket.id} ушел в PvE с ботом`);
    });

    // Игрок выбирает режим "Сразиться с игроком" (PvP)
    socket.on('start_pvp', () => {
        if (!waitingPlayer) {
            // Если никого нет в очереди, этот игрок становится ждущим
            waitingPlayer = socket;
            socket.emit('game_status', 'Поиск живого соперника...');
        } else if (waitingPlayer !== socket) {
            // Соперник найден! Создаем комнату
            const player1 = waitingPlayer;
            const player2 = socket;
            const roomName = `room_${player1.id}_${player2.id}`;

            player1.join(roomName);
            player2.join(roomName);

            rooms[roomName] = {
                players: [player1.id, player2.id],
                currentTurn: player1.id,
                isPvP: true
            };

            // Если кто-то из них играл с ботом, принудительно переключаем в PvP режим
            io.to(roomName).emit('switch_to_pvp', {
                room: roomName,
                message: 'Соперник найден! Бой начинается.',
                currentTurn: player1.id
            });

            waitingPlayer = null;
        }
    });

    // Обработка хода в PvP
    socket.on('roll_dice', (data) => {
        const room = rooms[data.room];
        if (!room) return;

        if (room.currentTurn !== socket.id) return;

        const nextPlayerId = room.players.find(id => id !== socket.id);
        room.currentTurn = nextPlayerId;

        io.to(data.room).emit('turn_result', {
            rollerId: socket.id,
            result: data.result,
            nextTurn: nextPlayerId
        });
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        // Здесь также можно добавить уведомление оппоненту, если игрок ливнул во время PvP
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
