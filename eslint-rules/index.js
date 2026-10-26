// Local ESLint plugin: one named rule per ban, so each keeps its own
// files/ignores (no-restricted-syntax blocks replaced each other's options).
import noDoubleCast from "./no-double-cast.js";
import noDueAnchorFallback from "./no-due-anchor-fallback.js";
import noNumberCall from "./no-number-call.js";
import noRawDash from "./no-raw-dash.js";
import noRawCents from "./no-raw-cents.js";
import noRawCurrency from "./no-raw-currency.js";

export default {
  meta: { name: "local" },
  rules: {
    "no-double-cast": noDoubleCast,
    "no-due-anchor-fallback": noDueAnchorFallback,
    "no-number-call": noNumberCall,
    "no-raw-cents": noRawCents,
    "no-raw-currency": noRawCurrency,
    "no-raw-dash": noRawDash,
  },
};
