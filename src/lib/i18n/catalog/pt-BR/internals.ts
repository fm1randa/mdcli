/** API and auth internals, in Brazilian Portuguese. */

export const ptBRInternals = {
  // --- API and auth internals ----------------------------------------------------
  errorReauth: () =>
    'A API rejeitou as credenciais salvas (401). Execute "mdcli auth login" para autenticar de novo.',
  refreshingCredentials: () => '🔄 Credenciais rejeitadas, renovando com o último método de login...',
  credentialsRefreshed: () => '✓ Credenciais renovadas',
  errorApiRequestFailed: (context: string, status: number, statusText: string, body: string) =>
    `A requisição à API falhou (${context}): ${status} ${statusText} - ${body}`,
  errorApiInvalidJson: (context: string, reason: string) =>
    `A API retornou um JSON inválido (${context}): ${reason}`,
  errorFirstInvoiceNoDueDate: (cardId: number) =>
    `A API não informou o vencimento da primeira fatura do cartão ${cardId} (primeiraFatura sem vencimento).`,
  errorNotAuthenticated: () => 'Não autenticado. Execute "mdcli auth login" primeiro.',
  contextAfterRefresh: (context: string) => `${context}, após renovar as credenciais`,
  captchaNoApiKey: () => '⚠ reCAPTCHA detectado, mas nenhuma chave de API do 2captcha está configurada.',
  captchaConfigureHint: () =>
    '  Execute: mdcli auth login --captcha-key <sua-chave-de-api-do-2captcha>',
  captchaSitekeyMissing: () => '⚠ Não foi possível extrair o sitekey do reCAPTCHA da página',
  captchaSolving: () => '🔐 Resolvendo o desafio do reCAPTCHA...',
  captchaSolved: () => '✓ reCAPTCHA resolvido',
  captchaSolveFailed: (message: string) => `⚠ Falha ao resolver o reCAPTCHA: ${message}`,
  authHeadersCaptured: () => '✓ Headers de autenticação capturados com sucesso.',
  authBrowserOpened: () =>
    '\n📱 Navegador aberto. Faça login no Meu Dinheiro.\n' +
    '   O navegador fecha sozinho depois de capturar todas as credenciais.\n',
  errorBrowserClosedEarly: () =>
    'O navegador foi fechado antes de todas as credenciais serem capturadas.',
  errorAuthIncomplete: (missing: string) => `Autenticação incompleta. Faltando: ${missing}`,
  errorCaptchaNotSolved: () => 'Falha ao resolver o desafio do reCAPTCHA',
  errorOtpMaxRetries: () => 'A validação do OTP falhou após o número máximo de tentativas',
  otpInvalidRetry: (attempt: number, max: number) =>
    `OTP inválido, buscando um código novo (tentativa ${attempt}/${max})...`,
  errorAuthCaptureFailed: () =>
    'Falha ao capturar os headers de autenticação após o login',
  errorUnsupportedPlatform: (platform: string) =>
    `Plataforma não suportada: ${platform}. Só macOS, Windows e Linux são suportados.`,
  errorBrowserProfileNotFound: (label: string, path: string) =>
    `${label} não encontrado. Perfil esperado em: ${path}\nTente: mdcli auth login --session firefox ou --browser`,
  warningTempProfileRemoveFailed: (path: string) =>
    `⚠ Não foi possível remover a cópia temporária do perfil em ${path}. Você pode apagá-la manualmente.`,
  errorNotLoggedIn: () =>
    'O usuário não está logado no MeuDinheiro. Tente: mdcli auth login --browser',
  errorUserIdUnknown: () =>
    'Não foi possível determinar o ID do usuário. Tente: mdcli auth login --browser',
  errorFirefoxNotFound: (path: string) =>
    `Firefox não encontrado. Esperado em: ${path}\nTente: mdcli auth login --session chrome ou --browser`,
  errorFirefoxProfilesIniNotFound: (path: string) =>
    `profiles.ini do Firefox não encontrado em: ${path}\nTente: mdcli auth login --session chrome ou --browser`,
  errorNoFirefoxProfiles: (path: string) =>
    `Nenhum perfil do Firefox encontrado em: ${path}\nTente: mdcli auth login --session chrome ou --browser`,
  errorFirefoxProfileNotFound: (path: string) =>
    `Perfil do Firefox não encontrado em: ${path}\nTente: mdcli auth login --session chrome ou --browser`,
  errorMissingOnePasswordCredentials: (missing: string) =>
    `Credenciais faltando no 1Password: ${missing}`,
  errorInvalidInvoiceMonth: (value: string) =>
    `Mês de fatura inválido "${value}". Use AAAA-MM com um mês de 01 a 12 (ex.: 2026-10)`,
  updateInstalled: (from: string, to: string) => `mdcli atualizado de ${from} para ${to}`,
  updateNotGlobal: () =>
    '✗ mdcli não está instalado globalmente (bun install -g github:fm1randa/mdcli); num checkout, use git pull.',
  updateCheckFailed: () => '✗ Não foi possível consultar a última release no GitHub.',
  updateAlreadyLatest: (version: string) => `mdcli já está na versão mais recente (${version}).`,
  updateUpdating: (from: string, to: string) => `Atualizando mdcli de ${from} para ${to}...`,
  updateInstallFailed: (tag: string, code: number, installed: string) =>
    `✗ Falha ao instalar ${tag} (bun saiu com código ${code}). A versão ${installed} continua instalada; rode \`mdcli update\` de novo para tentar outra vez.`,
  errorMacOsProfileBlocked: (profile: 'browser' | 'firefox', path: string, alternatives: string[]) =>
    `O macOS bloqueou o acesso ao ${profile === 'firefox' ? 'perfil do Firefox' : 'perfil do navegador'} em: ${path}\n` +
    'Isso vem da proteção de privacidade do macOS (TCC), não de um bug do mdcli. Para corrigir:\n' +
    '  1. Abra Ajustes do Sistema -> Privacidade e Segurança -> Acesso Total ao Disco\n' +
    '  2. Ative para o app de terminal em que você roda o mdcli (Terminal, iTerm, VS Code etc.)\n' +
    '  3. Reinicie o terminal e tente de novo\n' +
    `Ou tente: mdcli auth login ${alternatives.join(' ou ')}`,
  errorBrowserLaunchTimeout: () =>
    'O navegador demorou demais para abrir com o perfil copiado (isso acontece em máquinas gerenciadas/corporativas, ' +
    'onde o navegador tenta acessar serviços de rede bloqueados ao abrir).\nTente: mdcli auth login --browser ou --item',
  errorAuthConfigNotFound: () =>
    'Não foi possível extrair a configuração de autenticação da página. A estrutura do site pode ter mudado.\nTente: mdcli auth login --browser',
  errorTooManyEntries: (limit: number) =>
    `Mais de ${limit} lançamentos atendem a estes filtros. Restrinja o período ou os filtros.`,
  errorInvalidTodayOverride: (value: string) =>
    `MDCLI_TODAY precisa ser um dia do calendário em AAAA-MM-DD; recebido "${value}"`,
};
