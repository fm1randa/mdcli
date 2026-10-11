import { $ } from 'bun';

interface OnePasswordCredentials {
  username: string;
  password: string;
  otp: string;
}

interface OpFieldResponse {
  id: string;
  label: string;
  value?: string;
  totp?: string;
  type?: string;
  reference?: string;
}

export async function getCredentialsFromOnePassword(itemName: string): Promise<OnePasswordCredentials> {
  const result =
    await $`op item get ${itemName} --fields label=username,label=password,label=otp --format json`.text();

  const fields = JSON.parse(result) as OpFieldResponse[];
  const fieldMap = new Map(fields.map((f) => [f.label.toLowerCase(), f.totp ?? f.value]));

  const username = fieldMap.get('username');
  const password = fieldMap.get('password');
  const otp = fieldMap.get('otp');

  if (!username || !password || !otp) {
    const missing = [];
    if (!username) missing.push('username');
    if (!password) missing.push('password');
    if (!otp) missing.push('otp');
    throw new Error(`Missing credentials from 1Password: ${missing.join(', ')}`);
  }

  return { username, password, otp };
}
