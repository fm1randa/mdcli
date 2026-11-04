import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SHA-256 of the normalized real-account terms this repository must never
 * carry again: account, card and entry names, their API ids, and the agent
 * that used the real account. The terms themselves are deliberately absent;
 * regenerate a hash from the lowercase, accent-free term with `termHash`.
 */
export const PRIVATE_TERM_HASHES: ReadonlySet<string> = new Set([
  '44c2fc7b06e5b214c7e9febbf3c0a2487b83a8ed062c3a8df7f7617748a399db',
  'd8c32b112b983da85ff60a1d38147df5ec44f7aa83adba827139304d4fabd83e',
  '618f8eb517006c3705febc920e770dc31318cf1fe62de0f2d655e81a7d9f4212',
  'e477e4997860673577f08a2003e4c1494947e6acee5f40541af676c38cd3b3fd',
  'd7412e52cbe5b676ecdc0383c60539c604d0a4089209ab508edbc8d008de1a5b',
  '9267dca0c0156f4874b0806193a884e4466cbe3d77d0542acc25bea2d21607cd',
  'dc9e069f43bb4a9d8127a39dc21b8b2aa80e003795a45c30ec4eedcb8ef8ce67',
  '91f44def89338cddbf0240f93fe9f258afb07ac172baa03f1857a047c1793d2c',
  '87840bf3c34fa5de17e4af0209c458193c99ecd32d1b2781e9bb04551edf3d95',
  '3bd99a93861b1a5838e37cdc039d8084a1fb8e2e16e00e2a01e6a8aaeb028b05',
  '32dff52adeb7ec66988366d1c1a9bfe5bb5415e3898112809e1363d5bdef5a45',
  'd3565d297d476f1033fe752b3df7dbe862befab4393edbb8055b67c49f106f57',
  '5b853d82836df01ca4a6bdf8d7f575444c12d41f45139fb3fc4a888254086494',
  'dbf7e5d0177122073d3d35ba129c953377ace711061247a869d22c6d5216061f',
  '428d48c4f3b4301dd92e84969849339498c5cdf792d9f54aef6debb6b6026695',
  'da4dead062cc66a4db762a779dd1deb35b16652194b70c6b77dab7c78c5cc1b4',
  '656a4c7793134f2ee689b0b7e06ff0c5fee581018020371d1966aa5a3d30b9e5',
  '59329e0ada8116ca7b44ab062cc73326a0f9d9a4b2c829c7f4c32339680a4d83',
  'aaf2fc8bd844fa2ae4f7e88b8e522b24335f8eaa001364c82e0f842a52850aab',
  'fe612351d947b03ac6ca555259e97b5d4f646b1ebc53d7398139bdf00224c3f7',
  'a5637401f70726583dc1af12587eb788645cee7022cf7cb32224dd4588a051ed',
  '244db3e2709437306758b3bd829eef9e4549c2bcdb5cd91ddb33d346d5fa90c5',
  'd701fb262314839e4a432ee07e9ce417be493ecde1e2c40a77b7f669c8da3981',
  'f6d5aef46acfbd2a2f6b91f082dad36d7a7b6f71eb42a04c02be69fb552188c9',
  'fe675fe7aaee830b6fed09b64e034f84dcbdaeb429d9cccd4ebb90e15af8dd71',
  'b281bc2c616cb3c3a097215fdc9397ae87e6e06b156cc34e656be7a1a9ce8839',
  '75992a5ac67ff644d3063976c2effd10bdd93fcc109798e3d5c1acf2e530d01a',
  '7f861bcee185de001377d79e08af62e94b1e7718e2470e08520c917f8d953602',
  '13b7994fae9387c2e1b598524ba1204ae404d02fa67016ed86c74183ab1aafca',
  'e609d533127c0ec82085faf4f164a2957f866ece2ac65d7401f2c7285eade435',
  '4023f322ac7a0e30e78e71cc1e686b2aa43c989d9f55d02412144620ec21a7a2',
  '440565e1c021c5c90b64b8b0575f3eed94231b88f092d6f19f3856be8e9caf84',
  '192183683883f3f6abb60df5a06efecf5ef87b1371bfa5bbcda70a48ea9bf8a0',
  'fd8d2fa63dd4390b2721a82f8c79e6bc8cb69270b278aaf4b0b2be4d0a01c488',
  '9aae171abf0bd05dd4e46c086e43bd1e2492678bb9ca960d314fb8edcf9898b3',
  '648e16a0fbbc258818c7abbab988ae5d97f171789124a914fc80a3d3b8cd5630',
  '8a2bed6d1efce64d43a7b241bf8e8d6db55daacc382ac93bcbbed7eef3ebdeda',
  '80c42860591e2146f41549041a29af4bd59dc099ab41cc61879c1d29a4e50635',
  '73e23b42cbc4aed2d0046f9671f1f47a69341d920ff8680874efca9192fd03f3',
  'a9c9329bc0f333a38d5089302a56ff903bc9aaeef964b518fe37d8fec8a84a59',
  '9e71685b060cfea6d9642d0d4f2312100c4ae568a22d488eb57257b1e9ae93e7',
  '627a25420a3d8a8c5b85304312d6b449165dd74aacf934bfd09181b9eb5c866b',
  'c1f38512a134af2a984756df03aae63098e15e285f13cf4df32a5d7e3bf6ff36',
  'f2cb644dd134e38c62cea4758aa4609d5a2c5f51b13d816facc81fd8966e7652',
  '84b4bdb0d45ad33aebbd965ef8828de8b31693078c114e4c9df64a05f70015d9',
  'adeb0763872da8f591ff0199560846fa5953feb706b06c6278f0da3264a15535',
  '0b42640883b40bfa0ab83ea7d150a1baed683bdb3260ed83a915146482acd7c8',
  '0aa65c3870245921ff532f9750b50d14274376542f5cff258cd88d873ecaa697',
  '5183c8b7dd83b30cc6271cf55e0b633ee8a3618b404ef038795964fae8d2f102',
  'df985c086f21bcc7498f549f5e3eeae4ccdf5d8b8f3adb02e138604ccd00a113',
  '94ba7d0513ce6855b4a385c6dd33e50eae11103d9c85a365d181f3150749af28',
  '7dd0248d9fb95913a88fc477c7ab52b47aefec982dc4747fe8c299e4b37925b0',
  'e94cffcc2bbc263fe4dbd9b64131e6493b8f03f33fe97ec199230b0c2062461c',
  'd337f6a3bea61673294ed2a0bede31ef2c85f1ac9536847b3c1da4219b4c1020',
  'acd66bf1ef08c53e9d85e873a77b770400796a478ba3c878bcb598ef054b4e5c',
  'cdb10524fce49103a90e698af06ca6e5fe43113a6e9da09ec6172e968ff00ae0',
  'ad8e346676e04c492b086124f53e2477ca1316df27abd4a552163c33e59b980e',
]);

/** Generic phrases that contain a guarded word and are allowed as-is. */
const ALLOWED_PHRASE_HASHES: ReadonlySet<string> = new Set([
  '3e776fdee327ee7ecc77e412bfde5678f50206db7e99b98850346738c2302fe1',
]);

const MAX_WORDS = 4;

/** A pt-BR number: thousands dots with an optional comma, or a comma decimal. */
const FORMATTED_NUMBER =
  /(?<![\d.,])\d{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?(?![\d.,])|(?<![\d.,])\d+(?:,[0-9]+)+(?![\d.,])/g;

/** Lowercase, accent-free words separated by one space. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function termHash(term: string): string {
  return createHash('sha256').update(normalizeTerm(term)).digest('hex');
}

/**
 * A guarded number can be written as `1234.56`, `1.234,56` or `7.654,5`, so
 * every spelling of the same value is tried against the hashes.
 */
function formattedNumberCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (const cluster of text.match(FORMATTED_NUMBER) ?? []) {
    const groups = cluster.split(/[.,]/);
    const head = groups.slice(0, -1).join('');
    const cents = groups[groups.length - 1]!;
    candidates.push(groups.join(''), head, `${head} ${cents}`);
    const trimmed = cents.replace(/0+$/, '');
    if (trimmed) candidates.push(`${head} ${trimmed}`);
  }
  return candidates;
}

/** Hashes of the guarded terms found in `text`, up to four words each. */
export function findPrivateTerms(
  text: string,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES
): string[] {
  const hits = new Set<string>();
  for (const candidate of formattedNumberCandidates(text)) {
    const hash = termHash(candidate);
    if (terms.has(hash) && !allowed.has(hash)) hits.add(hash);
  }
  const tokens = normalizeTerm(text).split(' ').filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const max = Math.min(MAX_WORDS, tokens.length - i);
    let allowedHere = false;
    for (let n = 1; n <= max; n++) {
      if (allowed.has(termHash(tokens.slice(i, i + n).join(' ')))) {
        allowedHere = true;
        break;
      }
    }
    if (allowedHere) continue;
    for (let n = 1; n <= max; n++) {
      const hash = termHash(tokens.slice(i, i + n).join(' '));
      if (terms.has(hash)) hits.add(hash);
    }
  }
  return [...hits];
}

/**
 * Lines of `text` that contain a guarded term. A bitmask table row is skipped
 * because its binary column can match a short numeric id by coincidence.
 */
export function scanText(
  text: string,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES
): number[] {
  const lines: number[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (/^\|\s*\d+\s*\|\s*[01]{4}\s*\|/.test(line)) continue;
    if (findPrivateTerms(line, terms, allowed).length > 0) lines.push(index + 1);
  }
  return lines;
}

export interface PrivateTermHit {
  file: string;
  line: number;
}

/** Versioned files, from `git ls-files`, that currently carry a guarded term. */
export function scanTrackedFiles(
  root: string = join(import.meta.dirname, '..'),
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES
): PrivateTermHit[] {
  const listed = Bun.spawnSync(['git', 'ls-files', '-z'], { cwd: root });
  if (listed.exitCode !== 0) throw new Error(`git ls-files failed in ${root}`);
  const files = listed.stdout.toString().split('\0').filter(Boolean);
  const hits: PrivateTermHit[] = [];
  for (const file of files) {
    const path = join(root, file);
    if (statSync(path).size > 1_000_000) continue;
    const text = readFileSync(path, 'utf8');
    if (text.includes('\u0000')) continue;
    for (const line of scanText(text, terms, allowed)) hits.push({ file, line });
  }
  return hits;
}
