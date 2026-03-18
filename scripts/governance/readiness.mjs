import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const REPORT_DIR = path.join(ROOT, 'reports', 'governance');
const REPORT_PATH = path.join(REPORT_DIR, 'readiness.json');

function hasNeedle(haystack, needle) {
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

async function readUtf8(p) {
  return await fs.readFile(p, 'utf8');
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(p) {
  if (!(await fileExists(p))) return [];
  const ents = await fs.readdir(p, { withFileTypes: true });
  return ents.filter((e) => e.isDirectory()).map((e) => path.join(p, e.name));
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    strict: flags.has('--strict'),
  };
}

function mkResult() {
  return {
    ok: true,
    checked_at: new Date().toISOString(),
    checks: [],
    warnings: [],
    errors: [],
  };
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

async function checkTemplateContracts(result) {
  const designTemplate = path.join(ROOT, '.codex', 'templates', 'change-record', 'design.md');
  const tasksTemplate = path.join(ROOT, '.codex', 'templates', 'change-record', 'tasks.md');

  const design = await readUtf8(designTemplate);
  const tasks = await readUtf8(tasksTemplate);

  const designOk =
    hasNeedle(design, 'Stage Gate 1 seed') &&
    hasNeedle(design, 'Trophy candidate') &&
    hasNeedle(design, '2–3 core acceptance criteria seeds');

  addCheck(result, {
    id: 'template.design.gate1_seed',
    ok: designOk,
    details: designOk
      ? 'design template contains Gate1 seed (AC + trophy + fallback).'
      : `missing Gate1 seed fields in ${path.relative(ROOT, designTemplate)}`,
  });

  const tasksOk =
    hasNeedle(tasks, 'trophy evidence') &&
    hasNeedle(tasks, 'acceptance criteria mapping') &&
    hasNeedle(tasks, 'Pilot Gate D (WAL updated)');

  addCheck(result, {
    id: 'template.tasks.closeout_contract',
    ok: tasksOk,
    details: tasksOk
      ? 'tasks template closeout includes trophy + AC mapping + WAL.'
      : `missing closeout contract fields in ${path.relative(ROOT, tasksTemplate)}`,
  });
}

async function checkArchivedPackets(result, { strict }) {
  const archiveRoot = path.join(ROOT, 'openspec', 'changes', 'archive');
  const archived = await listDirs(archiveRoot);
  if (archived.length === 0) {
    addCheck(result, {
      id: 'archive.present',
      ok: true,
      details: 'no archived change packets found; skipping packet checks.',
    });
    return;
  }

  const missing = [];
  for (const dir of archived) {
    const tasksPath = path.join(dir, 'tasks.md');
    if (!(await fileExists(tasksPath))) continue;
    const txt = await readUtf8(tasksPath);

    const hasCloseout = hasNeedle(txt, '## Closeout Rule');
    const hasCommands = hasNeedle(txt, 'commands that ran');
    const hasPassFail = hasNeedle(txt, 'pass or fail status');

    if (!hasCloseout || !hasCommands || !hasPassFail) {
      missing.push({
        packet: path.relative(ROOT, dir).replaceAll('\\', '/'),
        tasks: path.relative(ROOT, tasksPath).replaceAll('\\', '/'),
        missing: [
          !hasCloseout ? 'Closeout Rule section' : null,
          !hasCommands ? '"commands that ran"' : null,
          !hasPassFail ? '"pass or fail status"' : null,
        ].filter(Boolean),
      });
    }
  }

  if (missing.length === 0) {
    addCheck(result, {
      id: 'archive.closeout_minimum',
      ok: true,
      details: 'all archived packets contain minimum closeout fields.',
    });
    return;
  }

  const msg = `some archived packets are missing minimum closeout fields (${missing.length}).`;
  if (strict) {
    err(result, { id: 'archive.closeout_minimum', message: msg, missing });
  } else {
    warn(result, { id: 'archive.closeout_minimum', message: msg, missing });
    addCheck(result, { id: 'archive.closeout_minimum', ok: true, details: 'reported as warning (non-strict).' });
  }
}

async function checkActivePackets(result, { strict }) {
  const activeRoot = path.join(ROOT, 'openspec', 'changes');
  const active = (await listDirs(activeRoot)).filter((d) => path.basename(d) !== 'archive');
  if (active.length === 0) {
    addCheck(result, {
      id: 'active.present',
      ok: true,
      details: 'no active change packets found; skipping active packet checks.',
    });
    return;
  }

  const missingSpecs = [];
  const unlinkedSpecs = [];

  for (const dir of active) {
    const readmePath = path.join(dir, 'README.md');
    const readme = (await fileExists(readmePath)) ? await readUtf8(readmePath) : '';

    const specsRoot = path.join(dir, 'specs');
    const areas = await listDirs(specsRoot);
    const specFiles = [];
    for (const a of areas) {
      const p = path.join(a, 'spec.md');
      if (await fileExists(p)) specFiles.push(p);
    }

    if (specFiles.length === 0) {
      missingSpecs.push(path.relative(ROOT, dir).replaceAll('\\', '/'));
      continue;
    }

    // Minimal link check: README should reference at least one specs/<area>/spec.md path.
    const anyLinked = specFiles.some((p) => hasNeedle(readme, path.relative(ROOT, p).replaceAll('\\', '/')));
    if (!anyLinked) {
      unlinkedSpecs.push({
        packet: path.relative(ROOT, dir).replaceAll('\\', '/'),
        expected_one_of: specFiles.map((p) => path.relative(ROOT, p).replaceAll('\\', '/')),
      });
    }
  }

  if (missingSpecs.length === 0) {
    addCheck(result, {
      id: 'active.specs_present',
      ok: true,
      details: 'all active packets contain specs/<area>/spec.md.',
    });
  } else {
    const msg = `some active packets are missing specs/<area>/spec.md (${missingSpecs.length}).`;
    if (strict) err(result, { id: 'active.specs_present', message: msg, missing: missingSpecs });
    else warn(result, { id: 'active.specs_present', message: msg, missing: missingSpecs });
  }

  if (unlinkedSpecs.length === 0) {
    addCheck(result, {
      id: 'active.specs_linked',
      ok: true,
      details: 'all active packets link at least one spec in README.',
    });
  } else {
    const msg = `some active packets contain specs but do not link them from README (${unlinkedSpecs.length}).`;
    if (strict) err(result, { id: 'active.specs_linked', message: msg, missing: unlinkedSpecs });
    else warn(result, { id: 'active.specs_linked', message: msg, missing: unlinkedSpecs });
  }
}

async function writeReport(result) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');
}

async function main() {
  const args = parseArgs(process.argv);
  const result = mkResult();

  await checkTemplateContracts(result);
  await checkActivePackets(result, args);
  await checkArchivedPackets(result, args);
  await writeReport(result);

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    // eslint-disable-next-line no-console
    console.log(`governance:readiness ok; report written to ${path.relative(ROOT, REPORT_PATH)}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});

