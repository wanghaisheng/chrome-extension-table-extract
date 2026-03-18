import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CODEX_DIR = path.join(ROOT, '.codex');
const REPORT_DIR = path.join(ROOT, 'reports', 'docs');
const REPORT_PATH = path.join(REPORT_DIR, 'docs-check.json');

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

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return { strict: flags.has('--strict') };
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

async function readPackageScripts() {
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function extractNpmRuns(text) {
  const out = [];
  const re = /npm run ([a-zA-Z0-9:_-]+)/g;
  let m;
  while ((m = re.exec(text)) != null) out.push(m[1]);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = mkResult();

  if (!(await fileExists(CODEX_DIR))) {
    addCheck(result, { id: 'codex.present', ok: true, details: 'no .codex/ directory; skipping.' });
    return result;
  }

  const scripts = await readPackageScripts();
  const mdFiles = (await walk(CODEX_DIR)).filter((p) => p.endsWith('.md'));

  const missing = [];
  for (const f of mdFiles) {
    const rel = path.relative(ROOT, f).replaceAll('\\', '/');
    const txt = await fs.readFile(f, 'utf8');
    const runs = extractNpmRuns(txt);
    for (const s of runs) {
      if (!scripts.has(s)) missing.push({ script: s, file: rel });
    }
  }

  if (missing.length > 0) {
    const message = `found npm scripts referenced in .codex docs that are missing from package.json (${missing.length}).`;
    if (args.strict) err(result, { id: 'docs.npm_scripts_exist', message, missing });
    else warn(result, { id: 'docs.npm_scripts_exist', message, missing });
  } else {
    addCheck(result, { id: 'docs.npm_scripts_exist', ok: true, details: 'all npm run references in .codex exist in package.json.' });
  }

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log(`docs:check ok; report written to ${path.relative(ROOT, REPORT_PATH)}`);
  }

  return result;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});

