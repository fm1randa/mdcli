// Local ESLint plugin: one named rule per ban, so each keeps its own
// files/ignores (no-restricted-syntax blocks replaced each other's options).
import noAmbientClock from "./no-ambient-clock.js";
import noTypeSignTernary from "./no-type-sign-ternary.js";
import noDoubleCast from "./no-double-cast.js";
import noDueAnchorFallback from "./no-due-anchor-fallback.js";
import noLiteralSince from "./no-literal-since.js";
import noLooseNumber from "./no-loose-number.js";
import noRawDash from "./no-raw-dash.js";
import noRawCents from "./no-raw-cents.js";
import noRawCurrency from "./no-raw-currency.js";
import noShortOptionEquals from "./no-short-option-equals.js";

export default {
  meta: { name: "local" },
  rules: {
    "no-ambient-clock": noAmbientClock,
    "no-type-sign-ternary": noTypeSignTernary,
    "no-double-cast": noDoubleCast,
    "no-due-anchor-fallback": noDueAnchorFallback,
    "no-literal-since": noLiteralSince,
    "no-loose-number": noLooseNumber,
    "no-raw-cents": noRawCents,
    "no-raw-currency": noRawCurrency,
    "no-raw-dash": noRawDash,
    "no-short-option-equals": noShortOptionEquals,
  },
};
