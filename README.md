# Hostile Ground

A boomer shooter. You are a Mark VII assault frame — a mech several times the height
of anything shooting at you — holding a muddy stretch of front line with a gatling
gun, a missile rack, and a company of infantry who are counting on you.

Plain HTML, CSS and JavaScript. No build step, no installing anything. Three.js is
loaded straight from a CDN.

## Playing it

Open `index.html` through a local web server (not by double-clicking it — the browser
blocks JavaScript modules on `file://`):

```bash
python3 -m http.server 5173 --directory .
```

Then go to <http://localhost:5173>.

| Control | Does |
| --- | --- |
| `W` `A` `S` `D` | Walk |
| Mouse | Look |
| Left click | Gatling gun |
| Right click | Missile |
| `Space` | Thruster hop |
| `R` | Reload the gatling early |
| `Esc` | Release the mouse / pause |

## The weapons

**Gatling gun** — 7 seconds of continuous fire, then a 7 second reload. Stop firing
and the remaining time stays in the drum; empty it and you're locked out for the full
reload. 13 rounds a second, 26 damage each.

**Missile rack** — 8 missiles, 200 damage on a direct hit plus a wide blast around
it: 155 damage at the centre, tailing off across a 24 unit radius. One well-placed
missile clears a group. Once all 8 are gone the rack reloads in 30 seconds.

Your own blast only hurts you within 13 units, so you can fire into a crowd that's
closer than the blast is wide without killing yourself.

## The battlefield

Two trench lines face each other across 170 units of churned mud: yours at the south
end, theirs at the north. Between them is no man's land — shell craters, barbed wire
belts, burning vehicle hulks and standing water. Shelled-out buildings sit back
behind both lines.

The trenches are real depressions in the ground, not decoration. You can walk down
into one, and your gatling rounds will chew up the far wall.

### How the ground works

`src/level.js` keeps two things: `walls` (solid boxes) and `pits` (rectangles where
the ground sits lower). `groundAt()` combines them, so a trench floor is simply
ground at −3 instead of 0.

Everything that walks has a **step height**, passed to `resolveCircle()`. Anything
whose top is within that height of your feet gets walked over instead of blocked.
You get 6, which is why you stride over sandbags that stop infantry dead.

That number is worth respecting. The aliens originally had 4, which is fine on open
ground — but measured from a trench floor 3 units down, a 2.5 unit parapet needs 5.5,
so they sat in their own front line for the whole battle unable to climb out. Aliens
and infantry both get 5.6 now.

## Your infantry

Up to 14 soldiers hold the line with you, in `src/friendlies.js`. They're a third the
height of the aliens and a fraction of yours. They take up firing positions behind
the parapet, shoot three-round bursts at anything they can see within 105 units, back
off if something closes on them, and die messily. Reinforcements come up with every
wave.

They do real damage — 14 a shot — so a wave can genuinely be broken by the infantry
while you deal with the heavies.

**Friendly fire is off.** Your rounds and your missile blasts pass through your own
troops. If you'd rather be able to mow down your own side, set `FRIENDLY_FIRE = true`
at the top of `src/friendlies.js`; everything is already wired for it.

The `KILLS` counter is yours alone — kills your infantry make don't go on your tally.

## The enemies

Humanoid armoured aliens, coming over the top of their own trench. Two kinds:

- **Grunts** — 100 health, fast, three-round bursts. About 3 units tall against your
  eye line at 7.2, so they come up to roughly your waist.
- **Heavies** — 280 health, slower, hit much harder, and about 5.6 units tall. They
  start appearing on wave 3.

They'll shoot at your infantry when one is much closer than you are, so the two sides
genuinely fight each other rather than everything funnelling onto you.

They die badly: a shower of giblets, blood across the mud, and a corpse left where
they fell. All of it stays put until the limits kick in (240 blood splats, 280
giblets, 32 corpses), at which point the oldest gets cleaned up.

Waves get bigger each time. You get a repair canister between waves, two on even waves.

## The frame you're in

You have a body. Look down and you'll see your own chest, shoulders, legs and feet,
and they walk as you walk. It's built in `src/mech.js` and lives in the world rather
than being stuck to the camera, so it turns with you but never tilts when you look
up and down.

Two things were needed to make it visible, both worth knowing if you change the
proportions: the cockpit sits 1.3 units forward of the mech's centre, and the legs
are set forward under it in a chicken-walker stance. With the torso directly beneath
the camera, looking down just fills the screen with one flat plate.

## If it runs slowly

It renders at full resolution with antialiasing on, at up to 2x pixel density, so it
asks a fair bit of the graphics card.

There's an FPS counter in the top right. The game drops its own render resolution
automatically if the frame rate falls below 45, and raises it again once there's
headroom. The floor is 45% of full resolution. If you want it permanently lighter,
lower `PIXEL_SCALE` at the top of `src/main.js`.

If it's still bad, open Chrome's console (View → Developer → JavaScript Console) and
look for the line starting `GPU:`. If it mentions *SwiftShader* or *Software*, Chrome
is rendering without the graphics card — turn on "Use graphics acceleration when
available" in Chrome's settings and restart it.

Two things that mattered far more than expected, kept here as a warning:

- **Never add or remove lights while the game is running.** Three.js recompiles every
  shader in the scene when the light count changes. Giving each plasma bolt its own
  light meant dozens of recompiles a second, which is what made it stutter. There is
  a fixed set of 11 lights, and the one missile light is moved rather than created.
- **No `mix-blend-mode` or `backdrop-filter` over the canvas.** Both force the browser
  to recomposite the whole screen every frame.

Draw calls are the thing to watch now — roughly 650 in a firefight, most of it trench
furniture and infantry. If it needs trimming, merging the static trench geometry into
fewer meshes is the obvious next step.

## How the code is laid out

| File | What's in it |
| --- | --- |
| `index.html` | Page, HUD markup, all the CSS |
| `src/main.js` | Startup, input, the game loop |
| `src/level.js` | Terrain, trenches, props, lighting, collision |
| `src/player.js` | Mech movement, camera, health |
| `src/mech.js` | The chassis you can see, and its ground shadow |
| `src/weapons.js` | Gatling, missiles, hit detection |
| `src/enemies.js` | Aliens, their AI, waves, pickups |
| `src/friendlies.js` | Your infantry |
| `src/gore.js` | Giblets, blood, corpses, explosions |
| `src/hud.js` | Everything on screen |
| `src/audio.js` | All sound, synthesised in the browser |

Tuning numbers live at the top of each file: damage and reload times in `weapons.js`,
the `TYPES` block in `enemies.js`, the constants in `friendlies.js`, and the trench
geometry at the top of `level.js`.

While the game is running, `window.GAME` in the browser console gives you the whole
thing to poke at.
