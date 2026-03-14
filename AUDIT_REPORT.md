# Code Audit Report
Date: 2026-03-14
Project: Âşıklar Meydane (Arena2)

## Summary
The project is a well-built multiplayer arena game with solid architecture and clean code. The most urgent issue is that **the game silently hangs when it can't connect to the server** — there's no timeout, no error message, and no feedback to the player. This affects all game modes (serbest, normal, join) when the server is unreachable or the connection fails. Beyond that, the codebase is healthy with good input validation, proper client/server separation, and no security vulnerabilities.

## Overall Health
🟡 Needs Attention

---

## Findings

### 🔴 Critical — Fix Before Going Further

**The game hangs forever if the server connection fails**
What this means: After clicking MEYDANE or SERBEST, the game tries to connect to the server. If the connection doesn't establish (wrong URL, server down, WebSocket blocked), the player sees a black screen or frozen lobby overlay with no way out and no error message.
Why it matters: Every player who hits a connection issue will think the game is broken. On Railway or behind proxies, WebSocket connections can fail silently — the player has zero feedback.
What to do: Add a connection timeout (e.g., 10 seconds) with an error message and a "return to menu" button. Also add a `connect_error` handler in NetworkManager.js.

**No error handler for WebSocket connection failures**
What this means: NetworkManager.js (line 34-46) creates a Socket.IO connection but never listens for `connect_error` or `reconnect_failed` events. If the connection is rejected (CORS, transport failure, server down), the client has no idea.
Why it matters: This is almost certainly why "serbest mode doesn't start" — the connection may be failing silently. On Railway, if WebSocket transport is blocked or CORS isn't configured, the connection fails with no feedback.
What to do: Add `socket.on('connect_error', ...)` in NetworkManager and surface the error to the player.

**CORS defaults block production deployments**
What this means: The server (server.js line 21-23) defaults to only allowing connections from localhost ports. On Railway, if `CORS_ORIGINS` environment variable is not set, connections from the Railway URL are blocked by CORS.
Why it matters: Same-origin Socket.IO connections usually bypass CORS, but if Railway's proxy layer strips the origin header or if the client URL doesn't exactly match the server URL, the connection is silently rejected.
What to do: Either set `CORS_ORIGINS` in Railway to include your Railway URL, or change the default to `origin: true` (allow all same-origin) when no env var is set.

---

### 🟡 Important — Address Soon

**The tryJoin polling loop never gives up**
What this means: After connecting, GameScene.js (lines 333-340) polls every 200ms to check if the connection is ready. There is no retry limit or timeout — it polls forever.
Why it matters: If the connection establishes but the join message is lost, the player is stuck forever in the lobby. Combined with the missing connect_error handler, this creates a "silent death" scenario.
What to do: Add a maximum retry count (e.g., 50 attempts = 10 seconds) and show an error if the join fails.

**GameScene.js is too large (2,294 lines)**
What this means: This single file handles rendering, input, networking, physics reconciliation, arena drawing, obstacles, spectator mode, and visual effects. It's the "do everything" file.
Why it matters: As new features are added, this file will become harder to modify without breaking something. Finding a specific piece of logic takes increasingly longer.
What to do: Extract the networking callbacks (lines 222-341) into a separate handler, and consider extracting arena/obstacle rendering into its own module.

**No asset load error handling**
What this means: BootScene loads dozens of images, spritesheets, and JSON files but has no `this.load.on('loaderror', ...)` handler. If a critical asset fails to download, the game proceeds with missing textures.
Why it matters: On slow connections or if a CDN hiccups, the player gets visual glitches with no explanation.
What to do: Add a load error handler that counts failures and shows a warning if critical assets are missing.

**Dead code in shared message types**
What this means: Several message constants are defined but never used: `CLIENT_READY`, `SERVER_SPELL_CONFIRM`, `SERVER_SPELL_DENY`. Several RoomManager methods are never called: `findOrCreateRoom()`, `findPlayerRoom()`, `cleanup()`.
Why it matters: Dead code is confusing for anyone reading the codebase and suggests incomplete features.
What to do: Remove unused message types and methods, or mark them with comments explaining their future purpose.

**returnToMenu() logic duplicated**
What this means: The "return to main menu" cleanup code is written identically in both PauseMenu.js (line 238-257) and MatchEndOverlay.js (line 261-277).
Why it matters: If the cleanup steps change, both files must be updated in sync. Easy to miss one.
What to do: Extract into a shared utility function in UIHelpers.js or a new MenuUtils.js.

---

### 🟢 Good to Know — Low Priority

**Duplicate passive effect on two characters**
What this means: Boran (fighter-white) and Govel Ayse (ninja-green) both have `mobilityRangeBonus: 0.20` as their passive, making them mechanically identical despite having different names.
Why it matters: Players may feel cheated when two characters play the same.
What to do: Differentiate the passives if intended to be unique, or document that they share the same bonus.

**Font constant declared in multiple files**
What this means: The Press Start 2P font string is declared as a local constant in BootScene.js, MenuScene.js, config.js, and UIConfig.js (4 places).
Why it matters: If the font ever changes, all 4 files need updating.
What to do: Import from UIConfig.js everywhere instead of redeclaring.

**Redundant logo load in BootScene**
What this means: BootScene loads `ui-logo` twice — once inline (line 99) for the loading screen, and again in the main preload (line 327). Phaser deduplicates silently.
Why it matters: No functional impact, just unnecessary.
What to do: Remove the second load call.

**PauseMenu depth uses ad-hoc offset**
What this means: PauseMenu.js adds 100 to `DEPTH.OVERLAY_DIM` instead of using a named constant.
Why it matters: Bypasses the centralized depth system in UIConfig.js.
What to do: Add `DEPTH.PAUSE_MENU` constant in UIConfig.js.

**window.__gameScene exposed globally**
What this means: The full game scene object is accessible from the browser console.
Why it matters: Not a real security risk since the client is untrusted anyway, but it makes it slightly easier for players to inspect game state.
What to do: Only expose in development builds, or leave as-is (low priority).

---

## Debt Level
**Building Up**
The codebase is well-organized with clean separation between client, server, and shared code. The spell handler pattern and UI component system are good. However, GameScene.js at 2,294 lines is becoming a monolith, there are a few instances of duplicated logic, and the font constant is scattered. The debt is manageable now but will compound if new features keep landing in GameScene.js.

## Documentation Status
- **DESIGN_SYSTEM.md**: Exists and is current (updated today). Covers colors, typography, spacing, and component patterns well.
- **PROJECT.md**: Does not exist. The project lacks a high-level overview, architecture description, and setup instructions.
- **Inline comments**: Good quality overall. Key decisions are explained with "why" comments, especially in physics tuning and reconciliation logic.
- **Onboarding**: A new developer could orient in ~15-20 minutes by reading constants.js and the shared files, but there's no quick-start guide.

## Recommended Next Steps
1. **Fix the connection timeout** — Add `connect_error` handler in NetworkManager.js and a 10-second timeout in the tryJoin loop. Show an error message with a "return to menu" button when connection fails. This is almost certainly why serbest mode isn't starting.
2. **Check Railway CORS_ORIGINS** — Verify that `CORS_ORIGINS` env var is set in Railway to include your production URL (e.g., `https://your-app.up.railway.app`), or change the server default to `origin: true`.
3. **Add load error handler** — Add `this.load.on('loaderror', ...)` in BootScene to catch and report missing assets instead of silently proceeding.
4. **Extract GameScene networking** — Move the 120-line `connectToServer()` method and its callbacks into a dedicated `GameNetworkHandler.js` to reduce GameScene size.
5. **Create PROJECT.md** — Add a quick-start guide with setup instructions, architecture overview, and how to run dev/prod builds.

---
*Generated by Code Auditor skill. Findings reflect the state of the project at the time of the audit.*
