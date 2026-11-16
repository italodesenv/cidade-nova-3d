
export function customizeCharacter(avatar, color) {
  avatar.traverse(object => {
    if (object.isMesh && object.material) {
      object.material = object.material.clone();
      object.material.color.set(color);
    }
  });
}

export function createCustomizationMenu(onColorChange) {
  const panel = document.createElement("div");
  panel.className = "customization-panel";

  const title = document.createElement("h3");
  title.textContent = "Personalizar personagem";

  const colors = [
    "#2463eb",
    "#e74c3c",
    "#16a085",
    "#8e44ad",
    "#f1c40f",
    "#222222"
  ];

  panel.appendChild(title);

  colors.forEach(color => {
    const button = document.createElement("button");
    button.style.background = color;
    button.textContent = "●";
    button.onclick = () => onColorChange(color);
    panel.appendChild(button);
  });

  document.body.appendChild(panel);
  return panel;
}
