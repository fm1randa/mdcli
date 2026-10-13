import { Command } from 'commander';
import { doctorAction } from './doctor.js';
import { loginAction } from './login.js';
import { logoutAction, statusAction } from './status.js';

export const authCommand = new Command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Authenticate with Meu Dinheiro (uses 1Password by default)')
  .option('-m, --manual', 'Manually enter authentication headers')
  .option('-b, --browser', 'Open browser for manual login')
  .option('-s, --session [browser]', 'Extract session from browser profile (chrome|edge|firefox)')
  .option('-i, --item <name>', '1Password item name (saved to config)')
  .option('-c, --captcha-key <key>', '2captcha API key for solving reCAPTCHA (saved to config)')
  .action(loginAction);

authCommand
  .command('status')
  .description('Show current authentication status')
  .action(statusAction);

authCommand
  .command('logout')
  .description('Remove the stored session (use --all to also clear the saved 1Password item and 2captcha key)')
  .option('--all', 'Also clear the saved 1Password item and 2captcha API key')
  .action(logoutAction);

authCommand
  .command('doctor')
  .description('Diagnose common authentication problems (browser profiles, 1Password CLI, current session)')
  .action(doctorAction);
