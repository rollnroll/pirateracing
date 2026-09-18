const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayer = null;
const rooms = {}; // Храним информацию о комнатах и чья сейчас очередь

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    if (!waitingPlayer) {
        waitingPlayer = socket;
        socket.emit('game_status', 'Ожидание второго игрока...');
    } else {
        const roomName = `room_${waitingPlayer.id}_${socket.id}`;
        
        waitingPlayer.join(roomName);
        socket.join(roomName);

        // Создаем состояние комнаты: первый пошел тот, кто ждал
        rooms[roomName] = {
            players: [waitingPlayer.id, socket.id],
            currentTurn: waitingPlayer.id 
        };

        // Первому игроку разрешаем ход, второму — запрещаем
        waitingPlayer.emit('start_game', { room: roomName, message: 'Соперник найден! Ваш ход.', isMyTurn: true });
        socket.emit('start_game', { room: roomName, message: 'Соперник найден! Ждите ход соперника.', isMyTurn: false });

        waitingPlayer = null;
    }

    // Обработка броска кубика с проверкой очереди на сервере
    socket.on('roll_dice', (data) => {
        const room = rooms[data.room];
        if (!room) return;

        // Жесткая проверка: если сейчас не ход этого игрока — игнорируем запрос!
        if (room.currentTurn !== socket.id) {
            return;
        }

        // Меняем очередь на другого игрока в комнате
        const nextPlayerId = room.players.find(id => id !== socket.id);
        room.currentTurn = nextPlayerId;

        // Рассылаем результаты и информацию о том, чей теперь ход, обоим игрокам
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
        // Очистку комнат при отключении можно будет добавить позже
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
