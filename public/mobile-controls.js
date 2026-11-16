
export function enableMobileControls(callback) {
  const state = {
    forward: false,
    backward: false,
    left: false,
    right: false
  };

  document.querySelectorAll("[data-move]").forEach(button => {
    const direction = button.dataset.move;

    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      state[direction] = true;
      callback(state);
    });

    const release = () => {
      state[direction] = false;
      callback(state);
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  return state;
}
