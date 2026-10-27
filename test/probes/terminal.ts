// Run by test/terminal-env.test.ts in a child `bun test`, so test/setup.ts is
// preloaded exactly as in the suite: prints what chalk and @inquirer/prompts
// resolved from the environment setup.ts left behind.
import figures from '@inquirer/figures';
import chalk from 'chalk';

console.log(JSON.stringify({ level: chalk.level, pointer: figures.pointer }));
