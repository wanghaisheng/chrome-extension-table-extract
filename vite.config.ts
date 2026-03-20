import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { crx } from '@crxjs/vite-plugin';
import { load as loadYaml } from 'js-yaml';
import { readFile } from 'node:fs/promises';
import manifest from './manifest';
import npmPackage from './package';

function yamlLoader() {
  return {
    name: 'yaml-loader',
    enforce: 'pre',
    async load(id: string) {
      const [filepath, query] = id.split('?', 2);
      if (query === 'url' || query === 'raw') return;
      if (!filepath.endsWith('.yml') && !filepath.endsWith('.yaml')) return;

      const raw = await readFile(filepath, 'utf8');
      const parsed = loadYaml(raw) ?? null;
      return `export default ${JSON.stringify(parsed)};`;
    },
  };
}

const extensionManifest = {
  version: npmPackage.version,
  ...manifest,
};

const e2eTestManifest = {
  ...extensionManifest,
  host_permissions: ['<all_urls>'],
};

export default defineConfig(({ mode }) => ({
  plugins: [
    preact(),
    yamlLoader(),
    crx({
      manifest: mode === 'e2e' ? e2eTestManifest : extensionManifest,
    }),
  ],
}));
