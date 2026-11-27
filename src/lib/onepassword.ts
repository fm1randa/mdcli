import { t } from './i18n/index.js';
import { $ } from 'bun';
import { asRecord, textOrNull } from './payload.js';

interface OnePasswordCredentials {
  username: string;
  password: string;
  otp: string;
}

/** The parts of an `op item get --format json` field the login reads. */
interface OpField {
  label: string;
  value?: string;
  totp?: string;
}

/** The fields `op` printed; one without a string label, or a value or totp
 * that is not a string, is skipped, so it counts as missing below. */
function parseOpFields(output: unknown): OpField[] {
  const items: unknown[] = Array.isArray(output) ? output : [];
  return items.flatMap((item): OpField[] => {
    const field = asRecord(item);
    const label = textOrNull(field?.label);
    if (label === null) return [];
    return [{ label, value: textOrNull(field?.value) ?? undefined, totp: textOrNull(field?.totp) ?? undefined }];
  });
}

export async function getCredentialsFromOnePassword(itemName: string): Promise<OnePasswordCredentials> {
  const result =
    await $`op item get ${itemName} --fields label=username,label=password,label=otp --format json`.text();

  const fields = parseOpFields(JSON.parse(result));
  const fieldMap = new Map(fields.map((f) => [f.label.toLowerCase(), f.totp ?? f.value]));

  const username = fieldMap.get('username');
  const password = fieldMap.get('password');
  const otp = fieldMap.get('otp');

  if (!username || !password || !otp) {
    const missing = [];
    if (!username) missing.push('username');
    if (!password) missing.push('password');
    if (!otp) missing.push('otp');
    throw new Error(t('errorMissingOnePasswordCredentials', missing.join(', ')));
  }

  return { username, password, otp };
}
