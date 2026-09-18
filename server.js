const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let waitingPlayer = null;
const rooms = {};
const playerModes = {}; // 'menu', 'pve', 'pvp_waiting', 'pvp_playing'

function broadcastGlobalState() {
    const totalPlayers = io.engine.clientsCount;
    const disablePve = totalPlayers > 1 || waitingPlayer !== null;

    io.emit('global_state', {
        totalPlayers: totalPlayers,
        disablePve: disablePve,
        waitingCount: waitingPlayer ? 1 : 0
    });
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);
    playerModes[socket.id] = 'menu';
    broadcastGlobalState();

    socket.on('start_pve', () => {
        if (io.engine.clientsCount > 1 && waitingPlayer !== null) return;

        if (waitingPlayer === socket) {
            waitingPlayer = null;
        }
        playerModes[socket.id] = 'pve';
        socket.emit('pve_started', { message: 'Режим тренировки с ботом активирован! Соперник может найтись в любой момент.' });
        
        broadcastGlobalState();
    });

    socket.on('start_pvp', () => {
        if (waitingPlayer === socket) return;

        // Если есть игрок в очереди и он не равен текущему
        if (waitingPlayer && waitingPlayer !== socket && waitingPlayer.connected) {
            const player1 = waitingPlayer;
            const player2 = socket;
            
            startPvPGame(player1, player2);
            waitingPlayer = null;
        } else {
            // Ищем любого другого игрока на сервере (например, того кто сидит в PvE или в меню)
            const allSockets = Array.from(io.sockets.sockets.values());
            const opponent = allSockets.find(s => s.id !== socket.id);

            if (opponent) {
                // Если кто-то нашлся, устраиваем им дуэль прямо из PvE/меню
                startPvPGame(opponent, socket);
                if (waitingPlayer === opponent) {
                    waitingPlayer = null;
                }
            } else {
                // Если вообще никого больше нет
                waitingPlayer = socket;
                playerModes[socket.id] = 'pvp_waiting';
                socket.emit('game_status', 'Поиск живого соперника...');
            }
        }
        broadcastGlobalState();
    });

    function startPvPGame(player1, player2) {
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

        for (const roomName in rooms) {
            const room = rooms[roomName];
            if (room.players.includes(socket.id)) {
                const opponentId = room.players.find(id => id !== socket.id);
                
                io.to(opponentId).emit('opponent_disconnected', {
                    message: 'Соперник отключился от игры.'
                });

                delete rooms[roomName];
                break;
            }
        }

        delete playerModes[socket.id];
        broadcastGlobalState();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
