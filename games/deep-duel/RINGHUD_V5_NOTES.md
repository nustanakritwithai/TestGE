# Ring HUD v5

- Replaces the old selection ring at fighter creation time.
- Creates three visible RingGeometry arcs: HP (red), Stamina (blue), Posture (gold).
- Updates arcs via independent requestAnimationFrame, not renderer hooks.
- index.html loads duel-3d-ringhud-v5.js directly.
