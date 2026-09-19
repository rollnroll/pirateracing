const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Раздача статического веб-интерфейса из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище очередей поиска и активных комнат
const queues = { 1: [], 2: [], 3: [] };
const rooms = {};

io.on('connection', (socket) => {
    console.log(`[+] Игрок подключился: ${socket.id}`);

    // Поиск игры
    socket.on('start_pvp', (data) => {
        const { mode, betAmount, walletAddress } = data;
        socket.playerData = { mode, betAmount, walletAddress, score: mode === 1 ? 0 : (mode === 2 ? 10 : 100) };

        // Добавляем в очередь выбранного режима
        queues[mode].push(socket);
        socket.emit('game_status', 'Поиск достойного соперника в таверне...');

        // Если набралось 2 игрока в очереди
        if (queues[mode].length >= 2) {
            const p1 = queues[mode].shift();
            const p2 = queues[mode].shift();
            const roomId = `room_${p1.id}_${p2.id}`;

            p1.join(roomId);
            p2.join(roomId);

            rooms[roomId] = {
                players: [p1, p2],
                mode: mode,
                betAmount: betAmount,
                currentTurnIndex: Math.floor(Math.random() * 2), // Случайный первый ход
                scores: { [p1.id]: p1.playerData.score, [p2.id]: p2.playerData.score }
            };

            io.to(roomId).emit('switch_to_pvp', {
                room: roomId,
                betAmount: betAmount,
                currentTurn: rooms[roomId].players[rooms[roomId].currentTurnIndex].id
            });
        }
    });

    // Обработка броска кубиков
    socket.on('roll_dice', (data) => {
        const room = rooms[data.room];
        if (!room) return;

        const activePlayer = room.players[room.currentTurnIndex];
        if (activePlayer.id !== socket.id) return; // Проверка очередности хода

        let diceValues = [];
        let rollSum = 0;

        if (room.mode === 3) {
            // Режим 3: Два кубика
            const d1 = Math.floor(Math.random() * 6) + 1;
            const d2 = Math.floor(Math.random() * 6) + 1;
            diceValues = [d1, d2];
            rollSum = d1 + d2;
        } else {
            // Режимы 1 и 2: Один кубик
            const d1 = Math.floor(Math.random() * 6) + 1;
            diceValues = [d1];
            rollSum = d1;
        }

        // Подсчет счета по правилам режимов
        if (room.mode === 1) {
            room.scores[socket.id] += rollSum;
        } else {
            room.scores[socket.id] = Math.max(0, room.scores[socket.id] - rollSum);
        }

        const isGameOver = room.mode === 1 
            ? (room.scores[p1_id] > 0 && room.scores[p2_id] > 0) // В блице побеждает тот у кого больше за 1 круг
            : (room.scores[socket.id] === 0); // В гонках побеждает тот у кого 0

        // Следующий ход
        const nextTurnIndex = (room.currentTurnIndex + 1) % 2;
        room.currentTurnIndex = nextTurnIndex;

        // Передаем результат броска всем в комнате
        io.to(data.room).emit('turn_result', {
            rollerId: socket.id,
            diceValues: diceValues,
            currentScore: room.scores[socket.id],
            nextTurn: room.players[nextTurnIndex].id
        });

        // Проверка окончания игры
        if (isGameOver) {
            let winnerId = socket.id;
            if (room.mode === 1) {
                const [p1, p2] = room.players;
                if (room.scores[p1.id] < room.scores[p2.id]) winnerId = p2.id;
            }

            io.to(data.room).emit('game_over', { winnerId: winnerId });
            delete rooms[data.room];
        }
    });

    // Обработка отключения
    socket.on('disconnect', () => {
        console.log(`[-] Игрок отключился: ${socket.id}`);
        // Удаление из очередей
        Object.keys(queues).forEach(m => {
            queues[m] = queues[m].filter(s => s.id !== socket.id);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🏴‍☠️ Сервер пиратской дуэли запущен на порту ${PORT}`);
});
