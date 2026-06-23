const { io } = require("socket.io-client");
for(let i=0; i<100; i++) {
  const socket = io("http://localhost:4000");
  socket.on("connect", () => {
    socket.emit("joinLobby", { username: "test", x: 100, y: 100 });
    socket.disconnect();
  });
}
