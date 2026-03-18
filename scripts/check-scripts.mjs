import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const REPORT_DIR = path.join(ROOT, 'reports', 'scripts');
const REPORT_PATH = path.join(REPORT_DIR, 'check-scripts.json');

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  const ents = await fs.readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

function hasNeedle(haystack, needle) {
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

function mkResult() {
  return { ok: true, checked_at: new Date().toISOString(), checks: [], warnings: [], errors: [] };
}

function addCheck(result, check) {
  result.checks.push(check);
  if (!check.ok) result.ok = false;
}

function warn(result, warning) {
  result.warnings.push(warning);
}

function err(result, error) {
  result.errors.push(error);
  result.ok = false;
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return { strict: flags.has('--strict') };
}

async function main() {
  const args = parseArgs(process.argv);
  const result = mkResult();

  if (!(await fileExists(SCRIPTS_DIR))) {
    addCheck(result, { id: 'scripts.present', ok: true, details: 'no scripts/ directory; skipping.' });
    return result;
  }

  const files = (await walk(SCRIPTS_DIR)).filter((p) => p.endsWith('.mjs'));
  addCheck(result, { id: 'scripts.mjs_found', ok: true, details: `found ${files.length} .mjs files.` });

  const interactiveHits = [];
  const outputDirHits = [];

  for (const f of files) {
    const rel = path.relative(ROOT, f).replaceAll('\\', '/');
    const txt = await fs.readFile(f, 'utf8');

    // Heuristics: disallow common interactive stdin prompting patterns.
    const interactive =
      hasNeedle(txt, 'readline') ||
      hasNeedle(txt, 'process.stdin') ||
      hasNeedle(txt, 'inquirer') ||
      hasNeedle(txt, 'prompt(');
    if (interactive) interactiveHits.push(rel);

    // Encourage deterministic report output under reports/.
    const writesFile = hasNeedle(txt, 'writeFile(') || hasNeedle(txt, 'writeFileSync(');
    const mentionsReports = hasNeedle(txt, 'reports') || hasNeedle(txt, 'reports/');
    if (writesFile && !mentionsReports) outputDirHits.push(rel);
  }

  if (interactiveHits.length > 0) {
    const message = `interactive patterns detected in ${interactiveHits.length} script(s). Scripts should be non-interactive.`;
    if (args.strict) err(result, { id: 'scripts.non_interactive', message, files: interactiveHits });
    else warn(result, { id: 'scripts.non_interactive', message, files: interactiveHits });
  } else {
    addCheck(result, { id: 'scripts.non_interactive', ok: true, details: 'no interactive prompt patterns detected.' });
  }

  if (outputDirHits.length > 0) {
    const message = `some scripts write files but do not appear to use reports/ for outputs (${outputDirHits.length}). Prefer reports/<area>/... for deterministic artifacts.`;
    if (args.strict) err(result, { id: 'scripts.output_dir', message, files: outputDirHits });
    else warn(result, { id: 'scripts.output_dir', message, files: outputDirHits });
  } else {
    addCheck(result, { id: 'scripts.output_dir', ok: true, details: 'scripts writing files appear to use reports/.' });
  }

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log(`check:scripts ok; report written to ${path.relative(ROOT, REPORT_PATH)}`);
  }

  return result;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});

