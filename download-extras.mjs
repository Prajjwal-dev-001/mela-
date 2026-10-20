import fs from 'fs';
import path from 'path';

const baseUrl = 'https://melachaloge.online';
const targetDir = path.resolve('./mela-raw-clone');

const toCheck = [
  '/assets/client-BtfB5WdA.js',
  '/assets/mela-stall-atlas.webp',
  '/assets/voices/hindi-voices.json',
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/mela-chaloge.png',
  '/my-dussehra-mela-card.png',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml'
];

async function download(relPath) {
  const url = `${baseUrl}${relPath.startsWith('/') ? '' : '/'}${relPath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[${res.status}] ${url}`);
      return;
    }
    const contentType = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    const localPath = path.join(targetDir, relPath.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buf);
    console.log(`[200] Saved ${url} -> ${localPath} (${buf.length} bytes)`);

    if (relPath.endsWith('.js') || relPath.endsWith('.json')) {
      const text = buf.toString('utf8');
      const regex = /["'`](\/?[a-zA-Z0-9_\-\.\/]+\.(?:glb|gltf|bin|mp3|ogg|wav|png|jpg|jpeg|webp|svg|json|js|css))["'`]/gi;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const found = match[1];
        if (!toCheck.includes(found) && !found.startsWith('http') && found.length < 100) {
          toCheck.push(found);
        }
      }
    }
  } catch (err) {
    console.error(`Failed ${url}:`, err.message);
  }
}

async function main() {
  for (let i = 0; i < toCheck.length; i++) {
    await download(toCheck[i]);
  }
  console.log('Finished extra asset check.');
}

main();
