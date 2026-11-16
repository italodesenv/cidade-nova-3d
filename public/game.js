
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const menu = document.getElementById("menu");
const game = document.getElementById("game");
const message = document.getElementById("message");

const socket = window.io();

let token = "";
let username = "";
let scene, camera, renderer, player;
let droneMode = false;
let keys = {};
let remotePlayers = {};

const clock = new THREE.Clock();

function showMessage(text) {
  message.textContent = text;
}

async function api(path, data = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Erro na solicitação.");
  }

  return result;
}

document.getElementById("showRegister").onclick = () => {
  document.getElementById("login").hidden = true;
  document.getElementById("register").hidden = false;
  showMessage("");
};

document.getElementById("showLogin").onclick = () => {
  document.getElementById("register").hidden = true;
  document.getElementById("login").hidden = false;
  showMessage("");
};

document.getElementById("registerButton").onclick = async () => {
  try {
    const result = await api("/api/register", {
      username: document.getElementById("registerUser").value,
      password: document.getElementById("registerPass").value
    });

    showMessage("Conta criada! Agora faça login.");
    document.getElementById("register").hidden = true;
    document.getElementById("login").hidden = false;
  } catch (error) {
    showMessage(error.message);
  }
};

document.getElementById("loginButton").onclick = async () => {
  try {
    const result = await api("/api/login", {
      username: document.getElementById("loginUser").value,
      password: document.getElementById("loginPass").value
    });

    token = result.token;
    username = result.username;

    menu.hidden = true;
    game.hidden = false;

    document.getElementById("playerName").textContent = username;

    startGame();
  } catch (error) {
    showMessage(error.message);
  }
};

document.getElementById("logoutButton").onclick = () => {
  socket.disconnect();
  location.reload();
};

function makeBuilding(x, z, width, height, depth, color) {
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color })
  );

  building.position.set(x, height / 2, z);
  scene.add(building);
}

function createCity() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x56a65c })
  );

  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x333b46
  });

  for (let i = -100; i <= 100; i += 40) {
    const road1 = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.1, 500),
      roadMaterial
    );

    road1.position.set(i, 0.06, 0);
    scene.add(road1);

    const road2 = new THREE.Mesh(
      new THREE.BoxGeometry(500, 0.1, 14),
      roadMaterial
    );

    road2.position.set(0, 0.06, i);
    scene.add(road2);
  }

  const colors = [
    0xe9c46a,
    0xf4a261,
    0x8ecae6,
    0xcdb4db,
    0xffffff
  ];

  for (let x = -80; x <= 80; x += 40) {
    for (let z = -80; z <= 80; z += 40) {
      makeBuilding(
        x + 10,
        z + 10,
        13,
        9 + Math.random() * 10,
        13,
        colors[Math.floor(Math.random() * colors.length)]
      );
    }
  }

  // Árvores
  for (let i = 0; i < 35; i++) {
    const x = Math.random() * 240 - 120;
    const z = Math.random() * 240 - 120;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 3),
      new THREE.MeshStandardMaterial({ color: 0x75452b })
    );

    trunk.position.set(x, 1.5, z);
    scene.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x168b43 })
    );

    leaves.position.set(x, 4, z);
    scene.add(leaves);
  }
}

function createPlayer() {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.6, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x2584ee })
  );

  body.position.y = 1.5;
  scene.add(body);

  return body;
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8cc9ed);

  camera = new THREE.PerspectiveCamera(
    70,
    1,
    0.1,
    1000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  document.getElementById("gameCanvas").appendChild(renderer.domElement);

  const sunlight = new THREE.DirectionalLight(0xffffff, 2);
  sunlight.position.set(30, 60, 30);
  scene.add(sunlight);

  scene.add(new THREE.AmbientLight(0xffffff, 1));

  createCity();
  player = createPlayer();

  resize();
  window.addEventListener("resize", resize);
}

function resize() {
  if (!renderer || !camera) return;

  const container = document.getElementById("gameCanvas");

  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);

  if (!player) return;

  const delta = Math.min(clock.getDelta(), 0.05);
  const speed = 12 * delta;

  if (!droneMode) {
    if (keys.forward) player.position.z -= speed;
    if (keys.backward) player.position.z += speed;
    if (keys.left) player.position.x -= speed;
    if (keys.right) player.position.x += speed;

    camera.position.set(
      player.position.x,
      player.position.y + 6,
      player.position.z + 10
    );

    camera.lookAt(
      player.position.x,
      player.position.y,
      player.position.z
    );
  }

  renderer.render(scene, camera);

  if (socket.connected) {
    socket.emit("move", {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    });
  }
}

function startGame() {
  createScene();

  socket.connect();

  socket.on("connect", () => {
    socket.emit("join", { username });
  });

  socket.on("players", players => {
    Object.entries(players).forEach(([id, data]) => {
      if (id !== socket.id) addRemotePlayer(id, data);
    });
  });

  socket.on("playerJoined", data => {
    addRemotePlayer(data.id, data);
  });

  socket.on("playerMoved", data => {
    const remote = remotePlayers[data.id];

    if (remote) {
      remote.position.set(data.x, data.y + 1.5, data.z);
    }
  });

  socket.on("playerLeft", id => {
    if (remotePlayers[id]) {
      scene.remove(remotePlayers[id]);
      delete remotePlayers[id];
    }
  });

  animate();
}

function addRemotePlayer(id, data) {
  if (remotePlayers[id]) return;

  const avatar = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.6, 1.2, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xe64b69 })
  );

  avatar.position.set(data.x, 1.5, data.z);
  scene.add(avatar);

  remotePlayers[id] = avatar;
}

// Controles do celular
document.querySelectorAll("[data-move]").forEach(button => {
  const direction = button.dataset.move;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    keys[direction] = true;
  });

  button.addEventListener("pointerup", () => {
    keys[direction] = false;
  });

  button.addEventListener("pointerleave", () => {
    keys[direction] = false;
  });

  button.addEventListener("pointercancel", () => {
    keys[direction] = false;
  });
});

// Pular
document.getElementById("jumpButton").onclick = () => {
  if (player && !droneMode) {
    player.position.y = 2.5;

    setTimeout(() => {
      if (player) player.position.y = 0;
    }, 500);
  }
};

// Câmera drone inicial
document.getElementById("droneButton").onclick = () => {
  droneMode = !droneMode;

  if (droneMode && player) {
    camera.position.set(
      player.position.x,
      player.position.y + 35,
      player.position.z + 35
    );

    camera.lookAt(player.position);
  }
};
