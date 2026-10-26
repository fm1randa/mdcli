// Local ESLint plugin: one named rule per ban, so each keeps its own
// files/ignores (no-restricted-syntax blocks replaced each other's options).
import noAmbientClock from "./no-ambient-clock.js";
import noDoubleCast from "./no-double-cast.js";
import noDueAnchorFallback from "./no-due-anchor-fallback.js";
import noLiteralSince from "./no-literal-since.js";
import noNumberCall from "./no-number-call.js";
import noRawCurrency from "./no-raw-currency.js";

export default {
  meta: { name: "local" },
  rules: {
    "no-ambient-clock": noAmbientClock,
    "no-double-cast": noDoubleCast,
    "no-due-anchor-fallback": noDueAnchorFallback,
    "no-literal-since": noLiteralSince,
    "no-number-call": noNumberCall,
    "no-raw-currency": noRawCurrency,
  },
};
