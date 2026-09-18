const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayer = null;
const rooms = {};
const activePlayers = new Set(); // Список всех подключенных игроков

// Функция для обновления статуса доступности PvE для всех клиентов
defUpdatePvEStatus = () => {
    const totalPlayers = activePlayers.size;
    // Если игроков 2 или больше, блокируем PvE у всех
    const shouldLockPvE = totalPlayers >= 2;
    io.emit('lock_pve', shouldLockPvE);
};

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);
    activePlayers.add(socket.id);
    
    // Сразу проверяем состояние для нового игрока
    defUpdatePvEStatus();

    // Запуск PvE (тренировка с ботом)
    socket.on('start_pve', () => {
        // Защита: если вдруг игроков стало >= 2, не пускаем в PvE
        if (activePlayers.size >= 2) return;

        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        socket.emit('pve_started', { message: 'Режим тренировки с ботом активирован!' });
    });

    // Нажатие на кнопку PvP (или автоматический перевод)
    socket.on('start_pvp', () => {
        // Если игрок сидел в PvE и нажал PvP (или сервер его переключил)
        if (!waitingPlayer) {
            waitingPlayer = socket;
            socket.emit('game_status', 'Поиск живого соперника...');
        } else if (waitingPlayer !== socket) {
            const player1 = waitingPlayer; // Тот, кто ждал (возможно, играл с ботом)
            const player2 = socket;       // Тільки что вошедший игрок
            const roomName = `room_${player1.id}_${player2.id}`;

            player1.join(roomName);
            player2.join(roomName);

            rooms[roomName] = {
                players: [player1.id, player2.id],
                currentTurn: player1.id
            };

            // Перенаправляем обоих в комнату PvP
            io.to(roomName).emit('switch_to_pvp', {
                room: roomName,
                message: 'Соперник найден! Бой начинается.',
                currentTurn: player1.id
            });

            waitingPlayer = null;
        }
    });

    // Если первый игрок играет в PvE, а второй зашел и нажал PvP
    socket.on('force_pvp_from_pve', () => {
        // Если на сервере есть игрок, который тренируется с ботом (он первый в activePlayers)
        const playersArray = Array.from(activePlayers);
        const otherPlayerId = playersArray.find(id => id !== socket.id);

        if (otherPlayerId) {
            const otherSocket = io.sockets.sockets.get(otherPlayerId);
            if (otherSocket) {
                // Принудительно вызываем для первого игрока логику старта PvP с новым игроком
                waitingPlayer = otherSocket;
                socket.emit('start_pvp');
                // Вызываем start_pvp для воссоздания пары через стандартную логику
                otherSocket.emit('force_switch_to_pvp_trigger'); 
            }
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
        activePlayers.delete(socket.id);
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        defUpdatePvEStatus();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
