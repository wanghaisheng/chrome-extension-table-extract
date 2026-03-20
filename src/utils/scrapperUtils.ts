import { ScrapperOptions, getDomainName } from './chrome';
import { urlMatchesPatternUrl } from './urlUtils';
import scrapperOptions from './../scrappers';
import { getCustomScraperOptions } from './scrappers/custom-yml';

export function getScrapperOptionsByUrl(url: string, title: string): ScrapperOptions | null {
  let options;

  const domain = getDomainName(url);

  if (domain && scrapperOptions.has(domain)) {
    const scrappers = scrapperOptions.get(domain);
    if (!scrappers) return null;

    const scrapper = scrappers.find((scrapper) => {
      if (Array.isArray(scrapper.url)) {
        return scrapper.url.some((scrapperURL: string) => urlMatchesPatternUrl(url, scrapperURL));
      } else {
        return urlMatchesPatternUrl(url, scrapper.url);
      }
    });

    options = scrapper;
  }

  if (options) {
    if (!options.header) {
      return {
        header: title,
        ...options,
      };
    }

    return options;
  }

  return null;
}

export async function getScrapperOptionsByUrlAsync(url: string, title: string): Promise<ScrapperOptions | null> {
  try {
    const customs = await getCustomScraperOptions();
    const match = customs.find((c) => {
      const u = c.options.url;
      if (Array.isArray(u)) return u.some((pattern) => urlMatchesPatternUrl(url, pattern));
      return urlMatchesPatternUrl(url, u);
    });
    if (match) {
      const opt = match.options;
      if (!opt.header) {
        return { header: title, ...opt };
      }
      return opt;
    }
  } catch (e) {
    // Fail-safe: fall back to built-in scrapers.
    console.warn('Failed to read custom scrapers:', e);
  }

  return getScrapperOptionsByUrl(url, title);
}
