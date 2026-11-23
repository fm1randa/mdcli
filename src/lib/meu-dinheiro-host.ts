// The single owner of the Meu Dinheiro host (#279): every URL, header and
// cookie domain the CLI sends credentials to derives from SITE_DOMAIN.
const SITE_DOMAIN = 'meudinheiroweb.com.br';
const APP_HOST = `app.${SITE_DOMAIN}`;

export const WEB_ORIGIN = `https://${APP_HOST}`;
export const WEB_URL = `${WEB_ORIGIN}/`;
export const DEFAULT_API_URL = `${WEB_ORIGIN}/api`;
export const API_URL_PATTERN = `${APP_HOST}/api/`;
export const COOKIE_DOMAIN = `.${SITE_DOMAIN}`;
