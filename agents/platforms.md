# Platforms: desktop and mobile

The game must be fully playable on **desktop browsers** (school laptops) and **mobile browsers**
(students' phones and tablets). Neither is a port of the other; every feature is designed for
both from the first commit.

## Supported targets

| Target | Browsers | Minimum | Performance target |
| --- | --- | --- | --- |
| Desktop / laptop | Chrome, Edge, Firefox (last 2 versions), Safari 17+ | 1280×720 window | 60 FPS on Intel UHD 620 |
| Phone (landscape) | Chrome Android, Safari iOS 17+ | 640×360 CSS px | 60 FPS target, never below 30 FPS on a mid-range phone (reference: ~2021 mid-range Android, iPhone 11) |
| Tablet | Same as phone | 1024×768 | 60 FPS |

Gameplay requires **landscape** on phones; menus, lobby and debrief also work in portrait.
Mixed groups (some on laptops, some on phones) in one room are the normal case.

## Input

All input devices map to the same `InputState` (see `apps/client/src/input/`). Nothing in the
game may require a specific device.

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD / arrows | Left stick / D-pad | Floating virtual joystick, left half of screen |
| Pick up / put down | E | A / Cross | "Podnieś" button |
| Work at station (hold) | Space | X / Square (hold) | "Pracuj" button (hold) |
| Ping | Q (+ number or wheel) | Y / Triangle (+ stick) | "Sygnał" button → radial menu |
| Minigames, desk, menus | Keys / mouse | D-pad + buttons | Tap, drag, swipe |

- The **last used device** decides which prompts are shown (key caps, pad glyphs or touch icons).
- Touch targets ≥ 44×44 CSS px, with spacing; controls semi-transparent and never covering the
  folder queue or the player's character.
- Hold actions must tolerate a finger sliding slightly off the button.
- Minigames are designed **touch-first and then mapped to keys/pad**: big draggable cards, tap
  targets, swipe timelines — no hover-only interactions, no precise mouse-only aiming, no
  right-click, no double-click.
- Left-handed layout option (mirrored touch controls) in settings.

## Layout

- Responsive CSS with container/media queries; units in `rem`/`dvh`/`dvw`; respect
  `env(safe-area-inset-*)` for notches and home indicators.
- Overlays (stations, desk): half screen on desktop, full-width bottom sheet or full screen on
  phones; the 3D scene keeps running behind.
- Text scaling setting must not break any layout down to 640×360.
- Never rely on hover to reveal information.

## Browser behaviour on mobile

- No pinch zoom, double-tap zoom, pull-to-refresh, overscroll, text selection or long-press
  context menu on the game surface (`touch-action: none`, `user-select: none`,
  `overscroll-behavior: none`).
- Fullscreen button (Fullscreen API where available; iOS Safari falls back to the
  add-to-home-screen web app manifest).
- Screen Wake Lock while a level is running.
- `visibilitychange`: when hidden, mute audio and stop local effects; on return, reconnect fast
  using the reconnect token (the 60 s slot covers short app switches).
- Audio unlocks on the first user gesture (iOS requirement); show no error if it is still locked.
- Haptics through the Vibration API (Android only; iOS ignores it) and gamepad rumble — always
  optional, togglable.

## Performance on mobile

- Quality presets `low` / `medium` / `high`; mobile GPUs start on `low` or `medium` (detect via
  renderer info and a short frame-time probe), desktop on `high` with fallback.
- Device pixel ratio capped (≤ 1.5 on phones, ≤ 2 on desktop).
- Adaptive quality: if average frame time exceeds budget for a few seconds, drop particles,
  shadows, then DPR — never the gameplay readability.
- Budgets in [`architecture.md`](architecture.md); mobile draw-call target ~100.
- Thermal throttling is real: test a full 8-minute level, not just the first minute.

## Testing on devices

- Playwright runs a desktop and a mobile-emulated project (touch, landscape) in CI
  (see [`testing.md`](testing.md)).
- Before closing a gameplay or UI task, check it in Chrome device emulation; before a stage exit,
  check on real devices:

| Device matrix (stage exit) |
| --- |
| Windows laptop with Intel UHD 620, Chrome + Edge |
| Any laptop, Firefox |
| Mid-range Android phone, Chrome |
| iPhone, Safari |
| Tablet (iPad or Android), landscape |
