# AGENTS.md

# Project Engineering Guidelines

## 1. Project Overview

This project is a lightweight 3D real-time strategy game built initially with Three.js and TypeScript, targeting mobile phones and tablets.

The core gameplay loop is intentionally simple:

- Players build and upgrade factories using gold.
- Factories automatically produce units when sufficient resources are available.
- Units move toward the enemy and engage hostile units automatically.
- Players manage their economy, production, and defensive structures in real time.
- Combat performance unlocks special abilities or weapon rewards, which players activate strategically.
- The objective is to destroy the enemy base.

The game must remain easy to understand, responsive, performant, and extensible without introducing unnecessary strategic complexity.

The long-term rendering-engine candidate is Babylon.js. A migration is optional and must only be undertaken when explicitly requested or justified by measured technical requirements.

---

## 2. Core Engineering Principles

Follow these principles for every implementation:

1. Prefer simple, maintainable solutions over unnecessary abstractions.
2. Keep gameplay logic independent of the rendering engine.
3. Use data-oriented ECS architecture for gameplay entities and systems.
4. Keep menus, configuration screens, and non-gameplay UI outside the ECS.
5. Design for mobile performance from the beginning.
6. Measure performance before introducing complex optimizations.
7. Make changes incrementally and preserve existing working functionality.
8. Reuse existing dependencies, utilities, and conventions before introducing new ones.
9. Avoid implementing speculative features or building infrastructure without a concrete requirement.
10. Keep documentation and tests aligned with actual behavior.

Do not introduce Unity or migrate rendering engines unless explicitly requested.

---

## 3. TypeScript Standards

- Use TypeScript with strict type checking enabled.
- Avoid `any`. Prefer explicit types, interfaces, discriminated unions, and `unknown` with proper narrowing.
- Avoid unnecessary type assertions and non-null assertions.
- Model domain concepts with clear, descriptive names.
- Keep functions and modules focused on a single responsibility.
- Prefer immutable configuration data when practical.
- Separate runtime state from static definitions.
- Avoid circular dependencies.
- Do not use rendering-engine objects as general-purpose gameplay data.
- Follow the repository's existing formatting, linting, naming, and module conventions.
- Do not weaken TypeScript compiler settings to make an implementation pass.

Add dependencies only when they solve a demonstrated problem. Explain significant dependency or architectural changes in the implementation summary.

---

## 4. ECS Architecture

Use an Entity Component System for gameplay entities and simulation.

The ECS should manage concepts such as:

- Units and enemy units
- Factories and other gameplay structures
- Projectiles
- Targets and destructible objects
- Health, damage, factions, movement, and combat
- Production, resources, and upgrades
- Streak progression and special abilities

### 4.1 Entities

Entities represent gameplay objects through identity and component composition.

Examples include a soldier, projectile, factory, defensive tower, and destructible base.

Do not place rendering-engine objects or complex behavior inside entity definitions.

### 4.2 Components

Components should primarily contain gameplay data.

Potential components include:

- `Transform`
- `Velocity`
- `Health`
- `Faction`
- `Movement`
- `Weapon`
- `Projectile`
- `Targetable`
- `Production`
- `Building`
- `GoldCost`
- `Renderable`
- `AIController`
- `StreakProgress`

Create components only when required by actual gameplay features. Do not create a component for every individual property without a clear architectural benefit.

### 4.3 Systems

Systems implement gameplay behavior by processing entities that have the required components.

Potential systems include:

- `EconomySystem`
- `ProductionSystem`
- `MovementSystem`
- `TargetingSystem`
- `CombatSystem`
- `ProjectileSystem`
- `DamageSystem`
- `DeathSystem`
- `StreakSystem`
- `RewardActivationSystem`
- `BaseSystem`

Keep systems focused. Explicitly define update ordering wherever one system depends on another.

For example, movement and gameplay state should be updated before their corresponding visual representations are synchronized.

### 4.4 UI and ECS Boundaries

Menus, settings, configuration screens, and ordinary UI state must not be forced into the ECS.

The UI can issue gameplay commands and subscribe to game-state notifications through clear interfaces.

Do not make UI components directly mutate arbitrary ECS internals.

### 4.5 ECS Library

Use the ECS library already selected by the project.

If no library has been selected, evaluate lightweight TypeScript-compatible ECS libraries before building a custom ECS. Select an implementation based on project requirements, maintainability, and measured performance rather than theoretical entity counts alone.

---

## 5. Rendering Engine Independence

Three.js is the initial rendering engine. Babylon.js is a possible future replacement.

Gameplay systems must not directly import Three.js or Babylon.js.

Do not reference types such as `THREE.Object3D`, `THREE.Mesh`, or Babylon-specific scene objects in gameplay-domain modules.

### 5.1 Rendering Adapter

Keep engine-specific implementation details inside the rendering layer.

Use small interfaces for real engine-dependent operations, such as:

- Loading models
- Creating and releasing visual objects
- Updating visual transforms
- Controlling animation
- Managing rendering resources
- Rendering effects

The ECS stores gameplay state. The rendering adapter maps that state to visual representations.

Avoid creating a universal engine abstraction. Add an interface only when it isolates a real dependency or provides a concrete testing benefit.

### 5.2 Asset Reuse

Prefer portable asset formats such as glTF/GLB when appropriate.

Reuse existing models, textures, audio, and animations whenever compatible. Keep asset identifiers and gameplay definitions independent of engine-specific runtime objects.

A future Babylon.js migration will require adapting engine-specific rendering, materials, animation, resource loading, and effects. Do not claim that a migration is automatic simply because gameplay modules are decoupled.

Do not implement the Babylon.js adapter until there is a concrete requirement to do so.

---

## 6. Game Simulation and Timing

Keep gameplay simulation separate from the rendering frame rate.

- Use a controlled timestep for simulation where appropriate.
- Prefer a fixed-step simulation with an accumulator when gameplay consistency requires it.
- Clamp unusually large frame-time deltas.
- Define a maximum amount of simulation catch-up work per rendered frame.
- Do not allow a long background pause to produce a large, uncontrolled simulation step.
- Keep movement, attack cooldowns, production timers, and effect durations based on elapsed time, not on an assumed number of frames per second.
- Use the rendering engine's recommended animation-loop integration, such as Three.js `renderer.setAnimationLoop()`.
- Pause or appropriately suspend gameplay when the application enters the background.
- Resume without applying a large unintended time delta.

Do not implement deterministic lockstep networking or a complex simulation framework unless required by the project.

---

## 7. Mobile Performance Requirements

Mobile performance is a primary engineering concern.

Optimize both rendering and ECS simulation. Rendering optimization alone is not sufficient when many units, projectiles, or combat effects are active.

### 7.1 Initial Performance Targets

Use these as initial targets, not universal hardware guarantees:

- Aim for 60 FPS on capable mobile devices.
- Maintain a stable 30 FPS or better on the agreed minimum supported devices.
- Aim for fewer than 100 draw calls per frame where practical.
- Target an initial load time of approximately 2–6 seconds on a representative 4G connection.
- Avoid sustained frame-time spikes during combat.
- Test for memory growth and thermal performance during sessions lasting at least 10 minutes.

A target is not proof of performance. Validate results on real devices and record the tested device, scenario, and measurements.

### 7.2 Renderer Configuration

- Limit the device pixel ratio initially, for example:

  `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))`

- Make pixel ratio and rendering quality configurable where appropriate.
- Evaluate disabling antialiasing on lower-end devices.
- Keep `preserveDrawingBuffer` disabled unless a documented feature requires it.
- Treat `powerPreference: "high-performance"` as a hint, not a guarantee.
- Do not globally force shader precision to `mediump` without checking shader requirements and visual correctness.
- Prefer `renderer.setAnimationLoop()` for the Three.js render loop.
- Avoid rendering continuously when the game is paused or the application is inactive.
- Handle viewport resizing and device orientation changes.

### 7.3 Geometry and Draw Calls

- Reuse geometries and materials whenever possible.
- Use `InstancedMesh` for repeated compatible objects such as soldiers, bullets, and environmental objects.
- Verify that instancing is appropriate for models with unique animation, material, or gameplay requirements.
- Merge static geometry when individual objects do not need to move, animate, or be managed separately.
- Do not merge objects indiscriminately if doing so harms culling, asset management, or gameplay requirements.
- Avoid allocating new vectors, matrices, geometries, materials, or temporary objects inside hot update loops.
- Prefer object pooling for frequently spawned and destroyed objects.
- Use simpler models or levels of detail when distance and visibility justify them.
- Preserve frustum culling and verify custom batching does not bypass visibility checks.

The draw-call target is a profiling goal, not a hard correctness rule. Do not sacrifice maintainability or visual correctness solely to satisfy an arbitrary count.

### 7.4 Materials, Lighting, and Effects

- Prefer a stylized, efficient visual style appropriate for a lightweight strategy game.
- Use simpler materials where they achieve the desired appearance.
- Do not assume that all physically based materials are too expensive; profile actual scenes.
- Limit expensive dynamic lighting and shadows on mobile.
- Prefer baked or inexpensive shadow techniques for static scenery where appropriate.
- Avoid unnecessary transparency and excessive overdraw.
- Avoid expensive post-processing by default.
- Introduce bloom, screen-space ambient occlusion, depth of field, and other costly effects only when justified by visual value and measured performance.
- Pool and reuse particles and temporary effects.
- Set reasonable limits for simultaneous explosions, smoke, projectiles, and other effects.

### 7.5 Textures, Assets, and Memory

- Use appropriately sized textures; 512–1024 pixels is a useful starting range for many mobile assets, not a universal maximum.
- Reuse textures and materials when possible.
- Evaluate KTX2/Basis texture compression for suitable assets.
- Evaluate Draco or Meshopt compression based on download size, decoding cost, and supported asset pipelines.
- Avoid unnecessarily large HDR environments and skyboxes.
- Load essential assets first and defer optional assets when appropriate.
- Display loading progress when meaningful progress information is available.
- Explicitly dispose of unused geometries, materials, textures, render targets, and other GPU resources.
- Ensure pooled resources are not disposed while still in use.
- Check resource cleanup when units, projectiles, effects, scenes, or matches are removed.
- Monitor resource counts and memory behavior during repeated matches.

Do not add asset compression or loading complexity without measuring its impact on the actual build pipeline.

### 7.6 ECS Simulation Performance

- Avoid checking every unit against every other unit on every frame when a more efficient approach is available.
- Begin with simple targeting and collision logic appropriate for the battlefield.
- Introduce spatial partitioning, such as a grid or spatial hash, when measurements show that target searches or collision checks are expensive.
- Avoid per-entity allocations in frequently executed systems.
- Pool projectiles and short-lived gameplay objects where appropriate.
- Limit expensive AI decisions to a reasonable update frequency.
- Separate essential simulation work from purely visual updates.
- Profile production, targeting, movement, combat, and collision systems independently when necessary.
- Do not add multithreading, Web Workers, or advanced data-oriented optimizations without demonstrated need.

---

## 8. Gameplay Extensibility

New gameplay content should extend existing systems rather than introduce unnecessary special cases.

### 8.1 Factories and Economy

Factory definitions should describe relevant properties such as:

- Construction cost
- Production cost
- Production interval
- Produced unit type
- Upgrade options
- Health and faction

Keep static definitions separate from runtime entity state.

Gold spending and reward eligibility must be validated by the gameplay domain, not solely by UI controls.

### 8.2 Units and Combat

Keep movement, targeting, attacks, damage, and death handling in appropriately separated systems.

Do not let a unit depend on rendering details to decide whether it can move, attack, or take damage.

Avoid building a traditional unit-command system unless the gameplay requirements change. The current design relies on automatic advancement and combat.

### 8.3 Streak Rewards and Special Weapons

The streak system should be separate from individual reward implementations.

A reward may represent artillery, reinforcements, a temporary shield, or another special ability.

Keep these responsibilities distinct:

- Tracking qualifying combat events
- Updating streak progress
- Unlocking available rewards
- Validating reward activation
- Executing the reward's gameplay effect
- Updating UI availability and cooldown information

Do not hardcode every reward into the main combat system.

Make reward thresholds, costs, durations, and other balancing values configurable where appropriate.

Reward activation must be explicit when the design requires the player to choose when to use it.

### 8.4 Scope Control

Implement only the features required by the current task.

Do not introduce complex pathfinding, advanced physics, networking, a general-purpose ability framework, or elaborate AI behavior unless gameplay requires it.

Prefer the simplest implementation that supports the current design while preserving clear extension points.

---

## 9. Input, UI, and Application Lifecycle

- Support touch input as a first-class input method.
- Provide sufficiently large and well-spaced touch targets; approximately 44 × 44 CSS pixels is a useful starting guideline.
- Handle portrait and landscape orientation according to the chosen game layout.
- Prevent accidental page zoom or scrolling within the gameplay surface without unnecessarily disabling normal UI interactions.
- Keep UI implementation independent of the ECS and rendering engine where practical.
- Provide clear pause, resume, and application-background behavior.
- Ensure menus and settings do not require rendering the entire 3D scene at full frame rate when that is unnecessary.
- Test touch input and UI behavior on real devices.

If the project uses Capacitor, follow its lifecycle APIs and conventions rather than relying only on browser-specific events.

---

## 10. Testing and Quality Assurance

Use the repository's existing test framework. Do not introduce a new testing framework without a clear reason.

Write tests for gameplay logic where practical, especially:

- Gold income, spending, and insufficient-resource cases
- Factory production intervals
- Unit movement and automatic target selection
- Attack cooldowns and damage calculations
- Unit and building destruction
- Base health and victory/defeat conditions
- Streak progress and reward eligibility
- Reward activation, limits, and cooldowns
- Pause/resume and simulation timing behavior

Prefer tests that validate observable behavior rather than internal implementation details.

Where appropriate, make gameplay logic testable without initializing WebGL or a rendering engine.

Use integration tests to validate interactions between systems. Do not rely exclusively on unit tests for ECS behavior.

Avoid flaky tests that depend on uncontrolled wall-clock timing or nondeterministic random values. Provide controllable time and randomness where this offers practical benefits.

---

## 11. Performance Monitoring and Device Testing

During development, provide a way to inspect relevant metrics, including:

- FPS and frame time
- Rendering draw calls
- Triangle counts
- Geometry and texture counts
- Number of active gameplay entities
- Number of active projectiles and effects
- Time spent in important ECS systems
- Memory behavior where measurable

Use Three.js `renderer.info` for relevant rendering metrics, but do not treat it as a complete memory or performance profiler.

Validate performance with representative combat scenarios, not only idle scenes or menus.

The device matrix should include, when available:

- A lower-end Android phone
- A mid-range Android phone
- An older supported iPhone
- A recent iPhone
- An iPad or Android tablet

Check orientation changes, network conditions, background/foreground transitions, repeated matches, and extended play sessions.

Desktop browser emulation is useful for development but is not a substitute for real-device testing.

If a physical device is unavailable, document the limits of the validation and do not claim that real-device performance has been verified.

---

## 12. Asset Loading and Distribution

- Keep the initial application bundle as small as reasonably possible.
- Separate essential startup assets from optional or later-stage content.
- Avoid loading every weapon model, effect, and environment asset before the first playable screen when they are not needed.
- Use a loading screen when startup asset loading is noticeable.
- Evaluate browser caching and service workers if the game is distributed as a PWA.
- Test offline behavior only if it is an explicit product requirement.
- If packaging through Capacitor, validate rendering performance inside the actual mobile application, not only in a desktop or mobile browser.
- Do not assume that packaging a web game as a native application automatically improves rendering performance.

---

## 13. AI Agent Workflow

Before implementing a task:

1. Inspect the relevant source code, repository structure, dependencies, and existing conventions.
2. Identify which modules are responsible for the requested behavior.
3. Check whether an existing component, system, utility, or test can be extended.
4. Identify architectural boundaries that must remain intact.
5. Choose the smallest reasonable implementation.

While implementing:

- Make focused changes related to the requested task.
- Respect existing module boundaries and public interfaces.
- Avoid unrelated refactoring.
- Do not duplicate existing functionality under a new name.
- Do not introduce a dependency or generic framework without a clear justification.
- Add or update tests where applicable.
- Update relevant documentation when behavior or architecture changes.
- Preserve backward compatibility unless a breaking change is explicitly required.
- Do not silently change gameplay balance or intended behavior.

After implementing:

1. Run the relevant tests and available linting/type-checking commands.
2. Inspect the final changes for unintended modifications.
3. Report what changed, which checks were run, and any checks that could not be performed.
4. Clearly disclose known limitations and unverified assumptions.
5. Do not claim that tests, builds, device checks, or profiling succeeded unless they were actually executed and succeeded.

If a requirement conflicts with these guidelines, explain the conflict and choose the smallest safe change that satisfies the explicit requirement.

---

## 14. Definition of Done

A task is complete when:

- The requested behavior is implemented.
- The implementation follows the existing architecture and these guidelines.
- Type checking and relevant tests pass, or failures and limitations are documented accurately.
- No unnecessary dependencies or unrelated refactors were introduced.
- Resource ownership and cleanup have been considered for rendering-related changes.
- Mobile performance implications have been considered for gameplay or rendering changes.
- Relevant documentation is updated.
- The final implementation summary accurately describes the changes and verification performed.

The overall priority is to keep the game fun, simple, maintainable, and performant on mobile devices while preserving the option to replace Three.js with Babylon.js in the future.
