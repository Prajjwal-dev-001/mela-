import fs from 'fs';

const js = fs.readFileSync('./mela-raw-clone/js/main-BQ8hLnac.js', 'utf8');
const regex = /["'`](\/?[a-zA-Z0-9_\-\.\/]+\.(?:glb|gltf|bin|mp3|ogg|wav|png|jpg|jpeg|webp|svg|json|js|css))["'`]/gi;
let match;
const found = new Set();
while ((match = regex.exec(js)) !== null) {
  found.add(match[1]);
}
console.log('Matches found in JS:');
for (const item of Array.from(found).sort()) {
  console.log('-', item);
}
