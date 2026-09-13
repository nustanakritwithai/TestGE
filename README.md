# TestGE — Agentic Adaptive Game Compute Engine

Prototype research repository for **E0: Ground Truth Compute Arena**.

## Current milestone

This repository currently contains the deterministic browser-based arena used as the foundation for the research plan:

- Fixed timestep: 1/60 s
- Seeded deterministic scenarios
- Stable entity IDs
- Player / Enemy / Projectile / Wall / Base
- Movement, collision, projectile hit, damage, death, spawn/despawn
- Replay capture/export
- State hash for repeatability checks
- 5,000-tick benchmark skeleton
- Scenario presets: Baseline, Projectile Storm, Dense Contact, Long Quiet → Combat

## Why E0 comes first

Before building GNNs, residual models, routers, capability models, or adaptive control, the project needs one stable reference world. E0 provides that reference and makes later skills comparable on the same scenarios.

## Planned research order

1. **E0** Ground Truth Arena
2. **E1** Exact + Approximate Classical skills
3. **E2** Tiny MLP sanity baseline
4. **E3** Message-Passing GNN
5. **E4** Residual GNN
6. **E5** Skill Frontier benchmark
7. **E6** Oracle Router + Adaptation Headroom
8. Compare against Expert-Tuned Fixed Hybrid
9. Only then decide whether dynamic routing is worth building

## GitHub Pages

The repository includes a GitHub Pages workflow. After Pages is enabled with **GitHub Actions** as the source, pushes to `main` deploy the static arena automatically.

Expected Pages URL:

`https://nustanakritwithai.github.io/TestGE/`

## Research principle

The project does **not** assume that adaptive or neural computation must win. If a single skill or an expert-tuned fixed hybrid dominates the skill frontier, adaptive routing should be removed rather than forced into the architecture.
