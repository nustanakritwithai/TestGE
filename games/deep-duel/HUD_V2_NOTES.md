# Fighter HUD v2

- Removed the large top fighter HUD from the 3D battle viewport.
- Added world-tracked HUD plates below each fighter.
- Each plate shows HP, Stamina, Posture, numeric values, and current action state.
- HUD position is projected from the fighter's Three.js world position every frame.
- Existing combat engine DOM IDs remain hidden for compatibility with the current TWA/AI loop.
