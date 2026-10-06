// Access to the first connected gamepad; the Gamepad API can be blocked by permissions policy.
export function firstGamepad(): Gamepad | null {
  try {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (pad?.connected) {
        return pad;
      }
    }
  } catch {
    // Gamepad API blocked: treat as no gamepad.
  }
  return null;
}
