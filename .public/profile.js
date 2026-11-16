
export function createPlayerProfile(player) {
  const panel = document.createElement("div");
  panel.className = "profile-card";

  const title = document.createElement("h2");
  title.textContent = "@" + player.username;

  const description = document.createElement("p");
  description.textContent = "Morador da Cidade Nova 3D";

  const house = document.createElement("p");
  house.textContent = player.hasHouse
    ? "Possui uma casa na cidade"
    : "Ainda não possui casa";

  panel.append(title, description, house);
  document.body.appendChild(panel);

  return panel;
}
