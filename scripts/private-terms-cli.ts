import { repoRoot } from './git.js';
import { KEYED_TERM_HASHES, requirePrivateTermsKey, scanTrackedFiles } from './private-terms.js';

async function main(): Promise<void> {
  try {
    const key = requirePrivateTermsKey();
    if (key === undefined && KEYED_TERM_HASHES.size > 0) {
      console.error(
        'guarda de dados privados: aviso: MDCLI_PRIVATE_TERMS_KEY ausente; termos numéricos de baixa entropia não foram verificados'
      );
    }
    const hits = await scanTrackedFiles(await repoRoot());
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

if (import.meta.main) await main();
