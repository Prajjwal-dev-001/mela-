import * as esbuild from 'esbuild';
import fs from 'fs';

async function build() {
  console.log('Building multiplayer bundle with compatibility wrapper...');
  
  const entryPath = './multiplayer-entry.js';
  fs.writeFileSync(entryPath, `
    import { joinRoom as rawJoinRoom, selfId, defaultRelayUrls } from 'trystero/nostr';

    export function joinRoom(config, roomId) {
      const room = rawJoinRoom(config, roomId);

      return {
        ...room,
        onPeerJoin(handler) {
          room.onPeerJoin = handler;
        },
        onPeerLeave(handler) {
          room.onPeerLeave = handler;
        },
        makeAction(type) {
          const act = room.makeAction(type);
          const sendFn = (data, target) => {
            return act.send(data, target ? { target } : {});
          };
          const getFn = (handler) => {
            act.onMessage = (data, meta) => {
              handler(data, meta?.peerId);
            };
          };
          const tuple = [sendFn, getFn];
          tuple.send = sendFn;
          tuple.get = getFn;
          return tuple;
        },
        leave() {
          return room.leave();
        }
      };
    }

    export { selfId, defaultRelayUrls };
  `);

  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    outfile: './js/multiplayer-lib.js',
    minify: true,
  });

  fs.unlinkSync(entryPath);
  console.log('Successfully rebuilt ./js/multiplayer-lib.js');
}

build().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});
