// Resolves the language at import time, before src/program.ts builds the
// command tree (bin/cli.ts imports this module first), so the help text and
// every message are created in the language the user chose.
import { bootstrapLanguage } from './index.js';

bootstrapLanguage();
