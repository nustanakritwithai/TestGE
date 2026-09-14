# HUD v2 verification

- Top fighter status panels removed from visible viewport.
- Hidden compatibility nodes preserve IDs required by duel-3d-isometric-v1.js.
- New fighter HUD overlays are anchored using Three.js world-to-screen projection.
- HP, Stamina, Posture, and state mirror the live combat values every render.
- Off-screen fighters hide their HUD plate.
- Mobile width reduces the overlay footprint.
