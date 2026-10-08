// יוצר מודול scraper לאתר: איחוד הגדרות מ-sources.json עם סלקטורים ספציפיים.
import { extractStrainPage, extractSearchResults } from './extract.js';

export function defineSite({ id, name, selectors = {}, resultLinkSelector = null, isStrainUrl = null, notes = '' }) {
  return {
    id,
    name,
    notes,
    selectors,
    /** כתובות חיפוש לשם זן. דורש search_url_template ב-sources.json (עם {q}) */
    searchUrls(config, query) {
      if (!config.base_url || !config.search_url_template) return [];
      return [new URL(config.search_url_template.replace('{q}', encodeURIComponent(query)), config.base_url).href];
    },
    parseSearchResults(html, pageUrl, config = {}) {
      const links = extractSearchResults(html, pageUrl, config.result_link_selector || resultLinkSelector || 'a[href]');
      const pattern = config.strain_url_pattern ? new RegExp(config.strain_url_pattern) : null;
      return links.filter((l) => (pattern ? pattern.test(l.url) : isStrainUrl ? isStrainUrl(l.url) : true));
    },
    parseStrainPage(html, pageUrl, config = {}) {
      return extractStrainPage(html, pageUrl, { ...selectors, ...(config.selectors || {}) });
    },
  };
}
