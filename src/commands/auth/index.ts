import { Command } from 'commander';
import { t } from '../../lib/i18n/index.js';
import { doctorAction } from './doctor.js';
import { loginAction } from './login.js';
import { logoutAction, statusAction } from './status.js';

export const authCommand = new Command('auth')
  .description(t('authManageDescription'));

authCommand
  .command('login')
  .description(t('authLoginDescription'))
  .option('-m, --manual', t('authLoginManualOption'))
  .option('-b, --browser', t('authLoginBrowserOption'))
  .option('-s, --session [browser]', t('authLoginSessionOption'))
  .option('-i, --item <name>', t('authLoginItemOption'))
  .option('-c, --captcha-key <key>', t('authLoginCaptchaOption'))
  .action(loginAction);

authCommand
  .command('status')
  .description(t('authStatusDescription'))
  .action(statusAction);

authCommand
  .command('logout')
  .description(t('authLogoutDescription'))
  .option('--all', t('authLogoutAllOption'))
  .action(logoutAction);

authCommand
  .command('doctor')
  .description(t('authDoctorDescription'))
  .action(doctorAction);
