const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const path = require("path");
const sessions = {}; // Stores session data

app.use(express.static(path.resolve("./public")));

app.get("/", (req, res) => {
  return res.sendFile("./public/index.html");
});

app.get("/host", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "host.html"));
});

app.get("/join", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "join.html"));
});

app.get("/create-session", (req, res) => {
  const sessionId = crypto.randomBytes(16).toString("hex");
  sessions[sessionId] = { clients: [] };
  res.json({ sessionId });
});

app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

io.on("connection", (socket) => {
  const { sessionId, device } = socket.handshake.query;

  if (!sessionId || !sessions[sessionId]) {
    socket.emit("error", "Invalid session ID");
    socket.disconnect();
    return;
  }

  const session = sessions[sessionId];
  socket.device = device; // Track the device
  socket.socketId = socket.id; // Store socket ID for communication

  if (session.clients.length >= 2) {
    socket.emit("error", "Session is full");
    socket.disconnect();
    return;
  }

  session.clients.push(socket);

  // Handle waiting state
  if (session.clients.length < 2) {
    socket.emit("waiting", "Waiting for another client to connect...");
  } else {
    session.clients.forEach((client) => {
      client.emit(
        "start",
        "Another client has connected. You can start chatting."
      );
    });
  }

  if (session.clients.length === 2) {
    console.log(
      `Second device joined, notifying first device with socket ID: ${session.clients[0].socketId}`
    );
    // Notify the first client that the second device has joined
    io.to(session.clients[0].socketId).emit("secondDeviceJoined", {
      message: "A second device has joined the session.",
      sessionId: sessionId,
    });
  }

  socket.on("message", (message) => {
    session.clients.forEach((client) => {
      if (client !== socket) {
        client.send(message);
      }
    });
  });

  socket.on("disconnect", () => {
    // Clear all clients from the session
    session.clients = [];
    // Delete the session itself
    delete sessions[sessionId];
    console.log("Disconnection and Session Deletion Successful");
  });

  socket.on("host-disconnect", (message) => {
    socket.broadcast.emit("notify-host-disconnect", message);
  });

  socket.on("client-disconnect", (message) => {
    socket.broadcast.emit("notify-client-disconnect", message);
  });
});

server.listen(8000, () => {
  console.log("Server is running on http://localhost:8000");
});
