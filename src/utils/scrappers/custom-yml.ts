import yaml from 'js-yaml';
import { ScrapperOptions } from '../chrome';

const CUSTOM_SCRAPERS_KEY = 'table_extract_custom_scrapers_v1';
const MAX_CUSTOM_SCRAPERS = 50;

export type CustomScraperRecord = {
  id: string;
  name: string;
  addedAt: number;
  yamlText: string;
  options: ScrapperOptions;
};

export type CustomScraperSummary = Pick<CustomScraperRecord, 'id' | 'name' | 'addedAt'> & {
  header?: string;
  url: string | string[];
};

function safeFileBaseName(name: string): string {
  const trimmed = String(name || '').trim();
  const base = trimmed.split(/[\\/]/g).pop() || trimmed;
  return base.replace(/\.(ya?ml)$/i, '') || 'custom-scraper';
}

function randomId(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

type ElementParserType = NonNullable<ScrapperOptions['elementParser']>[number]['type'];

function normalizeElementParserType(type: unknown): ElementParserType | null {
  if (!isNonEmptyString(type)) return null;
  const t = type.trim();
  const allowed = new Set([
    'text',
    'image',
    'clean-url',
    'link',
    'get-attribute',
    'float',
    'self-link',
  ]);
  return allowed.has(t) ? (t as ElementParserType) : null;
}

function validateScrapperOptions(raw: any, nameForHeader: string): ScrapperOptions {
  if (!raw || typeof raw !== 'object') throw new Error('YAML must define an object at the top level.');

  const url = raw.url;
  if (!(isNonEmptyString(url) || (Array.isArray(url) && url.every(isNonEmptyString)))) {
    throw new Error('Invalid `url`: must be a string or a string array.');
  }

  const listElementsQuery = raw.listElementsQuery;
  if (!isNonEmptyString(listElementsQuery)) {
    throw new Error('Invalid `listElementsQuery`: must be a non-empty string.');
  }

  const elementParser = raw.elementParser;
  if (!Array.isArray(elementParser) || elementParser.length === 0) {
    throw new Error('Invalid `elementParser`: must be a non-empty array.');
  }

  const parsed = elementParser.map((p: any, idx: number) => {
    const title = p?.title;
    if (!isNonEmptyString(title)) throw new Error(`Invalid elementParser[${idx}].title: must be a non-empty string.`);

    const type = normalizeElementParserType(p?.type);
    if (!type) {
      throw new Error(
        `Invalid elementParser[${idx}].type: must be one of text|image|clean-url|link|get-attribute|float|self-link.`,
      );
    }

    const query = isNonEmptyString(p?.query) ? String(p.query) : undefined;
    const attribute = isNonEmptyString(p?.attribute) ? String(p.attribute) : undefined;
    if (type === 'get-attribute' && !attribute) {
      throw new Error(`Invalid elementParser[${idx}]: type=get-attribute requires \`attribute\`.`);
    }

    return { title: String(title), query, type, attribute };
  });

  const header = isNonEmptyString(raw.header) ? String(raw.header) : nameForHeader;
  const includeHeader = raw.includeHeader == null ? undefined : Boolean(raw.includeHeader);

  return {
    url,
    header,
    includeHeader,
    listElementsQuery,
    elementParser: parsed,
  };
}

async function loadAll(): Promise<CustomScraperRecord[]> {
  const res = await chrome.storage.local.get(CUSTOM_SCRAPERS_KEY);
  const raw = res?.[CUSTOM_SCRAPERS_KEY] as CustomScraperRecord[] | undefined;
  return Array.isArray(raw) ? raw : [];
}

async function saveAll(records: CustomScraperRecord[]): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_SCRAPERS_KEY]: records });
}

export async function importCustomScraperYaml(input: { name: string; yamlText: string }): Promise<CustomScraperRecord> {
  const nameBase = safeFileBaseName(input.name);
  const yamlText = String(input.yamlText ?? '').trim();
  if (!yamlText) throw new Error('Empty YAML file.');

  let parsed: any;
  try {
    parsed = yaml.load(yamlText);
  } catch (e: any) {
    throw new Error(`YAML parse error: ${String(e?.message ?? e)}`);
  }

  const options = validateScrapperOptions(parsed, nameBase);
  const rec: CustomScraperRecord = {
    id: randomId(),
    name: nameBase,
    addedAt: Date.now(),
    yamlText,
    options,
  };

  const all = await loadAll();
  if (all.length >= MAX_CUSTOM_SCRAPERS) {
    throw new Error(`Too many custom scrapers (${all.length}). Please delete some before importing more.`);
  }

  await saveAll([rec, ...all]);
  return rec;
}

export async function listCustomScrapers(): Promise<CustomScraperSummary[]> {
  const all = await loadAll();
  return all
    .slice()
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    .map((r) => ({ id: r.id, name: r.name, addedAt: r.addedAt, header: r.options.header, url: r.options.url }));
}

export async function getCustomScraperOptions(): Promise<CustomScraperRecord[]> {
  const all = await loadAll();
  return all.slice().sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
}

export async function deleteCustomScraper(id: string): Promise<void> {
  const all = await loadAll();
  const next = all.filter((r) => r.id !== id);
  await saveAll(next);
}
