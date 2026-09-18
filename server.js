const express = require('express');
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
