// The Meu Dinheiro host is written in one module: api.ts, browser-auth.ts and
// browser-session/ each carried their own copy of it (#279), so a host change
// in one place left the credentials of another on the old host.
const HOST = /meudinheiroweb\.com\.br/i;

export default {
  meta: {
    type: "problem",
    docs: { description: "Ban the Meu Dinheiro host literal outside src/lib/meu-dinheiro-host.ts" },
    messages: {
      hostLiteral: "Import the host from src/lib/meu-dinheiro-host.ts (WEB_ORIGIN, WEB_URL, DEFAULT_API_URL, API_URL_PATTERN, COOKIE_DOMAIN) instead of writing it.",
    },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      if (typeof text === "string" && HOST.test(text)) context.report({ node, messageId: "hostLiteral" });
    };
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
