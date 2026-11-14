/**
 * TEMPORARY (R3): proves the extracted DeathResolver matches the legacy
 * transcription frame by frame on seeded random battles. Deleted together
 * with legacyDeathReference.ts at the end of R3.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Entity, Faction, SoldierKind } from '../ecs/components.ts';
import { requestUnitProduction } from '../ecs/systems.ts';
import type { Difficulty } from '../rewardSystem.ts';
import { MatchHarness } from './matchHarness.ts';

const BATTLES_PER_DIFFICULTY = 100;
const MAX_FRAMES = 400;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Applies the same random operations to both harnesses so their worlds stay in lockstep. */
class Script {
  readonly #random: () => number;
  constructor(seed: number) {
    this.#random = mulberry32(seed);
  }
  next(): number {
    return this.#random();
  }
  int(maxExclusive: number): number {
    return Math.floor(this.#random() * maxExclusive);
  }
  pick<T>(values: readonly T[]): T {
    return values[this.int(values.length)];
  }
}

const FACTIONS: readonly Faction[] = ['player', 'enemy'];
const STRUCTURES = ['generator', 'barracks', 'turret'] as const;
const UNITS: readonly SoldierKind[] = ['rifleman', 'tank'];

function liveEntities(match: MatchHarness): Entity[] {
  return match.simulation.world.query('health').sort((a, b) => a - b);
}

function allEntities(match: MatchHarness): Entity[] {
  return match.simulation.world.query().sort((a, b) => a - b);
}

test('the extracted death resolution matches the legacy rules frame by frame', () => {
  let battles = 0;
  let endings = 0;
  let deaths = 0;
  let framesCompared = 0;
  let ties = 0;

  for (const difficulty of ['easy', 'normal', 'hard'] as const satisfies readonly Difficulty[]) {
    for (let battle = 0; battle < BATTLES_PER_DIFFICULTY; battle++) {
      const seed = 1000 * (difficulty === 'easy' ? 1 : difficulty === 'normal' ? 2 : 3) + battle;
      const script = new Script(seed);
      const legacy = new MatchHarness('legacy', difficulty);
      const current = new MatchHarness('current', difficulty);
      const both = (action: (match: MatchHarness) => void) => {
        action(legacy);
        action(current);
      };

      for (const faction of FACTIONS) {
        const side = faction === 'player' ? 1 : -1;
        const structureCount = script.int(7);
        for (let index = 0; index < structureCount; index++) {
          const kind = script.pick(STRUCTURES);
          const position = { x: script.next() * 80 - 40, y: 0, z: side * (10 + script.next() * 60) };
          both((match) => match.addStructure(faction, kind, position));
        }
        const unitCount = script.int(13);
        for (let index = 0; index < unitCount; index++) {
          const kind = script.pick(UNITS);
          const position = { x: script.next() * 80 - 40, y: 0, z: side * script.next() * 30 };
          both((match) => match.addSoldier(faction, kind, position));
        }
      }

      for (let frame = 0; frame < MAX_FRAMES && !legacy.ended && !current.ended; frame++) {
        const delta = 0.016 + script.next() * 0.084;
        both((match) => match.advance(delta));

        const roll = script.next();
        if (roll < 0.05) {
          const targets = liveEntities(legacy);
          if (targets.length > 0) {
            const target = script.pick(targets);
            const amount = 50 + script.next() * 350;
            both((match) => match.damage(target, amount));
          }
        } else if (roll < 0.06) {
          const base = script.next() < 0.5 ? legacy.simulation.playerBase : legacy.simulation.enemyBase;
          const amount = 300 + script.next() * 500;
          both((match) => match.damage(base, amount));
        } else if (roll < 0.063) {
          // Both Nexuses in one frame exercises the defeat-first tie-break.
          const amount = 600 + script.next() * 800;
          both((match) => {
            match.damage(match.simulation.playerBase, amount);
            match.damage(match.simulation.enemyBase, amount);
          });
        } else if (roll < 0.08) {
          const faction = script.pick(FACTIONS);
          const kind = script.pick(UNITS);
          const position = { x: script.next() * 80 - 40, y: 0, z: (faction === 'player' ? 1 : -1) * script.next() * 30 };
          both((match) => match.addSoldier(faction, kind, position));
        } else if (roll < 0.11) {
          const faction = script.pick(FACTIONS);
          const factories = legacy.simulation.world.query('factory', 'faction')
            .filter((entity) => legacy.simulation.world.getComponent(entity, 'faction') === faction)
            .sort((a, b) => a - b);
          if (factories.length > 0) {
            const factory = script.pick(factories);
            const kind = script.pick(UNITS);
            both((match) => requestUnitProduction(
              match.simulation.world,
              factory,
              faction === 'player' ? match.simulation.playerBase : match.simulation.enemyBase,
              kind
            ));
          }
        }

        const expected = legacy.processFrame();
        const actual = current.processFrame();
        assert.deepEqual(actual, expected, `${difficulty} battle ${battle} frame ${frame}`);
        assert.deepEqual(allEntities(current), allEntities(legacy), `${difficulty} battle ${battle} frame ${frame} entities`);
        deaths += expected.removed.length;
        framesCompared++;
      }

      assert.equal(current.ended, legacy.ended, `${difficulty} battle ${battle} ended`);
      if (legacy.ended) endings++;
      if (legacy.ended && !legacy.simulation.world.getComponent(legacy.simulation.enemyBase, 'health')
        && !legacy.simulation.world.getComponent(legacy.simulation.playerBase, 'health')) ties++;
      battles++;
    }
  }

  // The battles must actually exercise deaths and match endings.
  assert.ok(endings >= battles * 0.2, `only ${endings} of ${battles} battles ended`);
  assert.ok(deaths > battles * 5, `only ${deaths} deaths`);
  assert.ok(ties > 0, 'no battle ended with both Nexuses falling in the same frame');
  console.info(`[differential] ${battles} battles, ${framesCompared} frames, ${deaths} deaths, ${endings} endings (${ties} with both Nexuses), 0 differences`);
});
