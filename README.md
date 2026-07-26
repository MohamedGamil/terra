# Terra — Real-Time Territorial Conquest

Terra is a high-performance, real-time multiplayer territorial conquest game inspired by *territorial.io*. Built with modern vanilla JavaScript and canvas technologies, Terra simulates massive strategic battles with up to 500+ bots or real players across detailed real-world geographical maps.

---

## What is Terra?

Terra brings authentic real-time strategy to the browser. The game challenges players' spatial awareness, risk assessment, and reflex efficiency. 

### Core Gameplay & Mechanics
- **Spawn Selection Phase**: Untimed, tactical spawn picking stage where players scout the map, followed by an explicit `LOCK SPAWN & START MATCH` countdown overlay.
- **Economic Simulation Engine**: Troops act as both currency and army size. Balance increases via interest (accruing every `0.5s`) and land income (delivered every `5s`).
- **Tactical Combat & Taxes**: Command your forces via click-to-target mapping and a force slider (1% to 100%). Launching attacks incurs a **1.17% attack tax** (land) or **3.125% deployment tax** (naval).
- **Enclave & Pocket Conquest**: Fully supports inward wavefront propagation, allowing players to squeeze and conquer landlocked, surrounded enclaves or pockets of neutral/rival territory.
- **Naval Invasions**: Launch troop-laden boats across water bodies to colonize distant islands or stage flank attacks. Island-snap calculations correctly budget naval forces based on island size and distance.
- **Diplomatic Pacts**: Forge non-aggression treaties or mutual defense agreements with AI bots to secure your borders, or break them when the time is right.

### Advanced Optimization
- **High-FPS Canvas Renderer**: Runs at **250+ FPS** on a 1000x1000 grid, updating thousands of frontier borders and animating particle shockwaves smoothly.
- **Compact World Map Pre-Rasterization**: Uses custom build scripts to compile complex GeoJSON Natural Earth shapefiles into compressed Run-Length Encoded (RLE) files, reducing the world map weight by **90%** and boosting client loading speed from 180ms to **1.4ms**.
- **Optimized Pathfinding**: Incorporates a guided A-Star search engine that replaces slow breadth-first searches (BFS) to prevent performance stutters during long-distance attacks.
- **Defensive Loop Protection**: Robust exception safety, try-catch wrappers, and dynamic frontier validation keep the simulation loop running stably even during high-pressure rival pushbacks.
- **WebSocket Multiplayer Broker**: A lightweight Node.js/ws server handles room creation, join codes, and streams 20Hz binary delta-encoded state update packets.

---

## Features & UI Elements

- **Top HUD Display**: Real-time ticker showing active bots, total land area percentage, troop balance, and dynamic interest rates.
- **Live Leaderboard**: Interactive top players sidebar showing ranks, colors, and live pixel counts.
- **Interactive Minimap**: Floating bottom-right widget illustrating full-map territory overview, camera viewport bounds, and click/drag navigation.
- **Match Analytics Dashboard**: Glassmorphic post-game statistics summary modal showing duration, average APM, peak land area, and a 2D canvas time-series expansion chart.
- **Map Editor**: Built-in canvas paint editor to design custom maps, draw barriers, and set custom player spawn sites.

---

## Project Structure

```
├── .d4/                  # D4 Agentic Framework ledger and tasks
├── public/
│   ├── assets/           # World map datasets, audio fanfares, and fonts
│   ├── src/
│   │   ├── ai-engine.js  # Procedural bot decision-making & pact proposal logic
│   │   ├── color.js      # Procedural Golden Ratio color palette generator
│   │   ├── main.js       # Main application lifecycle, HUD updates, & network client binding
│   │   ├── match-recorder.js # Real-time player statistics & APM tracker
│   │   ├── network-client.js # WebSocket client handler
│   │   ├── renderer.js   # 2D Canvas drawing manager (grid, particles, minimap)
│   │   ├── simulation.js # Core game state loop (income, combat, expansions, naval boats)
│   │   ├── stats-dashboard.js # Replay charts & post-game standings dashboard
│   │   └── ...
│   └── index.html        # Glassmorphic UI overlays & game layout
├── scripts/              # Automated verification, benchmarks, & map builders
├── server.js             # 20Hz binary WebSocket multiplayer server
└── package.json          # Dependency and script list
```

---

## Running Locally

### Prerequisites
Make sure you have [Node.js](https://nodejs.org) (v18+) and `npm` or `yarn` installed.

### 1. Install Dependencies
```bash
npm install
```

### 2. Build/Pre-rasterize World Map (Optional)
If you want to re-compile the world map dataset:
```bash
npm run build:map
```

### 3. Run Development Server
Start the frontend dev server (Vite):
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### 4. Run Multiplayer server (Optional)
If you want to play or test WebSocket multiplayer lobbies, spin up the server:
```bash
node server.js
```

---

## Verification & Tests

Terra is fully backed by extensive CLI validation scripts:
- **Combat & Math (GATE-003)**: `npm run test:combat` (verifies interest rates, taxes, wavefront loops, enclaves).
- **Server Sync (GATE-002)**: `npm run test:server` (validates client room connection and binary streams).
- **ELO Progression**: `npm run test:progression` (checks rating delta persistency).
- **Performance Benchmark**: `npm run test:benchmark` (evaluates canvas rendering frame rate and frame times).
