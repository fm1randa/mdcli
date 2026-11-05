import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A synthetic term the positive-control test writes into a temporary
 * repository. Its hash lives in `PRIVATE_TERM_HASHES` so that emptying the set
 * or breaking `normalizeTerm` fails that test instead of leaving it green. The
 * term is synthetic and therefore safe to detect.
 */
const CANARY_TERM_HASH = '536349c587b9af2ee5fd4f562d394a36d76b6f76cb237986b556afbb8dc82dfc';

/**
 * SHA-256 of the normalized real-account terms this repository must never
 * carry again: account, card and entry names, their aliases and API ids, and
 * the agent that used the real account. The terms themselves are deliberately absent;
 * regenerate a hash from the lowercase, accent-free term with `termHash`. The
 * canary hash is the one term whose plaintext the test may rebuild.
 */
export const PRIVATE_TERM_HASHES: ReadonlySet<string> = new Set([
  CANARY_TERM_HASH,
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
  '5b8d02cd2724877f7b88e1ca0839e7a27be26f8e60c8bc011b16c95f79e7a8f8',
  'cc67ca91b3c5b6cfbff737bd1e222ef3a46ba65982343d1ab161a257aff912a0',
  'e674f78d2bf55fd93c878f7fe14448abe677e7c3160f820ac6a012e457520b81',
  '236a16081d8103d47fcc7a2ed3f12b2929d522069d3b55fdef0fe9b9a72e4ab9',
  '24d4b96f58da6d4a8512313bbd02a28ebf0ca95dec6e4c86ef78ce7f01e788ac',
  'e18431606a21fa92d44f11e8a4fa870426d8c9f07803ec17526989ad95720435',
  '8813d406421e0063ef8ec81fc45170338b4cfd9547ee1ab157b90b46bcb6e2a7',
  '33129567e0bd787efb15a26307e5311e06ba66e3b8dbc2206ad59f99780a4d78',
  '23b11a7ca9488f4094d29eee7d1c22076448630a816724e5b7d84aa55b605600',
  '68dbf73d03d3a5107edad3b05676eee240e68c280296e52b6986873c54cef3cb',
  '3086cf468ccca87cc7840e0755947526a039eea35f486002d7f1c53d7c58686a',
  'a4bd1d3a69aa0ea6ffb1298c8c26be4b333526cae7d27f2362f89857157701ce',
  'b90f4994c4675589617d546a2364d97a26dd97a57ca5983598b2b68d7899bbcd',
  'e59a9de16c717ce6b094544d33c223f70aef6edede63025cd6c9bb8aefde8f9d',
  '2b78da3dc866654e6ea7cb2f654df44746b6f02876acbb2a05726ab3d915e47e',
  'cfe062be1bbee227d288296c3e8c07367716a6e3da5ffffbcdb9304457e3ef3f',
  '3b3f762f42077d2a473328fc947735ec8ce6ffd4fb228d6777c5913aaf0d62c7',
  'aca42c469a086e8d684a169392b7d5df8ea0e64aa46a4f47bbae621a66c3b3fc',
  '82e3197c39bea742a24413640a556779e9d43f49b72c6bab64f506a073efa07c',
  '67499d52a95ae598e4f7684fe6561055f6a183170765bb83a95f5fa3626f5870',
  '1161fc2745e0658fd6fa9e53a20b94a3e2ca23c2be67d0534db87a3efae7ccca',
  '4644c40588a91db72a1a4b5cf5e8918cd0117d18d4eb0294027360da6ac4580b',
  'c84c8016356014e02b049ff270c079dd03ab5c5d44a120bee60242782b234ddd',
  '33e0562bdbfe8a7e5c3dd201e607ace2bad933cabd2ae5c9141d9fc5a9315374',
  '0a00eca27e9821a22a19aeefad4f7cb6be3d90aa01264e296aeb50daf7e2ef7b',
  '8c9a013ab70c0434313e3e881c310b9ff24aff1075255ceede3f2c239c231623',
  '57e0484d7d2c2f07c6c46ba2331312a3304da89ebfc93174002838b8c54f4342',
  'aa1121a2ce6168ace4384d6a0df15cf096345c4bc43d193a7fa8653e4f686405',
  'f527a4c04b5fd3c056dbbd3d247792098a839731a7897e08b3aeb39352b207cc',
  '3574922c5fec718316711d9bbe50175f0f692a695cc9510f861a4b1ade0400b7',
  '478c4ffb1cbcea37956a748e6c19d8eadd0a47e86f5e308d26cad39453b5d1ab',
  '2c8b871e52d4e5f5db5ff84a82a45327e20df77edef961c4b6fa0e9c3d97ce5b',
  '6ad4a6b1e5ea5569795e516d71909e0ce4809d9dc983d2c219144f684f816e12',
  '171c89627f9fa4caa793ba683061ae3cfbc0aca1ef04b4d2281cfed9946eff21',
  '24d7f03d8dc3c3666969e6fa5bb1fac4736d3f1353c28307ed51b320f9dc42d3',
  'c6f0c3cf2b9f61109a022215d9f9e2e1618c6415bbc99bce799a23e2375cf9b3',
]);

/** Generic phrases that contain a guarded word and are allowed as-is. */
export const ALLOWED_PHRASE_HASHES: ReadonlySet<string> = new Set([
  '3e776fdee327ee7ecc77e412bfde5678f50206db7e99b98850346738c2302fe1',
  '23b2bfa33873d3e65638773f0707a4869662d5276e7619d1b56c3442f91335be',
]);

/**
 * The guard stores a term as the hash of a normalized phrase of at most this
 * many words, and `findPrivateTerms` hashes n-grams up to this bound on every
 * scanned line. A real term longer than this is covered by overlapping
 * sub-phrases whose windows span every word, so each occurrence still matches
 * one of them. Raising the bound multiplies the work each scanned line costs,
 * so it stays at the smallest bound the corpus needs.
 */
export const MAX_WORDS = 4;

/**
 * A pt-BR number: thousands dots with an optional comma, or a comma decimal.
 * The trailing guard rejects a longer number (a digit, or a separator followed
 * by one) but not sentence punctuation, so `R$ 1.234,56.` still matches.
 */
const FORMATTED_NUMBER =
  /(?<![\d.,])\d{1,3}(?:\.[0-9]{3})+(?:,[0-9]{1,2})?(?!\d|[.,]\d)|(?<![\d.,])\d+(?:,\d+)+(?!\d|[.,]\d)/g;

const WHOLE_FORMATTED_NUMBER = new RegExp(`^(?:${FORMATTED_NUMBER.source})$`);

/**
 * True when `text` is exactly one pt-BR number, separators included. The
 * corpus check uses it to cover a value whose tokens the guard stores in
 * another spelling (`1.234,56` is `1234 56` in the hash set).
 */
export function isFormattedNumber(text: string): boolean {
  return WHOLE_FORMATTED_NUMBER.test(text.trim().replace(/\\([.,])/g, '$1'));
}

/** Lowercase, accent-free words separated by one space. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NORMALIZED_HASH_CACHE = new Map<string, string>();

function hashNormalized(normalized: string): string {
  const cached = NORMALIZED_HASH_CACHE.get(normalized);
  if (cached !== undefined) return cached;
  const hash = createHash('sha256').update(normalized).digest('hex');
  NORMALIZED_HASH_CACHE.set(normalized, hash);
  return hash;
}

export function termHash(term: string): string {
  return hashNormalized(normalizeTerm(term));
}

/**
 * A guarded number can be written as `1234.56`, `1.234,56` or `7.654,5`, so
 * every spelling of the same value is tried against the hashes.
 */
function formattedNumberCandidates(text: string): string[] {
  const candidates: string[] = [];
  // Tests assert amounts through regex literals, where the separator is
  // escaped (`1\.234,56`); read the escaped spelling as the same number.
  const unescaped = text.replace(/\\([.,])/g, '$1');
  for (const cluster of unescaped.match(FORMATTED_NUMBER) ?? []) {
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
  // Only a hit needs this check, so the scan does not hash every n-gram twice.
  const insideAllowed = (start: number, end: number): boolean => {
    for (let n = end - start; n <= MAX_WORDS; n++) {
      for (let from = Math.max(0, end - n); from <= start && from + n <= tokens.length; from++) {
        if (allowed.has(hashNormalized(tokens.slice(from, from + n).join(' ')))) return true;
      }
    }
    return false;
  };
  for (let i = 0; i < tokens.length; i++) {
    const max = Math.min(MAX_WORDS, tokens.length - i);
    for (let n = 1; n <= max; n++) {
      const hash = hashNormalized(tokens.slice(i, i + n).join(' '));
      if (terms.has(hash) && !insideAllowed(i, i + n)) hits.add(hash);
    }
  }
  return [...hits];
}

/**
 * Lines of `text` that contain a guarded term. The binary cell of a bitmask
 * table row is blanked before scanning because it can match a short numeric id
 * by coincidence; the rest of the row is still checked.
 */
export function scanText(
  text: string,
  terms: ReadonlySet<string> = PRIVATE_TERM_HASHES,
  allowed: ReadonlySet<string> = ALLOWED_PHRASE_HASHES
): number[] {
  const lines: number[] = [];
  for (const [index, line] of text.split('\n').entries()) {
    const withoutBitmask = line.replace(/^(\|\s*\d+\s*\|\s*)[01]{4}(\s*\|)/, '$1    $2');
    if (findPrivateTerms(withoutBitmask, terms, allowed).length > 0) lines.push(index + 1);
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

/** The repository root of `cwd`, so a subdirectory still scans the whole tree. */
function repoRoot(cwd: string): string {
  const top = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], { cwd });
  if (top.exitCode !== 0) throw new Error(`git rev-parse --show-toplevel failed in ${cwd}`);
  return top.stdout.toString().trim();
}

function main(): void {
  try {
    const hits = scanTrackedFiles(repoRoot(process.cwd()));
    if (hits.length === 0) {
      console.log('✓ guarda de dados privados: nenhum termo privado nos arquivos versionados');
      return;
    }
    console.error(`✗ guarda de dados privados: ${hits.length} ocorrência(s) de termo privado`);
    for (const hit of hits) console.error(`  ${hit.file}:${hit.line}`);
    process.exitCode = 1;
  } catch (error) {
    console.error(`guarda de dados privados: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
