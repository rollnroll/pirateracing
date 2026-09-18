const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayer = null;
const rooms = {};
const playerModes = {}; 

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);
    playerModes[socket.id] = 'menu';

    // Выбор режима "Тренировка с ботом"
    socket.on('start_pve', () => {
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        playerModes[socket.id] = 'pve';
        socket.emit('pve_started', { message: 'Режим тренировки с ботом активирован!' });
    });

    // Выбор режима "Сразиться с игроком"
    socket.on('start_pvp', () => {
        // Если игрок уже в очереди или уже ищет, не даем ему стать соперником самому себе
        if (waitingPlayer === socket) return;

        playerModes[socket.id] = 'pvp_waiting';

        if (!waitingPlayer) {
            waitingPlayer = socket;
            socket.emit('game_status', 'Поиск живого соперника...');
        } else {
            // Проверяем, что waitingPlayer всё еще подключен
            const player1 = waitingPlayer;
            const player2 = socket;
            
            if (player1.connected) {
                const roomName = `room_${player1.id}_${player2.id}`;

                player1.join(roomName);
                player2.join(roomName);

                playerModes[player1.id] = 'pvp_playing';
                playerModes[player2.id] = 'pvp_playing';

                rooms[roomName] = {
                    players: [player1.id, player2.id],
                    currentTurn: player1.id
                };

                io.to(roomName).emit('switch_to_pvp', {
                    room: roomName,
                    message: 'Соперник найден! Бой начинается.',
                    currentTurn: player1.id
                });
            }

            // Очищаем очередь в любом случае
            waitingPlayer = null;
        }
    });

    // Бросок кубика в PvP
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

    // Обработка отключения игрока
    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        
        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }

        // Ищем, не был ли игрок в активной комнате PvP
        for (const roomName in rooms) {
            const room = rooms[roomName];
            if (room.players.includes(socket.id)) {
                // Находим второго игрока в комнате
                const opponentId = room.players.find(id => id !== socket.id);
                
                // Уведомляем оппонента об отключении соперника
                io.to(opponentId).emit('opponent_disconnected', {
                    message: 'Соперник отключился от игры.'
                });

                // Удаляем комнату
                delete rooms[roomName];
                break;
            }
        }

        delete playerModes[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
