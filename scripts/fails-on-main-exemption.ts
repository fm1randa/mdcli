// Issue #237: the gate punishes a test that does not prove a fix (#186), not a
// refactor whose good test passes on both trees. The PR title and a reason
// declared in the body are the two visible ways to claim the exemption.

const EXEMPT_TITLE = /^(refactor|test|chore)(?:\([^)]*\))?!?\s*:/i;
const BODY_MARKER = /^fails-on-main:\s*isento\b(.*)$/i;
const BODY_REASON = /^\s*(?:[—–-]|:)\s*(\S.*?)\s*$/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

export type BodyExemption =
  | { kind: 'none' }
  | { kind: 'valid'; reason: string }
  | { kind: 'missing-reason' };

export type GateDecision =
  | { kind: 'not-required' }
  | { kind: 'exempt'; source: 'title' | 'body'; reason: string }
  | { kind: 'invalid-exemption'; reason: string }
  | { kind: 'required' };

/** The exempt conventional-commit type in a PR title, if any. */
export function exemptTitle(title: string): string | undefined {
  return EXEMPT_TITLE.exec(title.trim())?.[1].toLowerCase();
}

/**
 * A line `Fails-on-main: isento — <reason>` exempts the gate. An HTML comment
 * does not count: the reason must be visible in the rendered PR body.
 */
export function parseBodyExemption(body: string): BodyExemption {
  let declared = false;
  for (const line of body.replace(HTML_COMMENT, '').split('\n')) {
    const marker = BODY_MARKER.exec(line.trim());
    if (!marker) continue;
    declared = true;
    const reason = BODY_REASON.exec(marker[1]);
    if (reason) return { kind: 'valid', reason: reason[1] };
  }
  return declared ? { kind: 'missing-reason' } : { kind: 'none' };
}

/** Decides whether the gate runs, and why it does not. */
export function decideGate(productChanged: boolean, title: string, body: string): GateDecision {
  if (!productChanged) return { kind: 'not-required' };

  const titleType = exemptTitle(title);
  if (titleType) {
    return {
      kind: 'exempt',
      source: 'title',
      reason: `the title declares \`${titleType}\`, a behavior-preserving change`,
    };
  }

  const bodyExemption = parseBodyExemption(body);
  if (bodyExemption.kind === 'valid') {
    return { kind: 'exempt', source: 'body', reason: bodyExemption.reason };
  }
  if (bodyExemption.kind === 'missing-reason') {
    return {
      kind: 'invalid-exemption',
      reason: 'the body declares `Fails-on-main: isento` without a reason; add one after `—` or `:`',
    };
  }
  return { kind: 'required' };
}

export function exemptionSummary(source: 'title' | 'body', reason: string): string {
  const skipped =
    source === 'title'
      ? `Skipped: ${reason}.`
      : `Skipped by the exemption declared in the PR body: ${reason}.`;
  return [
    '## fails-on-main: exempt',
    '',
    skipped,
    '',
    '`fix` and `feat` PRs that change behavior still need a test that fails on `main`.',
  ].join('\n');
}

export function invalidExemptionSummary(reason: string): string {
  return [
    '## fails-on-main: invalid exemption',
    '',
    `${reason}. The gate stays required until the body is fixed.`,
  ].join('\n');
}
