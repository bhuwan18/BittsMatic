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

BittsMatic is a browser-based factory/automation puzzle game. Players route numerical items through conveyor belts and math machines (Add, Subtract, Multiply, Divide, Exponentiate) to deliver specific values to the CORE, completing 30 sequential production objectives.

### Module Map

```
index.html → src/main.js          Bootstrap, UI wiring, OAuth init, game loop start
                 ├── core/
                 │   ├── GridManager.js   World state: tiles, machines, items (keyed "x,y"); auto-upgrades perpendicular belts to bridges
                 │   ├── GameLoop.js      Simulation engine: tick machines, advance belt items, layer-aware bridge conflict resolution
                 │   ├── Tile.js          Grid cell container (holds a Belt, Bridge, or Machine)
                 │   └── constants.js     Direction enum, TileKind enum (Empty/Belt/Machine/Bridge), DIR_VECTORS, OPPOSITE, neighborOf, keyOf
                 ├── entities/
                 │   ├── Machine.js       Source, Extractor, Core (3×3), Add, Sub, Mul, Div, Exp, Storage
                 │   ├── Belt.js          Conveyor cell — one item, directional, priority merge (left/right)
                 │   ├── Bridge.js        Two-layer crossing — BridgeLayer (mimics Belt interface) + Bridge (holds two perpendicular BridgeLayers)
                 │   └── Item.js          Numeric value with belt-offset position (0–1)
                 ├── config/
                 │   └── recipes.js       TOOLS array, createMachineForTool() factory
                 ├── input/
                 │   └── InputHandler.js  Mouse/keyboard/touch → tool selection, placement, blueprints, marker dialog (key B)
                 ├── rendering/
                 │   └── Renderer.js      Canvas 2D draw loop, camera (pan/zoom), bridge rendering, marker labels, machine stat tooltips
                 └── systems/
                     ├── AuthSession.js       Google OAuth + localStorage persistence
                     ├── Progression.js       Objectives, level-gated unlocks, upgrade points, save/restore
                     ├── BlueprintManager.js  Copy/paste/rotate factory regions; bridge-layer aware
                     ├── MarkerManager.js     User-placed text annotations on grid tiles (key B)
                     └── StatsCollector.js    60-frame rolling throughput & efficiency metrics per machine
```

### Data Flow & Game Loop

Each animation frame (`requestAnimationFrame`):
1. `GameLoop.update(delta)` — ticks all machines (emit/process), advances item offsets on belts, resolves item hand-offs between tiles (layer-aware for bridges), records stats
2. `Renderer.render()` — full Canvas 2D redraw (no retained scene graph); draws bridges, marker labels, machine stat tooltips
3. `updateUi()` — refreshes sidebar (objective, toolbar, resources, milestones, upgrades)

State authorities: **GridManager** (world), **Progression** (player advancement), **AuthSession** (identity + localStorage save slot), **StatsCollector** (real-time metrics), **MarkerManager** (annotations). No central store or event bus — consumers hold direct references; UI updates happen via the `onChange` callback on `Progression`.

### Key Mechanics

- **Grid**: sparse 150×150 map, tiles stored as `Map<"x,y", Tile>`
- **Items**: travel on belts via a normalized offset (0 = belt entry, 1 = ready to hand off); max 1 item per belt tile
- **Bridges**: placing a belt perpendicular to an existing belt auto-upgrades that tile to a `Bridge` with two independent `BridgeLayer`s; each layer carries items without blocking the other; `GridManager.belts()` returns both plain belts and bridge layers in a flat array
- **Math machines** have a 1×2 or 2×1 footprint with two input ports (A, B) and one output direction; processing takes configurable ticks; Divide emits remainder on a `secondaryOutput` direction via `pendingSecondaryOutput` retry
- **Storage** machines buffer items FIFO; emit one item per tick when output is free
- **Core** is a fixed 3×3 machine; delivering the required value completes the current objective and advances progression
- **Progression**: 30-level objective sequence (targets ±20% randomized per `mapSeed`); machines unlock at level thresholds: Add@1, Bridge@4, Multiply@7, Subtract@13, Divide@16, Exponentiate@19, Storage@22
- **Upgrades**: completing objectives earns upgrade points; shop offers Extractor Speed (3 tiers, req level 5) and Belt Speed (3 tiers, req level 10); belt speed multiplier applied in `GameLoop` as `beltSpeedMultiplier`
- **Blueprints**: select a region → Ctrl+C → Ctrl+V to paste a relative layout; `R` rotates 90° and remaps belt directions and machine orientations; bridge layers are serialized as separate belt entries
- **Markers**: press `B` while tiles are selected to add a text annotation; rendered as labeled overlays; saved/restored with game state

### Statistics

`StatsCollector` maintains a 60-frame ring buffer per machine tracking:
- `throughputFor(machineId)` — average items produced per frame over the window
- `efficiencyFor(machineId)` — production / (production + blocked) ratio
- `coreItemsDelivered` / `coreItemsRejected` — cumulative delivery totals

`Renderer` displays a tooltip with throughput and efficiency when the pointer hovers over a machine (requires `stats` to be set on the renderer).

### Testing

Tests use **Node.js built-in `test`** (`node:test` / `node:assert`) — no Jest, no Vitest. Tests import game modules directly (no DOM/Canvas required for logic tests); game objects are instantiated manually. The test file at [tests/simulation.test.js](tests/simulation.test.js) covers movement, machine math, Core delivery, Progression save/restore, AuthSession, and BlueprintManager.

### Tech Constraints

- Vanilla JavaScript (ES modules), no TypeScript, no framework, no bundler
- Canvas 2D only — no WebGL
- Authentication via Google Sign-In (OAuth 2.0); only sanitized profile data is stored in localStorage (no tokens)
- `baseTileSize = 32px`; zoom range 0.45×–2.4×; canvas is responsive (no fixed pixel dimensions)


## Task Delegation  

Spawn subagents to isolate context, parallelize independent work, or offload bulk mechanical tasks. Don't spawn when the parent needs the reasoning, when synthesis requires holding things together, or when spawn overhead dominates.  

Pick the cheapest model that can do the subtask well: 
- Haiku: bulk mechanical work, no judgment 
- Sonnet: scoped research, code exploration, in-scope synthesis 
- Opus: subtasks needing real planning or tradeoffs  

If a subagent realizes it needs a higher tier than itself, return to the parent. Parent owns final output and cross-spawn synthesis.
