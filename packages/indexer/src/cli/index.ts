import { program } from 'commander';
import { txw } from './txw';

txw(program.command('txw'))
program.parse();
