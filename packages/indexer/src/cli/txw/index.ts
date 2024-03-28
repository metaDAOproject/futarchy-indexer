import { Command } from 'commander';
import { create } from './create';
import { reset } from './reset';

export function txw(cmd: Command) {
  cmd
    .command('reset')
    .action(reset);
  cmd
    .command('create')
    .action(create);
}
