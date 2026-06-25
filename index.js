require("dotenv").config();

const httpServer = require("http").createServer();

const io = require("socket.io")(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "https://tok-talk.vercel.app"],
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 80;

const adminCode = process.env.ADMIN_CODE;
const adminUser = new Set();

let players = {};

function updatePlayer(id, data) {
  if (!players[id]) return;
  players[id] = { ...players[id], ...data };
}

function handleMessage(socket, item) {
  const player = players[socket.id];
  if (!player) return;

  const nickname = player?.nickname || "익명";
  const playerId = socket.id;

  const currentMessage = item.message;
  player.currentMessage = currentMessage;

  io.emit("receive message", {
    id: playerId,
    author: nickname,
    message: item.message,
    time: new Date().toLocaleTimeString(),
  });

  // setTimeout(() => {
  //   clearPlayerMessage(playerId);
  // }, 3000);

  if (player.messageTimer) {
    console.log(`🧹 기존 타이머 제거: ${playerId}`);
    clearTimeout(player.messageTimer);
  }

  player.messageTimer = setTimeout(() => {
    if (player.currentMessage === currentMessage) {
      clearPlayerMessage(playerId);
      player.messageTimer = null;
    }
  }, 3000);

  player.isTyping = false;
  socket.broadcast.emit("stopTyping", { id: playerId });
}

function clearPlayerMessage(id) {
  if (!players[id]) return;
  players[id].currentMessage = "";
  io.emit("clear message", { id });
}

io.on("connection", (socket) => {
  players[socket.id] = {
    id: socket.id,
    position: [0, 0, 0],
    rotation: [0, 0, 0, 0],
    isTyping: false,
    currentMessage: "",
  };

  socket.on("enterAdminEnter", (code) => {
    if (code === adminCode) {
      adminUser.add(socket.id);
      socket.emit("adminConfirmed");
    }
  });

  socket.on("adminAction", (data) => {
    if (!adminUser.has(socket.id)) return;
  });

  socket.on("exitAdminMode", () => {
    if (adminUser.has(socket.id)) {
      adminUser.delete(socket.id);
      socket.emit("exitAdminModeConfirmed");
    }
  });

  socket.on("join", ({ nickname }) => {
    if (players[socket.id]) {
      players[socket.id].nickname = nickname;

      socket.emit("currentPlayers", players);

      socket.broadcast.emit("newPlayer", {
        id: socket.id,
        state: players[socket.id],
      });

      io.emit("playerCount", Object.keys(players).length);
    }
  });

  socket.on("updatePlayer", ({ state }) => {
    // 항상 socket.id를 기준으로 저장
    // updatePlayer(socket.id, state);
    // socket.broadcast.emit("updatePlayer", {
    //   id: socket.id,
    //   state: state,
    // });
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...state };
      const { messageTimer, ...safeState } = players[socket.id];
      socket.broadcast.emit("updatePlayer", {
        id: socket.id,
        state: safeState,
      });
    }
  });

  socket.on("nicknameUpdate", ({ nickname }) => {
    if (players[socket.id]) {
      players[socket.id].nickname = nickname;

      socket.broadcast.emit("nicknameUpdate", {
        id: socket.id,
        nickname,
      });
    }
  });

  // 플레이어 접속 종료 처리
  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("removePlayer", socket.id);
    io.emit("playerCount", Object.keys(players).length);
    adminUser.delete(socket.id);
  });

  socket.on("typing", () => {
    if (players[socket.id]) {
      players[socket.id].isTyping = true;
      console.log(players[socket.id]);
      io.emit("typing", { id: socket.id });
    }
  });

  socket.on("stopTyping", () => {
    if (players[socket.id]) {
      players[socket.id].isTyping = false;
      console.log(players[socket.id]);
      io.emit("stopTyping", { id: socket.id });
    }
  });

  // socket.on("send message", (item) => {
  //   const player = players[socket.id];
  //   if (!player) return;

  //   const nickname = player?.nickname || "익명";
  //   const playerId = socket.id;

  //   player.currentMessage = item.message;

  //   io.emit("receive message", {
  //     id: playerId,
  //     author: nickname,
  //     message: item.message,
  //     time: new Date().toLocaleTimeString(),
  //   });

  //   setTimeout(() => {
  //     if (players[playerId]) {
  //       players[playerId].currentMessage = "";
  //     }

  //     io.emit("clear message", { id: playerId });
  //   }, 3000);

  //   player.isTyping = false;
  //   socket.broadcast.emit("stopTyping", { id: playerId });
  // });

  socket.on("send message", (item) => handleMessage(socket, item));
});

httpServer.listen(port, () => {
  console.log("connect", port);
});
