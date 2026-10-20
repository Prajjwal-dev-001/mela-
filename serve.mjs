import http from 'http';
import fs from 'fs';
import path from 'path';

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg'
};

const root = path.resolve('.');

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Handle mock stalls API
  if (reqPath === '/api/stalls') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stalls: [] }));
    return;
  }

  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  
  let filePath = path.join(root, reqPath);
  
  // Fallback checks
  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    } else if (reqPath.startsWith('/assets/')) {
      // Check if it exists in js or images or fonts
      const assetName = path.basename(reqPath);
      for (const sub of ['js', 'images', 'fonts', 'css']) {
        const candidate = path.join(root, sub, assetName);
        if (fs.existsSync(candidate)) {
          filePath = candidate;
          break;
        }
      }
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + reqPath);
  }
});

server.listen(4173, 'localhost', () => {
  console.log('Mela test server running on http://localhost:4173');
});
