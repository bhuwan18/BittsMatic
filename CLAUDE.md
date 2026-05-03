# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # Serve on http://localhost:5173 (static, no build step)
npm test         # Run all tests via Node.js built-in test runner (requires Node 18+)
node --test tests/simulation.test.js  # Run a single test file
```

There is no build step, transpilation, or bundler — source files are served directly as ES modules.

## Architecture

BittsMatic is a browser-based factory/automation puzzle game. Players route numerical items through conveyor belts and math machines (Add, Subtract, Multiply, Divide) to deliver specific values to the CORE, completing sequential production objectives.

### Module Map

```
index.html → src/main.js          Bootstrap, UI wiring, OAuth init, game loop start
                 ├── core/
                 │   ├── GridManager.js   World state: tiles, machines, items (keyed "x,y")
                 │   ├── GameLoop.js      Simulation engine: tick machines, advance belt items
                 │   ├── Tile.js          Grid cell container (holds a Belt or Machine)
                 │   └── constants.js     Direction enum (UP/DOWN/LEFT/RIGHT), TileKind enum
                 ├── entities/
                 │   ├── Machine.js       Source, Core (3×3), Add, Sub, Mul, Div
                 │   ├── Belt.js          Conveyor cell — one item, directional
                 │   └── Item.js          Numeric value with belt-offset position (0–1)
                 ├── config/
                 │   └── recipes.js       Tool definitions, machine factory functions
                 ├── input/
                 │   └── InputHandler.js  Mouse/keyboard → tool selection, placement, blueprints
                 ├── rendering/
                 │   └── Renderer.js      Canvas 2D draw loop, camera (pan/zoom)
                 └── systems/
                     ├── AuthSession.js       Google OAuth + localStorage persistence
                     ├── Progression.js       Objectives, milestone unlocks, save/restore
                     └── BlueprintManager.js  Copy/paste/rotate factory regions
```

### Data Flow & Game Loop

Each animation frame (`requestAnimationFrame`):
1. `GameLoop.update(delta)` — ticks all machines (emit/process), advances item offsets on belts, resolves item hand-offs between tiles
2. `Renderer.render()` — full Canvas 2D redraw (no retained scene graph)
3. `updateUi()` — refreshes sidebar (objective, inventory, machine info)

State is held across three authorities: **GridManager** (world), **Progression** (player advancement), **AuthSession** (identity + localStorage save slot). There is no central store or event bus — state consumers hold direct references; UI updates happen via the `onChange` callback on `Progression`.

### Key Mechanics

- **Grid**: sparse 50×50 map, tiles stored as `Map<"x,y", Tile>`
- **Items**: travel on belts via a normalized offset (0 = belt entry, 1 = ready to hand off); max 1 item per belt tile
- **Math machines** have a 1×2 or 2×1 footprint with two input ports (A, B) and one output direction; processing takes 1–2 ticks
- **Core** is a fixed 3×3 machine; delivering the required value completes the current objective and advances progression
- **Progression** unlocks machines at milestones (Multiply after 3× value-10 delivery, Divide after 1× value-20)
- **Blueprints**: select a region → Ctrl+C → Ctrl+V to paste a relative layout; `R` rotates 90° and remaps belt directions and machine orientations

### Testing

Tests use **Node.js built-in `test`** (`node:test` / `node:assert`) — no Jest, no Vitest. Tests import game modules directly (no DOM/Canvas required for logic tests); game objects are instantiated manually. The test file at [tests/simulation.test.js](tests/simulation.test.js) covers movement, machine math, Core delivery, Progression save/restore, AuthSession, and BlueprintManager.

### Tech Constraints

- Vanilla JavaScript (ES modules), no TypeScript, no framework, no bundler
- Canvas 2D only — no WebGL
- Authentication via Google Sign-In (OAuth 2.0); only sanitized profile data is stored in localStorage (no tokens)
- `TILE_SIZE = 48px`, canvas fixed at `1152×864` (24×18 visible tiles at 1× zoom, zoom range 0.45×–2.4×)


## Task Delegation  

Spawn subagents to isolate context, parallelize independent work, or offload bulk mechanical tasks. Don't spawn when the parent needs the reasoning, when synthesis requires holding things together, or when spawn overhead dominates.  

Pick the cheapest model that can do the subtask well: 
- Haiku: bulk mechanical work, no judgment 
- Sonnet: scoped research, code exploration, in-scope synthesis 
- Opus: subtasks needing real planning or tradeoffs  

If a subagent realizes it needs a higher tier than itself, return to the parent. Parent owns final output and cross-spawn synthesis.