const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Разделяем очереди по величинам ставок (в TON / nanoTON)
const matchmakingQueues = {}; 
const rooms = {};

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Инициализация профиля подключенного клиента
    socket.userData = {
        walletAddress: null,
        room: null
    };

    // Привязка TON-кошелька при авторизации Web3
    socket.on('register_wallet', (data) => {
        socket.userData.walletAddress = data.walletAddress;
    });

    // Поиск соперника с учетом выбранной ставки
    socket.on('start_pvp', (data) => {
        const betAmount = data.betAmount || 0; // Размер ставки (например, 1 TON)

        if (socket.userData.room) return; // Уже в игре

        if (!matchmakingQueues[betAmount]) {
            matchmakingQueues[betAmount] = [];
        }

        const queue = matchmakingQueues[betAmount];

        // Проверяем, нет ли игрока уже в очереди
        if (queue.includes(socket)) return;

        if (queue.length === 0) {
            queue.push(socket);
            socket.emit('game_status', `Поиск соперника на ставку ${betAmount} TON...`);
        } else {
            const opponent = queue.shift();

            if (!opponent.connected) {
                queue.push(socket);
                return;
            }

            const roomName = `room_${opponent.id}_${socket.id}`;
            
            opponent.join(roomName);
            socket.join(roomName);

            opponent.userData.room = roomName;
            socket.userData.room = roomName;

            rooms[roomName] = {
                players: [
                    { id: opponent.id, wallet: opponent.userData.walletAddress, progress: 0 },
                    { id: socket.id, wallet: socket.userData.walletAddress, progress: 0 }
                ],
                betAmount: betAmount,
                status: 'waiting_bets' // Ожидаем подтверждения транзакций из блокчейна
            };

            // Отправляем клиентам данные для оплаты ставки через TON Connect
            io.to(roomName).emit('match_found', {
                room: roomName,
                betAmount: betAmount,
                message: 'Соперник найден! Подтвердите транзакцию ставки в кошельке.'
            });
        }
    });

    // Действие в гонке (нажатие газ/переключение передач)
    socket.on('player_action', (data) => {
        const room = rooms[socket.userData.room];
        if (!room || room.status !== 'racing') return;

        // Сервер сам рассчитывает ускорение вместо того, чтобы верить клиенту
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.progress += Math.floor(Math.random() * 10) + 5; // Пример механики продвижения

            // Транслируем обновленные позиции обоим участникам
            io.to(socket.userData.room).emit('race_update', {
                players: room.players.map(p => ({ id: p.id, progress: p.progress }))
            });

            // Проверка финиша
            if (player.progress >= 100) {
                room.status = 'finished';
                io.to(socket.userData.room).emit('race_finished', {
                    winnerId: socket.id,
                    winnerWallet: player.wallet
                });
                
                // TODO: Вызов метода смарт-контракта или выдача подписи для TON Escrow
            }
        }
    });

    // Обработка дисконнекта
    socket.on('disconnect', () => {
        console.log(`Отключился: ${socket.id}`);

        // Очищаем из очередей ожидания
        for (const bet in matchmakingQueues) {
            matchmakingQueues[bet] = matchmakingQueues[bet].filter(s => s !== socket);
        }

        // Техническое поражение при выходе из активной комнаты
        const roomName = socket.userData.room;
        if (roomName && rooms[roomName]) {
            const room = rooms[roomName];
            const opponent = room.players.find(p => p.id !== socket.id);

            if (opponent && room.status === 'racing') {
                io.to(opponent.id).emit('opponent_disconnected', {
                    message: 'Соперник покинул заезд. Вам зачислена победа!',
                    winnerWallet: opponent.wallet
                });
            }
            delete rooms[roomName];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
