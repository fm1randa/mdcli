// Local ESLint plugin: one named rule per ban, so each keeps its own
// files/ignores (no-restricted-syntax blocks replaced each other's options).
import noAmbientClock from "./no-ambient-clock.js";
import noBareProcessExit from "./no-bare-process-exit.js";
import noBrandCast from "./no-brand-cast.js";
import disableDirectiveDescription from "./disable-directive-description.js";
import noCategoryNameResolution from "./no-category-name-resolution.js";
import noTypeSignTernary from "./no-type-sign-ternary.js";
import noDoubleCast from "./no-double-cast.js";
import noDueAnchorFallback from "./no-due-anchor-fallback.js";
import noGitCopy from "./no-git-copy.js";
import noHostLiteral from "./no-host-literal.js";
import noLiteralSince from "./no-literal-since.js";
import noLooseNumber from "./no-loose-number.js";
import noRawDash from "./no-raw-dash.js";
import noRawSpawn from "./no-raw-spawn.js";
import noRawCents from "./no-raw-cents.js";
import noRawCurrency from "./no-raw-currency.js";
import noShortOptionEquals from "./no-short-option-equals.js";
import noTautologicalExpect from "./no-tautological-expect.js";

export default {
  meta: { name: "local" },
  rules: {
    "no-ambient-clock": noAmbientClock,
    "no-bare-process-exit": noBareProcessExit,
    "no-brand-cast": noBrandCast,
    "disable-directive-description": disableDirectiveDescription,
    "no-category-name-resolution": noCategoryNameResolution,
    "no-type-sign-ternary": noTypeSignTernary,
    "no-double-cast": noDoubleCast,
    "no-due-anchor-fallback": noDueAnchorFallback,
    "no-git-copy": noGitCopy,
    "no-host-literal": noHostLiteral,
    "no-literal-since": noLiteralSince,
    "no-loose-number": noLooseNumber,
    "no-raw-cents": noRawCents,
    "no-raw-currency": noRawCurrency,
    "no-raw-dash": noRawDash,
    "no-raw-spawn": noRawSpawn,
    "no-short-option-equals": noShortOptionEquals,
    "no-tautological-expect": noTautologicalExpect,
  },
};
