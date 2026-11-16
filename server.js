
require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Database("cidade.db");

const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  throw new Error("Configure JWT_SECRET nas variáveis do servidor.");
}

app.use(express.json());
app.use(express.static("public"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  user_id INTEGER PRIMARY KEY,
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS houses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  x REAL DEFAULT 0,
  z REAL DEFAULT 0
);
`);

function token(user) {
  return jwt.sign(user, SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    req.user = jwt.verify(header.replace("Bearer ", ""), SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Faça login novamente." });
  }
}

function creator(req, res, next) {
  if (!req.user.creator) {
    return res.status(403).json({ error: "Acesso exclusivo dos criadores." });
  }
  next();
}

// CADASTRO
app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!/^@[a-z0-9_.]{3,30}$/.test(username)) {
      return res.status(400).json({ error: "Nome de usuário inválido." });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Senha muito curta." });
    }

    const hash = await bcrypt.hash(password, 12);

    db.prepare(
      "INSERT INTO users (username, password) VALUES (?, ?)"
    ).run(username, hash);

    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Usuário já cadastrado." });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const user = db.prepare(
    "SELECT * FROM users WHERE username = ?"
  ).get(username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Login inválido." });
  }

  res.json({
    success: true,
    token: token({ id: user.id, username: user.username }),
    username: user.username
  });
});

// LOGIN DOS CRIADORES
app.post("/api/creator-login", (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");

  const creators = [
    {
      username: process.env.CREATOR1_USER,
      password: process.env.CREATOR1_PASSWORD
    },
    {
      username: process.env.CREATOR2_USER,
      password: process.env.CREATOR2_PASSWORD
    }
  ];

  const found = creators.find(
    c => c.username && c.password &&
      c.username === username && c.password === password
  );

  if (!found) {
    return res.status(401).json({ error: "Acesso negado." });
  }

  res.json({
    success: true,
    token: token({ id: 0, username, creator: true })
  });
});

// PEDIR AUTORIZAÇÃO PARA COLOCAR CASA
app.post("/api/follow-request", auth, (req, res) => {
  db.prepare(`
    INSERT INTO requests (user_id, status)
    VALUES (?, 'pending')
    ON CONFLICT(user_id)
    DO UPDATE SET status = 'pending'
  `).run(req.user.id);

  res.json({ success: true, status: "pending" });
});

// CONSULTAR AUTORIZAÇÃO
app.get("/api/follow-status", auth, (req, res) => {
  const result = db.prepare(
    "SELECT status FROM requests WHERE user_id = ?"
  ).get(req.user.id);

  res.json({ status: result?.status || "not_requested" });
});

// COLOCAR OU ATUALIZAR CASA
app.post("/api/house", auth, (req, res) => {
  const request = db.prepare(
    "SELECT status FROM requests WHERE user_id = ?"
  ).get(req.user.id);

  if (!request || request.status !== "approved") {
    return res.status(403).json({
      error: "Aguarde a aprovação dos criadores."
    });
  }

  db.prepare(`
    INSERT INTO houses (user_id, x, z)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET x = excluded.x, z = excluded.z
  `).run(
    req.user.id,
    Number(req.body.x) || 0,
    Number(req.body.z) || 0
  );

  res.json({ success: true });
});

// LISTAR CASAS
app.get("/api/houses", (req, res) => {
  const houses = db.prepare(`
    SELECT houses.id, houses.x, houses.z, users.username
    FROM houses
    JOIN users ON users.id = houses.user_id
  `).all();

  res.json(houses);
});

// LISTAR PEDIDOS PARA OS CRIADORES
app.get("/api/creator/requests", auth, creator, (req, res) => {
  const requests = db.prepare(`
    SELECT requests.user_id, requests.status, users.username
    FROM requests
    JOIN users ON users.id = requests.user_id
  `).all();

  res.json(requests);
});

// APROVAR OU RECUSAR PEDIDO
app.post("/api/creator/requests/:id", auth, creator, (req, res) => {
  const status = req.body.status;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status inválido." });
  }

  db.prepare(
    "UPDATE requests SET status = ? WHERE user_id = ?"
  ).run(status, Number(req.params.id));

  res.json({ success: true });
});

// CONSTRUÇÕES DOS CRIADORES
app.post("/api/creator/build", auth, creator, (req, res) => {
  const { type, x, z } = req.body;

  if (!["house", "building", "tree", "road"].includes(type)) {
    return res.status(400).json({ error: "Tipo inválido." });
  }

  res.json({
    success: true,
    construction: { type, x: Number(x) || 0, z: Number(z) || 0 }
  });
});

// MULTIJOGADOR
const players = {};

io.on("connection", socket => {
  socket.on("join", data => {
    players[socket.id] = {
      username: String(data?.username || "Jogador").slice(0, 30),
      x: 0,
      y: 0,
      z: 0
    };

    socket.emit("players", players);

    socket.broadcast.emit("playerJoined", {
      id: socket.id,
      ...players[socket.id]
    });
  });

  socket.on("move", position => {
    if (!players[socket.id]) return;

    players[socket.id].x = Number(position.x) || 0;
    players[socket.id].y = Number(position.y) || 0;
    players[socket.id].z = Number(position.z) || 0;

    socket.broadcast.emit("playerMoved", {
      id: socket.id,
      ...players[socket.id]
    });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cidade Nova 3D rodando na porta ${PORT}`);
});
