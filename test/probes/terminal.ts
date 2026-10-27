// Run by test/terminal-env.test.ts in a child `bun test`, so test/setup.ts is
// preloaded exactly as in the suite: prints what chalk and the prompt menus
// resolved from the environment setup.ts left behind. chalk colors the CLI
// output; the pointer is @inquirer/figures', which @inquirer/prompts draws its
// menus with. figures is imported here directly (it is a devDependency), so
// bump that range together with prompts: a figures major there would install
// two copies and this probe would report the one the menus no longer use.
import figures from '@inquirer/figures';
import chalk from 'chalk';

console.log(JSON.stringify({ level: chalk.level, pointer: figures.pointer }));
