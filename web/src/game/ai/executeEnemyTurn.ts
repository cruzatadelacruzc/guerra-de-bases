import type { CommandContext } from '../commands/CommandContext.ts';
import { activateReward } from '../commands/rewardCommand.ts';
import { buildStructure } from '../commands/structureCommands.ts';
import { trainUnit } from '../commands/trainCommand.ts';
import { ENEMY_AIR_STRIKE_HEADING } from '../rewardSystem.ts';
import type { EnemyAiCommand, EnemyAiTurn } from './enemyAi.ts';

export type EnemyCommandOutcome =
  | { readonly command: Extract<EnemyAiCommand, { type: 'build' }>; readonly result: ReturnType<typeof buildStructure> }
  | { readonly command: Extract<EnemyAiCommand, { type: 'train' }>; readonly result: ReturnType<typeof trainUnit> }
  | { readonly command: Extract<EnemyAiCommand, { type: 'activateReward' }>; readonly result: ReturnType<typeof activateReward> };

/**
 * Carries out the AI's orders through the same commands the player uses, in order.
 * The AI does not react to rejections; the caller only represents what was accepted.
 */
export function executeEnemyTurn(ctx: CommandContext, turn: EnemyAiTurn): readonly EnemyCommandOutcome[] {
  return turn.commands.map((command): EnemyCommandOutcome => {
    if (command.type === 'build') {
      return { command, result: buildStructure(ctx, 'enemy', command.kind, command.position) };
    }
    if (command.type === 'train') {
      return { command, result: trainUnit(ctx, 'enemy', command.factory, command.unit, command.spawnPosition) };
    }
    return { command, result: activateReward(ctx, 'enemy', command.reward, { heading: ENEMY_AIR_STRIKE_HEADING }) };
  });
}
