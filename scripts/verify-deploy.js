import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPO = 'cbrothers/craig-brothers-website';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 180000;

export function resolveGitAuthToken(env = process.env, execFn = execFileSync) {
  const envToken = env.GITHUB_TOKEN || env.GH_TOKEN || '';
  if (envToken.trim()) {
    return envToken.trim();
  }

  try {
    const credentialInput = 'protocol=https\nhost=github.com\n\n';
    const output = execFn('git', ['credential', 'fill'], {
      cwd: REPO_ROOT,
      input: credentialInput,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const match = output.match(/^password=(.+)$/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

export function resolveTargetRefs(args = [], execFn = execFileSync) {
  const refArgs = args.filter((arg) => !arg.startsWith('--'));
  const targetRefs = refArgs.length > 0 ? refArgs : ['stage', 'main'];

  return targetRefs.map((ref) => {
    const candidates = [`origin/${ref}`, ref];
    let sha = '';
    let resolvedRef = ref;

    for (const candidate of candidates) {
      try {
        sha = execFn('git', ['rev-parse', candidate], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (sha) {
          resolvedRef = candidate;
          break;
        }
      } catch {
        // Try next candidate
      }
    }

    if (!sha) {
      throw new Error(`Unable to resolve git ref "${ref}".`);
    }

    let subject = '';
    let committedAtMs = 0;
    try {
      subject = execFn('git', ['show', '-s', '--format=%s', sha], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const tsSeconds = Number(
        execFn('git', ['show', '-s', '--format=%ct', sha], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
      );
      if (Number.isFinite(tsSeconds) && tsSeconds > 0) {
        committedAtMs = tsSeconds * 1000;
      }
    } catch {
      // Optional commit metadata
    }

    return {
      ref,
      resolvedRef,
      sha,
      shortSha: sha.slice(0, 7),
      subject,
      committedAtMs,
    };
  });
}

export function evaluateBuildChecks(checkRunsPayload = {}, commitStatusPayload = {}) {
  const checkRuns = Array.isArray(checkRunsPayload.check_runs)
    ? checkRunsPayload.check_runs
    : [];
  const statuses = Array.isArray(commitStatusPayload.statuses)
    ? commitStatusPayload.statuses
    : [];

  const normalizedChecks = [];

  for (const run of checkRuns) {
    const status = run.status || 'unknown';
    const conclusion = run.conclusion || null;
    const isCompleted = status === 'completed';
    const isSuccess = isCompleted && (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped');
    const isFailure = isCompleted && !isSuccess;

    let durationSec = null;
    if (run.started_at && run.completed_at) {
      const diffMs = Date.parse(run.completed_at) - Date.parse(run.started_at);
      if (Number.isFinite(diffMs) && diffMs >= 0) {
        durationSec = Math.round(diffMs / 1000);
      }
    }

    normalizedChecks.push({
      name: run.name || 'Check Run',
      status,
      conclusion,
      state: !isCompleted ? 'pending' : isSuccess ? 'success' : 'failure',
      detailsUrl: run.details_url || run.html_url || '',
      title: run.output?.title || '',
      summary: (run.output?.summary || '').trim(),
      durationSec,
    });
  }

  for (const st of statuses) {
    const rawState = st.state || 'pending';
    const state =
      rawState === 'success'
        ? 'success'
        : rawState === 'failure' || rawState === 'error'
          ? 'failure'
          : 'pending';

    normalizedChecks.push({
      name: st.context || 'Commit Status',
      status: state === 'pending' ? 'in_progress' : 'completed',
      conclusion: rawState,
      state,
      detailsUrl: st.target_url || '',
      title: st.description || '',
      summary: '',
      durationSec: null,
    });
  }

  if (normalizedChecks.length === 0) {
    return {
      state: 'missing',
      checks: [],
      summary: 'No Cloudflare or GitHub build checks registered for this commit yet.',
    };
  }

  const hasPending = normalizedChecks.some((c) => c.state === 'pending');
  const hasFailure = normalizedChecks.some((c) => c.state === 'failure');

  const overallState = hasPending ? 'pending' : hasFailure ? 'failure' : 'success';
  const summaryLines = normalizedChecks.map((c) => {
    const badge = c.state === 'success' ? 'PASS' : c.state === 'failure' ? 'FAIL' : 'WAIT';
    const timing = c.durationSec !== null ? ` (${c.durationSec}s)` : '';
    const detail = c.title ? ` - ${c.title}` : '';
    const link = c.detailsUrl ? `\n    Log: ${c.detailsUrl}` : '';
    const extra = c.state === 'failure' && c.summary ? `\n    Details: ${c.summary.replace(/\r?\n/g, ' | ')}` : '';
    return `[${badge}] ${c.name}: ${c.conclusion || c.status}${timing}${detail}${link}${extra}`;
  });

  return {
    state: overallState,
    checks: normalizedChecks,
    summary: summaryLines.join('\n'),
  };
}

export async function fetchCommitChecks(sha, { repo = DEFAULT_REPO, token = '', fetchFn = fetch } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'craig-brothers-deploy-verifier',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const [checkRunsRes, statusRes] = await Promise.all([
    fetchFn(`https://api.github.com/repos/${repo}/commits/${sha}/check-runs`, { headers }),
    fetchFn(`https://api.github.com/repos/${repo}/commits/${sha}/status`, { headers }),
  ]);

  if (!checkRunsRes.ok) {
    const errText = await checkRunsRes.text().catch(() => '');
    throw new Error(`GitHub API check-runs HTTP ${checkRunsRes.status}: ${errText}`);
  }

  const checkRunsPayload = await checkRunsRes.json();
  const commitStatusPayload = statusRes.ok ? await statusRes.json() : { statuses: [] };

  return evaluateBuildChecks(checkRunsPayload, commitStatusPayload);
}

export async function verifyRefDeploy(
  target,
  {
    repo = DEFAULT_REPO,
    token = '',
    fetchFn = fetch,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    nowFn = Date.now,
    sleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = console,
  } = {}
) {
  const startMs = nowFn();
  let lastStatusSignature = '';

  logger.log(
    `\nVerifying Cloudflare deploy for ${target.ref} (${target.shortSha})${target.subject ? ` // "${target.subject}"` : ''}...`
  );

  while (true) {
    const evaluation = await fetchCommitChecks(target.sha, { repo, token, fetchFn });
    const signature = JSON.stringify(
      evaluation.checks.map((c) => `${c.name}:${c.status}:${c.conclusion}`)
    );

    if (signature !== lastStatusSignature) {
      logger.log(evaluation.summary);
      lastStatusSignature = signature;
    }

    if (evaluation.state === 'success') {
      return { ok: true, target, evaluation };
    }

    if (evaluation.state === 'failure') {
      return { ok: false, target, evaluation };
    }

    const elapsedMs = nowFn() - startMs;
    const commitAgeMs = target.committedAtMs ? nowFn() - target.committedAtMs : 0;
    if (evaluation.state === 'missing' && commitAgeMs > 120000 && elapsedMs >= 15000) {
      return { ok: false, target, evaluation };
    }

    if (elapsedMs >= timeoutMs) {
      return {
        ok: false,
        target,
        evaluation: {
          ...evaluation,
          summary: `${evaluation.summary}\n[TIMEOUT] Build verification timed out after ${Math.round(timeoutMs / 1000)}s.`,
        },
      };
    }

    await sleepFn(pollIntervalMs);
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const timeoutArg = argv.find((a) => a.startsWith('--timeout='));
  const timeoutMs = timeoutArg ? Number(timeoutArg.split('=')[1]) * 1000 : DEFAULT_TIMEOUT_MS;
  const token = resolveGitAuthToken();
  const targets = resolveTargetRefs(argv);

  let allPassed = true;
  for (const target of targets) {
    const result = await verifyRefDeploy(target, { token, timeoutMs });
    if (!result.ok) {
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\nDEPLOY VERIFICATION FAILED: One or more Cloudflare builds failed or did not complete.');
    process.exitCode = 1;
    return false;
  }

  console.log('\nDEPLOY VERIFICATION PASSED: All Cloudflare builds succeeded.');
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli().catch((err) => {
    console.error(`\nDEPLOY VERIFICATION ERROR: ${err.message}`);
    process.exitCode = 1;
  });
}
