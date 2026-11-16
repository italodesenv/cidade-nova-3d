
import * as THREE from
  "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

import { createPlayerProfile } from "./profile.js";

import {
  customizeCharacter,
  createCustomizationMenu
} from "./customization.js";

import {
  enableMobileControls
} from "./mobile-controls.js";

// ESTADO DO JOGO
let avatar = null;
let scene = null;
let camera = null;
let renderer = null;
let socket = null;
let token = "";
let username = "";
let creator = false;
let drone = false;

const remotePlayers = new Map();
const movement = {
  forward: false,
  backward: false,
  left: false,
  right: false
};

const $ = id => document.getElementById(id);

function showNotice(text) {
  const notice = $("notice");
  if (notice) notice.textContent = text;
}

// COMUNICAÇÃO COM O SERVIDOR
async function api(url, method = "GET", body = null) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Erro no servidor.");
  }

  return data;
}

// LOGIN
$("login").onclick = async () => {
  try {
    const data = await api("/api/login", "POST", {
      username: $("username").value,
      password: $("password").value
    });

    token = data.token;
    username = data.username;
    creator = false;

    startGame();
  } catch (error) {
    $("message").textContent = error.message;
  }
};

// CADASTRO
$("register").onclick = async () => {
  try {
    const data = await api("/api/register", "POST", {
      username: $("username").value,
      password: $("password").value
    });

    token = data.token;
    username = data.username;
    creator = false;

    startGame();
  } catch (error) {
    $("message").textContent = error.message;
  }
};

// ENTRADA DOS CRIADORES
async function creatorLogin() {
  const user = prompt("Usuário oficial:");
  if (!user) return;

  const password = prompt("Senha do criador:");
  if (!password) return;

  try {
    const data = await api("/api/creator/login", "POST", {
      username: user,
      password
    });

    token = data.token;
    username = data.username;
    creator = true;

    startGame();
  } catch (error) {
    alert(error.message);
  }
}

// INICIAR JOGO
function startGame() {
  $("menu").hidden = true;
  $("game").hidden = false;
  $("playerName").textContent = "@" + username;

  $("creatorButton").hidden = !creator;

  initializeWorld();
  connectMultiplayer();
  connectModules();
  loadHouses();

  $("logout").onclick = () => location.reload();

  $("houseRequest").onclick = async () => {
    try {
      const result = await api("/api/house/request", "POST", {});
      showNotice(result.message);
    } catch (error) {
      showNotice(error.message);
    }
  };

  $("droneButton").onclick = activateDrone;

  $("backButton").onclick = returnToPlayer;

  $("creatorButton").onclick = () => {
    $("creatorPanel").hidden = false;
  };

  $("closeCreator").onclick = () => {
    $("creatorPanel").hidden = true;
  };

  $("placeBuilding").onclick = placeBuilding;
  $("requestsButton").onclick = showRequests;

  $("jumpButton").onclick = jump;
  $("upButton").onclick = () => {
    if (drone) camera.position.y += 2;
  };
  $("downButton").onclick = () => {
    if (drone) camera.position.y = Math.max(2, camera.position.y - 2);
  };
}

// MUNDO 3D
function initializeWorld() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  camera = new THREE.PerspectiveCamera(
    70,
    innerWidth / innerHeight,
    0.1,
    1000
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);

  $("gameCanvas").innerHTML = "";
  $("gameCanvas").appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x52634b, 2));

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(40, 80, 20);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x4d9c57 })
  );

  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  createRoads();
  createAvatar();

  camera.position.set(0, 5, 9);

  window.addEventListener("resize", resize);

  animate();
}

function createRoads() {
  for (let i = -4; i <= 4; i++) {
    addBox(8, 0.08, 200, 0x353b42, i * 25, 0, 0);
    addBox(200, 0.08, 8, 0x353b42, 0, 0, i * 25);
  }

  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      if (Math.abs(x) < 1 && Math.abs(z) < 1) continue;

      const height = 5 + Math.random() * 12;

      addBox(
        9,
        height,
        9,
        0xb9c3ce,
        x * 25 + 8,
        height / 2,
        z * 25 + 8
      );
    }
  }
}

function addBox(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color })
  );

  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

// PERSONAGEM
function createAvatar() {
  avatar = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x2463eb })
  );

  body.position.y = 1;
  avatar.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd1a4 })
  );

  head.position.y = 1.9;
  avatar.add(head);

  scene.add(avatar);
}

// CONECTAR MÓDULOS
function connectModules() {
  enableMobileControls(state => {
    Object.assign(movement, state);
  });

  createCustomizationMenu(color => {
    customizeCharacter(avatar, color);
  });

  $("playerName").onclick = () => {
    createPlayerProfile({
      username,
      hasHouse: false
    });
  };
}

// MOVIMENTAÇÃO
function jump() {
  if (drone) return;
  avatar.position.y = 1.5;

  setTimeout(() => {
    if (avatar && !drone) avatar.position.y = 0;
  }, 500);
}

function activateDrone() {
  drone = true;
  $("backButton").hidden = false;
  showNotice("Modo drone ativado.");
}

function returnToPlayer() {
  drone = false;
  $("backButton").hidden = true;
  showNotice("Você voltou ao personagem.");
}

function animate() {
  requestAnimationFrame(animate);

  if (!scene || !renderer) return;

  if (!drone && avatar) {
    const speed = 0.18;

    if (movement.forward) avatar.position.z -= speed;
    if (movement.backward) avatar.position.z += speed;
    if (movement.left) avatar.position.x -= speed;
    if (movement.right) avatar.position.x += speed;

    camera.position.lerp(
      new THREE.Vector3(
        avatar.position.x,
        avatar.position.y + 5,
        avatar.position.z + 9
      ),
      0.08
    );

    camera.lookAt(
      avatar.position.x,
      avatar.position.y + 1,
      avatar.position.z
    );

    if (socket && socket.connected) {
      socket.emit("move", {
        x: avatar.position.x,
        z: avatar.position.z
      });
    }
  }

  renderer.render(scene, camera);
}

// MULTIPLAYER
function connectMultiplayer() {
  socket = window.io({
    auth: { token }
  });

  socket.on("players", players => {
    players.forEach(addRemotePlayer);
    updateOnline();
  });

  socket.on("player-joined", addRemotePlayer);

  socket.on("player-moved", player => {
    const mesh = remotePlayers.get(player.id);

    if (mesh) {
      mesh.position.set(player.x, 1, player.z);
    }
  });

  socket.on("player-left", id => {
    const mesh = remotePlayers.get(id);

    if (mesh) scene.remove(mesh);

    remotePlayers.delete(id);
    updateOnline();
  });

  socket.on("connect_error", () => {
    showNotice("Erro ao conectar ao multiplayer.");
  });
}

function addRemotePlayer(player) {
  if (!player || player.id === socket.id) return;
  if (remotePlayers.has(player.id)) return;

  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0xe74c3c })
  );

  mesh.position.set(player.x, 1, player.z);
  scene.add(mesh);
  remotePlayers.set(player.id, mesh);

  updateOnline();
}

function updateOnline() {
  $("online").textContent =
    (remotePlayers.size + 1) + " online";
}

// CASAS
async function loadHouses() {
  try {
    const houses = await api("/api/houses");

    houses.forEach(house => {
      createHouse(house.x, house.z, house.username);
    });
  } catch (error) {
    showNotice(error.message);
  }
}

function createHouse(x, z, name) {
  const house = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4, 7),
    new THREE.MeshStandardMaterial({ color: 0xe5c59a })
  );

  base.position.y = 2;
  house.add(base);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(5, 3, 4),
    new THREE.MeshStandardMaterial({ color: 0x9d3434 })
  );

  roof.position.y = 5;
  house.add(roof);

  house.position.set(x, 0, z);
  scene.add(house);

  const label = document.createElement("div");
  label.textContent = "@" + name;
  label.className = "house-label";
  label.style.position = "absolute";
  label.style.color = "white";
  label.style.pointerEvents = "none";

  $("gameCanvas").appendChild(label);
}

// CONSTRUÇÃO
async function placeBuilding() {
  if (!creator) return;

  try {
    const result = await api("/api/creator/build", "POST", {
      kind: $("buildKind").value,
      x: avatar.position.x + 5,
      z: avatar.position.z + 5
    });

    showNotice(result.message);
  } catch (error) {
    showNotice(error.message);
  }
}

// APROVAÇÃO DE CASAS
async function showRequests() {
  if (!creator) return;

  try {
    const requests = await api("/api/creator/requests");
    const list = $("requestsList");

    list.replaceChildren();

    requests.forEach(request => {
      const row = document.createElement("div");
      const label = document.createElement("span");
      const button = document.createElement("button");

      label.textContent = "@" + request.username;
      button.textContent = "Aprovar";

      button.onclick = async () => {
        try {
          await api(
            "/api/creator/requests/" + request.id + "/approve",
            "POST",
            {}
          );

          row.remove();
          loadHouses();
          showNotice("Casa aprovada!");
        } catch (error) {
          showNotice(error.message);
        }
      };

      row.append(label, button);
      list.appendChild(row);
    });

    if (!requests.length) {
      list.textContent = "Nenhum pedido pendente.";
    }
  } catch (error) {
    showNotice(error.message);
  }
}

// TELA
function resize() {
  if (!camera || !renderer) return;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
