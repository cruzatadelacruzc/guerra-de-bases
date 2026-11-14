import { FACTIONS } from '../ecs/components.ts';
import type { MatchEvent } from './matchEvents.ts';

/** A call to the unlock service, with the event names and payloads it has always received. */
export interface UnlockCall {
  readonly name: 'unit_killed' | 'kill_streak' | 'achievement';
  readonly payload: Readonly<Record<string, unknown>>;
}

const NO_CALLS: readonly UnlockCall[] = Object.freeze([]);

/** What the unlock service is told about a death; structures report nothing. */
export function unlockEventsFor(event: MatchEvent): readonly UnlockCall[] {
  if (event.type !== 'unitDied') return NO_CALLS;
  if (event.faction === FACTIONS.player) {
    return [{ name: 'unit_killed', payload: { byPlayer: false, killStreak: event.killerStreak, unitType: event.kind } }];
  }
  const calls: UnlockCall[] = [
    { name: 'unit_killed', payload: { byPlayer: true, killStreak: event.killerStreak, unitType: event.kind } },
    { name: 'kill_streak', payload: { killStreak: event.killerStreak } }
  ];
  if (event.playerReachedTwentyKills) {
    calls.push({ name: 'achievement', payload: { achievement: 'destroy_20_units' } });
  }
  return calls;
}
