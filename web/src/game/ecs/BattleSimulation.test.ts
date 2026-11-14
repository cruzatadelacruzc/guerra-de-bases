import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleSimulation, SIMULATION_PHASES } from './BattleSimulation.ts';
import type { SimulationPhase, SimulationProfiler } from './BattleSimulation.ts';

function createRecordingProfiler(): SimulationProfiler & { phases: SimulationPhase[] } {
  let clock = 0;
  const phases: SimulationPhase[] = [];
  return {
    phases,
    now: () => clock++,
    record: (phase) => {
      phases.push(phase);
    }
  };
}

test('a profiler hears every simulation phase once per fixed step, in update order', () => {
  const profiler = createRecordingProfiler();
  const simulation = new BattleSimulation({ profiler });

  simulation.advance(1 / 15);

  assert.equal(simulation.lastStepCount, 2);
  assert.deepEqual(profiler.phases, [...SIMULATION_PHASES, ...SIMULATION_PHASES]);
});

test('the step count reports the capped catch-up work of the last frame', () => {
  const simulation = new BattleSimulation();
  simulation.advance(0);
  assert.equal(simulation.lastStepCount, 0);
  simulation.advance(1);
  assert.equal(simulation.lastStepCount, 3);
});

test('profiling does not change the simulated outcome', () => {
  const plain = new BattleSimulation();
  const profiled = new BattleSimulation({ profiler: createRecordingProfiler() });
  for (let frame = 0; frame < 120; frame++) {
    plain.advance(1 / 60);
    profiled.advance(1 / 60);
  }
  assert.deepEqual(plain.drainGeneratedIncome(), profiled.drainGeneratedIncome());
});
