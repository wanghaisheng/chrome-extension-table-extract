import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import archiver from 'archiver';

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--(?<k>[^=]+)=(?<v>.*)$/.exec(arg);
    if (m?.groups) out[m.groups.k] = m.groups.v;
  }
  return out;
}

function assertExists(p, label) {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} not found: ${p}`);
  }
}

function zipDirectoryContents({ inputDir, outputZipPath }) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outputZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    out.on('close', () => resolve({ bytes: archive.pointer() }));
    out.on('error', reject);
    archive.on('warning', (err) => {
      // Non-fatal warnings still fail the build for reproducibility.
      reject(err);
    });
    archive.on('error', reject);

    archive.pipe(out);
    archive.glob('**/*', {
      cwd: inputDir,
      dot: true,
      ignore: ['**/.DS_Store'],
    });
    archive.finalize();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browsers = (args.browsers ?? 'chrome')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const supported = new Set(['chrome', 'edge']);
  const unsupported = browsers.filter((b) => !supported.has(b));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported browser(s): ${unsupported.join(', ')}. Supported: chrome, edge.`);
  }

  const root = process.cwd();
  const distDir = path.join(root, 'dist');
  assertExists(distDir, 'dist directory');
  assertExists(path.join(distDir, 'manifest.json'), 'dist manifest.json');

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const name = String(pkg.name ?? 'extension');
  const version = String(pkg.version ?? '0.0.0');

  const artifactsDir = path.join(root, 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });

  const outputs = [];
  for (const browser of browsers) {
    const fileName = `${name}-${browser}-v${version}.zip`;
    const outputZipPath = path.join(artifactsDir, fileName);

    const { bytes } = await zipDirectoryContents({ inputDir: distDir, outputZipPath });
    outputs.push({ browser, outputZipPath, bytes });
  }

  for (const o of outputs) {
    // eslint-disable-next-line no-console
    console.log(`packed ${o.browser}: ${o.outputZipPath} (${o.bytes} bytes)`);
  }
}

await main();

