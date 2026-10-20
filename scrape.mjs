import scrape from 'website-scraper';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options = {
  urls: ['https://melachaloge.online/'],
  directory: path.resolve(__dirname, 'mela-raw-clone'),
  recursive: true,
  maxRecursiveDepth: 2,
  request: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  }
};

try {
  console.log('Scraping https://melachaloge.online/ with recursive depth 2...');
  const result = await scrape(options);
  console.log(`Scrape finished successfully! Downloaded ${result.length} files.`);
} catch (err) {
  console.error('Scraping error:', err);
  process.exit(1);
}
