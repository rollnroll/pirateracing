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

    // Если уже кто-то ждет PvP, сразу скажем новому игроку заблокировать PvE
    if (waitingPlayer) {
        socket.emit('lock_pve', true);
    }

    socket.on('start_pve', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        socket.emit('pve_started', { message: 'Режим тренировки с ботом активирован!' });
    });

    socket.on('start_pvp', () => {
        if (!waitingPlayer) {
            waitingPlayer = socket;
            // Уведомляем ВСЕХ остальных, что кто-то встал в очередь PvP -> блокируем им PvE
            socket.broadcast.emit('lock_pve', true);
            socket.emit('game_status', 'Поиск живого соперника...');
        } else if (waitingPlayer !== socket) {
            const player1 = waitingPlayer;
            const player2 = socket;
            const roomName = `room_${player1.id}_${player2.id}`;

            player1.join(roomName);
            player2.join(roomName);

            rooms[roomName] = {
                players: [player1.id, player2.id],
                currentTurn: player1.id
            };

            // Соперник найден, сбрасываем блокировку PvE для остальных (если они появятся)
            io.to(roomName).emit('switch_to_pvp', {
                room: roomName,
                message: 'Соперник найден! Бой начинается.',
                currentTurn: player1.id
            });

            waitingPlayer = null;
            // Разблокируем PvE для остальных, так как очередь опустела
            io.emit('lock_pve', false);
        }
    });

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
            // Если ждущий ливнул, разрешаем остальным снова играть с ботом
            io.emit('lock_pve', false);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
