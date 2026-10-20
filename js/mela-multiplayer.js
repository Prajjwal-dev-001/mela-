/**
 * Mela Dussehra Online - Real-Time Multiplayer & Live Chat
 * P2P WebRTC Mesh via Trystero Nostr (Zero backend, zero API keys, Vercel-ready)
 */
import { joinRoom, selfId } from './multiplayer-lib.js';

// Festive color palette for avatars
export const AVATAR_COLORS = [
  { name: 'Kesari', hex: '#f97316', num: 0xf97316 },
  { name: 'Gulabi', hex: '#ec4899', num: 0xec4899 },
  { name: 'Neela', hex: '#2563eb', num: 0x2563eb },
  { name: 'Hara', hex: '#16a34a', num: 0x16a34a },
  { name: 'Peela', hex: '#eab308', num: 0xeab308 },
  { name: 'Baingani', hex: '#9333ea', num: 0x9333ea },
  { name: 'Laal', hex: '#dc2626', num: 0xdc2626 },
  { name: 'Firozi', hex: '#06b6d4', num: 0x06b6d4 },
];

const DEFAULT_NAMES = [
  'MelaRider', 'ChaatLover', 'DesiExplorer', 'PatakhaKing',
  'RavanHunter', 'JhoolaFan', 'JalebiBoss', 'GolgappaStar',
  'MelaHero', 'DholakBeats'
];

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomRoomId() {
  const chars = '23456789abcdefghkmnpqrstuvwxyz';
  let str = '';
  for (let i = 0; i < 4; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return 'mela-' + str;
}

export class MelaMultiplayer {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.options = options;
    this.THREE = window.THREE;
    this.peers = new Map(); // peerId -> { profile, mesh, target, current, speechBubble }
    this.messages = [];
    this.unreadCount = 0;
    this.chatOpen = false;
    this.profileModalOpen = false;

    // Room setup
    const params = new URLSearchParams(window.location.search);
    let roomParam = params.get('room');
    if (!roomParam) {
      roomParam = getRandomRoomId();
      params.set('room', roomParam);
      const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
      window.history.replaceState({}, '', newUrl);
    }
    this.roomId = roomParam;

    // Profile setup
    let savedName = localStorage.getItem('mela_player_name');
    if (!savedName || !savedName.trim()) {
      savedName = `${getRandomItem(DEFAULT_NAMES)}_${Math.floor(10 + Math.random() * 90)}`;
      localStorage.setItem('mela_player_name', savedName);
    }
    this.playerName = savedName;

    let savedColor = localStorage.getItem('mela_player_color');
    const colorObj = AVATAR_COLORS.find(c => c.hex === savedColor) || getRandomItem(AVATAR_COLORS);
    this.playerColor = colorObj.hex;
    this.playerColorNum = colorObj.num;
    localStorage.setItem('mela_player_color', this.playerColor);

    // Initialize UI
    this.createUI();

    // Initialize Network
    this.initNetwork();

    // Setup broadcast timer (~50ms / 20Hz)
    this.lastBroadcast = 0;
    this.broadcastInterval = 50;

    console.log(`[Multiplayer] Initialized for room ${this.roomId} as ${this.playerName} (${selfId})`);
  }

  initNetwork() {
    try {
      this.room = joinRoom({ appId: 'dussehra-mela-v1' }, this.roomId);
      const [sendState, getState] = this.room.makeAction('state');
      const [sendProfile, getProfile] = this.room.makeAction('profile');
      const [sendChat, getChat] = this.room.makeAction('chat');

      this.sendStateAction = sendState;
      this.sendProfileAction = sendProfile;
      this.sendChatAction = sendChat;

      // Handle peer joins
      this.room.onPeerJoin((peerId) => {
        console.log(`[Multiplayer] Peer joined: ${peerId}`);
        // Send our profile to the newly joined peer
        this.sendProfileAction({
          name: this.playerName,
          color: this.playerColor,
        }, peerId);

        // Update badge
        this.updateBadge();
      });

      // Handle peer leaves
      this.room.onPeerLeave((peerId) => {
        console.log(`[Multiplayer] Peer left: ${peerId}`);
        const peer = this.peers.get(peerId);
        if (peer) {
          const peerName = peer.profile.name || 'A friend';
          this.removePeerAvatar(peerId);
          this.showToast(`${peerName} left the mela`);
          this.appendChatMessage({
            system: true,
            text: `${peerName} left the mela`,
            time: Date.now(),
          });
        }
        this.peers.delete(peerId);
        this.updateBadge();
      });

      // Handle profile updates
      getProfile((profile, peerId) => {
        console.log(`[Multiplayer] Got profile from ${peerId}:`, profile);
        let peer = this.peers.get(peerId);
        const isNew = !peer;
        if (!peer) {
          peer = {
            profile,
            mesh: null,
            target: { x: 0, z: 28, yaw: 0, pitch: 0, isMoving: false, mode: 'walk' },
            current: { x: 0, z: 28, yaw: 0, pitch: 0, isMoving: false, walkTime: 0 },
            speechBubble: null,
          };
          this.peers.set(peerId, peer);
          this.createPeerAvatar(peerId, peer);
          this.showToast(`${profile.name || 'A friend'} joined the mela! 🎉`);
          this.appendChatMessage({
            system: true,
            text: `${profile.name || 'A friend'} joined the mela!`,
            time: Date.now(),
          });
        } else {
          peer.profile = profile;
          // Re-create or update avatar clothing color & nametag
          this.updatePeerAvatarColorAndName(peerId, peer);
        }
        this.updateBadge();
      });

      // Handle state updates
      getState((state, peerId) => {
        let peer = this.peers.get(peerId);
        if (!peer) {
          // If we haven't received profile yet, request or create default
          peer = {
            profile: { name: 'Mela Friend', color: AVATAR_COLORS[0].hex },
            mesh: null,
            target: { ...state },
            current: { ...state, walkTime: 0 },
            speechBubble: null,
          };
          this.peers.set(peerId, peer);
          this.createPeerAvatar(peerId, peer);
          // Ask for their profile
          this.sendProfileAction({
            name: this.playerName,
            color: this.playerColor,
          }, peerId);
          this.updateBadge();
        }

        // Update target coordinates
        peer.target = {
          x: state.x ?? peer.target.x,
          z: state.z ?? peer.target.z,
          yaw: state.yaw ?? peer.target.yaw,
          pitch: state.pitch ?? peer.target.pitch,
          isMoving: !!state.isMoving,
          mode: state.mode || 'walk',
        };
      });

      // Handle live chat
      getChat((msg, peerId) => {
        console.log(`[Multiplayer] Chat from ${peerId}:`, msg);
        const peer = this.peers.get(peerId);
        const senderName = msg.senderName || peer?.profile?.name || 'Friend';
        const senderColor = msg.senderColor || peer?.profile?.color || '#ec4899';

        this.appendChatMessage({
          senderId: peerId,
          senderName,
          senderColor,
          text: msg.text,
          time: msg.time || Date.now(),
        });

        // Show floating speech bubble over friend's avatar in 3D world
        if (peer && peer.mesh) {
          this.showSpeechBubble(peer, msg.text);
        }
      });

    } catch (err) {
      console.error('[Multiplayer] Failed to join room:', err);
      this.showToast('Multiplayer offline. Exploring in solo mode.');
    }
  }

  // Exact reproduction of Dussehra Mela character avatar
  createPeerAvatar(peerId, peer) {
    const s = this.THREE;
    if (!s || !this.engine || !this.engine.scene) return;

    const group = new s.Group();
    group.position.set(peer.target.x, 0, peer.target.z);
    this.engine.scene.add(group);

    const colorObj = AVATAR_COLORS.find(c => c.hex.toLowerCase() === (peer.profile.color || '').toLowerCase()) || AVATAR_COLORS[0];
    const clothingColor = colorObj.num;

    const mat = (color, roughness = 0.82) => new s.MeshStandardMaterial({
      color,
      roughness,
      flatShading: true,
    });

    const boxGeom = new s.BoxGeometry(1, 1, 1);
    const sphereGeom = new s.SphereGeometry(1, 12, 10);

    const makeBox = (col, x, y, z, sx, sy, sz, parent = group) => {
      const mesh = new s.Mesh(boxGeom, mat(col));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const makeSphere = (col, x, y, z, r, parent = group) => {
      const mesh = new s.Mesh(sphereGeom, mat(col));
      mesh.position.set(x, y, z);
      mesh.scale.set(r, r, r);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // 1. Torso
    const torso = makeBox(clothingColor, 0, 1.05, 0, 0.55, 0.85, 0.35);

    // 2. Head / Face (skin tone)
    const head = makeSphere(11959637, 0, 1.7, 0, 0.25);

    // 3. Hair / Pagri / Cap
    const hair = makeSphere(2169633, 0, 1.84, -0.025, 0.23);

    // 4. Limbs with articulation pivots for realistic walking animation!
    // Left Leg Group (pivot at hip)
    const leftLegGroup = new s.Group();
    leftLegGroup.position.set(-0.16, 0.73, 0);
    group.add(leftLegGroup);
    makeBox(3161161, 0, -0.36, 0, 0.18, 0.72, 0.2, leftLegGroup); // pants
    makeBox(2170402, 0, -0.66, 0.08, 0.2, 0.13, 0.37, leftLegGroup); // shoe

    // Right Leg Group (pivot at hip)
    const rightLegGroup = new s.Group();
    rightLegGroup.position.set(0.16, 0.73, 0);
    group.add(rightLegGroup);
    makeBox(3161161, 0, -0.36, 0, 0.18, 0.72, 0.2, rightLegGroup); // pants
    makeBox(2170402, 0, -0.66, 0.08, 0.2, 0.13, 0.37, rightLegGroup); // shoe

    // Left Arm Group (pivot at shoulder)
    const leftArmGroup = new s.Group();
    leftArmGroup.position.set(-0.37, 1.4, 0);
    group.add(leftArmGroup);
    makeBox(clothingColor, 0, -0.35, 0, 0.16, 0.7, 0.2, leftArmGroup);

    // Right Arm Group (pivot at shoulder)
    const rightArmGroup = new s.Group();
    rightArmGroup.position.set(0.37, 1.4, 0);
    group.add(rightArmGroup);
    makeBox(clothingColor, 0, -0.35, 0, 0.16, 0.7, 0.2, rightArmGroup);

    // 5. Floating Nametag Sprite Billboard
    const nametagSprite = this.createNametagSprite(peer.profile.name || 'Friend');
    nametagSprite.position.set(0, 2.25, 0);
    group.add(nametagSprite);

    peer.mesh = group;
    peer.limbs = {
      leftLeg: leftLegGroup,
      rightLeg: rightLegGroup,
      leftArm: leftArmGroup,
      rightArm: rightArmGroup,
      torso,
      nametag: nametagSprite,
    };
  }

  createNametagSprite(name) {
    const s = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Rounded badge background
    ctx.fillStyle = 'rgba(17, 27, 40, 0.88)';
    const r = 24;
    const x = 32, y = 20, w = 448, h = 88;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();

    // Golden border
    ctx.strokeStyle = '#efb653';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Status dot 🟢
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(x + 36, y + h / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.fillStyle = '#f8e9cf';
    ctx.font = 'bold 38px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const displayName = name.length > 16 ? name.slice(0, 15) + '…' : name;
    ctx.fillText(displayName, x + 60, y + h / 2 + 2);

    const texture = new s.CanvasTexture(canvas);
    texture.colorSpace = s.SRGBColorSpace;
    const material = new s.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new s.Sprite(material);
    sprite.scale.set(2.4, 0.6, 1);
    return sprite;
  }

  updatePeerAvatarColorAndName(peerId, peer) {
    if (!peer.mesh) return;
    this.removePeerAvatar(peerId);
    this.createPeerAvatar(peerId, peer);
  }

  removePeerAvatar(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.mesh) return;
    if (peer.speechBubble) {
      this.engine.scene.remove(peer.speechBubble);
      if (peer.speechBubble.material.map) peer.speechBubble.material.map.dispose();
      peer.speechBubble.material.dispose();
      peer.speechBubble = null;
    }
    this.engine.scene.remove(peer.mesh);
    peer.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    peer.mesh = null;
  }

  // Floating comic speech bubble directly above avatar
  showSpeechBubble(peer, text) {
    const s = this.THREE;
    if (!s || !this.engine || !this.engine.scene || !peer.mesh) return;

    if (peer.speechBubble) {
      this.engine.scene.remove(peer.speechBubble);
      if (peer.speechBubble.material.map) peer.speechBubble.material.map.dispose();
      peer.speechBubble.material.dispose();
      peer.speechBubble = null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Comic speech bubble shape
    ctx.fillStyle = 'rgba(255, 252, 240, 0.96)';
    ctx.strokeStyle = '#5b2229';
    ctx.lineWidth = 5;

    const bx = 16, by = 16, bw = 480, bh = 170, br = 28;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, br);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, br);

    // Pointer tail pointing down towards the head
    const tailX = bx + bw / 2;
    ctx.lineTo(tailX + 24, by + bh);
    ctx.lineTo(tailX, by + bh + 48);
    ctx.lineTo(tailX - 24, by + bh);

    ctx.arcTo(bx, by + bh, bx, by, br);
    ctx.arcTo(bx, by, bx + bw, by, br);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Sender name pill
    ctx.fillStyle = '#b45309';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((peer.profile.name || 'Friend').toUpperCase(), 256, 48);

    // Message text with word-wrap
    ctx.fillStyle = '#1e1b18';
    ctx.font = 'bold 30px system-ui, sans-serif';
    
    // Simple text wrapping
    const words = text.split(' ');
    let line = '';
    let lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > 420 && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    if (lines.length > 3) lines = lines.slice(0, 3); // max 3 lines

    const startY = 88 + (3 - lines.length) * 12;
    lines.forEach((l, idx) => {
      ctx.fillText(l.trim(), 256, startY + idx * 36);
    });

    const texture = new s.CanvasTexture(canvas);
    texture.colorSpace = s.SRGBColorSpace;
    const material = new s.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new s.Sprite(material);
    sprite.scale.set(3.4, 1.7, 1);
    sprite.position.set(0, 3.1, 0);

    peer.mesh.add(sprite);
    peer.speechBubble = sprite;
    peer.speechBubbleTimer = 5.0; // 5 seconds duration
  }

  // Show local player's speech bubble over themselves (or in first-person camera view)
  showLocalSpeechBubble(text) {
    this.showToast(`You: "${text}"`);
  }

  // Animation and position interpolation in the game loop
  update(delta, elapsed) {
    if (!this.engine) return;

    // 1. Broadcast local player position at 20Hz
    const now = performance.now();
    if (now - this.lastBroadcast > this.broadcastInterval && this.sendStateAction) {
      this.lastBroadcast = now;
      const isMoving = this.engine.keys?.size > 0 || Math.hypot(this.engine.move?.x || 0, this.engine.move?.y || 0) > 0.05;
      this.sendStateAction({
        x: this.engine.player.x,
        z: this.engine.player.z,
        yaw: this.engine.yaw,
        pitch: this.engine.pitch,
        isMoving,
        mode: this.engine.mode,
      });
    }

    // 2. Interpolate all remote peers
    const lerpSpeed = Math.min(1, delta * 14);
    const rotSpeed = Math.min(1, delta * 10);

    this.peers.forEach((peer) => {
      if (!peer.mesh) return;

      const current = peer.current;
      const target = peer.target;

      // Linear Interpolation (lerp)
      current.x += (target.x - current.x) * lerpSpeed;
      current.z += (target.z - current.z) * lerpSpeed;

      // Angle interpolation for yaw
      let diffYaw = target.yaw - current.yaw;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      current.yaw += diffYaw * rotSpeed;

      peer.mesh.position.set(current.x, 0, current.z);
      peer.mesh.rotation.y = current.yaw;

      // Walk limb swing animation
      if (peer.limbs) {
        if (target.isMoving) {
          current.walkTime += delta * 12;
          const swing = Math.sin(current.walkTime) * 0.55;
          peer.limbs.leftLeg.rotation.x = swing;
          peer.limbs.rightLeg.rotation.x = -swing;
          peer.limbs.leftArm.rotation.x = -swing * 0.75;
          peer.limbs.rightArm.rotation.x = swing * 0.75;
        } else {
          // Return limbs smoothly to rest position
          peer.limbs.leftLeg.rotation.x *= 0.8;
          peer.limbs.rightLeg.rotation.x *= 0.8;
          peer.limbs.leftArm.rotation.x *= 0.8;
          peer.limbs.rightArm.rotation.x *= 0.8;
        }
      }

      // Handle speech bubble timer and fade out
      if (peer.speechBubble && peer.speechBubbleTimer > 0) {
        peer.speechBubbleTimer -= delta;
        // Float bob animation
        peer.speechBubble.position.y = 3.1 + Math.sin(elapsed * 4) * 0.04;
        if (peer.speechBubbleTimer <= 0.8) {
          peer.speechBubble.material.opacity = Math.max(0, peer.speechBubbleTimer / 0.8);
        }
        if (peer.speechBubbleTimer <= 0) {
          peer.mesh.remove(peer.speechBubble);
          if (peer.speechBubble.material.map) peer.speechBubble.material.map.dispose();
          peer.speechBubble.material.dispose();
          peer.speechBubble = null;
        }
      }
    });
  }

  // Shareable link copying
  copyInviteLink() {
    const url = window.location.href;
    const text = `Mela chaloge mere sath? 🎪❤️\nPoora 3D Dussehra mela live browser mein! Saath mein walk karte hain:\n${url}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('Link Copied! Send it to your friends to walk together! 🎉');
      }).catch(() => {
        this.fallbackCopy(url);
      });
    } else {
      this.fallbackCopy(url);
    }

    if (navigator.share) {
      navigator.share({
        title: 'Mela chaloge mere sath? ❤️',
        text: 'Join me in this 3D Dussehra Mela!',
        url,
      }).catch(() => {});
    }
  }

  fallbackCopy(text) {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      this.showToast('Link Copied! Send it to your friends to walk together! 🎉');
    } catch {
      this.showToast(`Invite Link: ${text}`);
    }
    document.body.removeChild(input);
  }

  // Toast notifications
  showToast(message) {
    if (this.engine && this.engine.events && this.engine.events.onToast) {
      this.engine.events.onToast(message);
    } else {
      const existing = document.querySelector('.mela-multiplayer-toast');
      if (existing) existing.remove();
      const toast = document.createElement('div');
      toast.className = 'mela-multiplayer-toast';
      toast.innerText = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }
  }

  // Send Chat message
  sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const msg = {
      senderId: selfId,
      senderName: this.playerName,
      senderColor: this.playerColor,
      text: trimmed,
      time: Date.now(),
    };

    if (this.sendChatAction) {
      this.sendChatAction(msg);
    }

    this.appendChatMessage(msg);
    this.showLocalSpeechBubble(trimmed);
  }

  appendChatMessage(msg) {
    this.messages.push(msg);
    if (!this.chatOpen && !msg.system) {
      this.unreadCount++;
      this.updateChatBadge();
    }
    this.renderChatMessages();
  }

  updateProfile(name, colorHex) {
    if (name && name.trim()) {
      this.playerName = name.trim();
      localStorage.setItem('mela_player_name', this.playerName);
    }
    if (colorHex) {
      this.playerColor = colorHex;
      const colorObj = AVATAR_COLORS.find(c => c.hex === colorHex);
      this.playerColorNum = colorObj ? colorObj.num : 0xf97316;
      localStorage.setItem('mela_player_color', this.playerColor);
    }

    // Broadcast updated profile to everyone
    if (this.sendProfileAction) {
      this.sendProfileAction({
        name: this.playerName,
        color: this.playerColor,
      });
    }

    this.updateBadge();
    this.showToast(`Profile updated: ${this.playerName}`);
  }

  // ================= UI Construction =================
  createUI() {
    const style = document.createElement('style');
    style.id = 'mela-multiplayer-styles';
    style.textContent = `
      /* Live Room & Friends Badge */
      .mela-room-badge {
        position: fixed;
        top: 14px;
        left: 16px;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(16, 27, 43, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(245, 219, 171, 0.25);
        border-radius: 999px;
        padding: 6px 14px 6px 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        color: #f7e8cc;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
      }
      .mela-room-badge:hover {
        background: rgba(26, 42, 64, 0.95);
        border-color: rgba(245, 219, 171, 0.5);
        transform: translateY(-1px);
      }
      .mela-status-dot {
        width: 10px;
        height: 10px;
        background: #22c55e;
        border-radius: 50%;
        box-shadow: 0 0 10px #22c55e;
        animation: melaPulse 2s infinite;
      }
      @keyframes melaPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.6; transform: scale(0.85); }
      }
      .mela-badge-invite-btn {
        background: linear-gradient(135deg, #eab308, #ca8a04);
        color: #1a1005;
        font-weight: 700;
        border: none;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11px;
        letter-spacing: 0.5px;
        cursor: pointer;
        margin-left: 4px;
        transition: transform 0.15s ease;
      }
      .mela-badge-invite-btn:hover {
        transform: scale(1.05);
      }

      /* Live Chat Drawer */
      .mela-chat-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .mela-chat-toggle-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: linear-gradient(135deg, rgba(234, 179, 8, 0.95), rgba(202, 138, 4, 0.95));
        color: #1e1303;
        font-weight: 700;
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        font-size: 14px;
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.45);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .mela-chat-toggle-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 30px rgba(234, 179, 8, 0.4);
      }
      .mela-chat-unread-badge {
        background: #ef4444;
        color: white;
        border-radius: 999px;
        padding: 2px 7px;
        font-size: 11px;
        font-weight: 800;
      }
      .mela-chat-box {
        display: none;
        flex-direction: column;
        width: 330px;
        max-width: calc(100vw - 32px);
        height: 420px;
        max-height: calc(100vh - 120px);
        background: rgba(15, 23, 38, 0.92);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(245, 219, 171, 0.3);
        border-radius: 18px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        margin-bottom: 12px;
        animation: melaFadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes melaFadeUp {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .mela-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: rgba(24, 38, 60, 0.7);
        border-bottom: 1px solid rgba(245, 219, 171, 0.15);
        color: #f7e8cc;
        font-weight: 600;
        font-size: 14px;
      }
      .mela-chat-close-btn {
        background: none;
        border: none;
        color: #f7e8cc;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.15s;
      }
      .mela-chat-close-btn:hover { opacity: 1; }
      .mela-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .mela-chat-msg {
        display: flex;
        flex-direction: column;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 6px 10px;
        font-size: 13px;
        line-height: 1.35;
        color: #f1f5f9;
        word-break: break-word;
      }
      .mela-chat-msg-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
        font-size: 11px;
      }
      .mela-chat-sender {
        font-weight: 700;
      }
      .mela-chat-time {
        color: rgba(241, 245, 249, 0.45);
        font-size: 10px;
      }
      .mela-chat-msg.system {
        background: rgba(234, 179, 8, 0.1);
        border-color: rgba(234, 179, 8, 0.25);
        color: #fde047;
        text-align: center;
        font-size: 11px;
        font-style: italic;
      }
      .mela-chat-quick-emojis {
        display: flex;
        justify-content: space-around;
        padding: 6px 8px;
        background: rgba(20, 31, 48, 0.8);
        border-top: 1px solid rgba(245, 219, 171, 0.1);
      }
      .mela-emoji-btn {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        transition: transform 0.15s ease, background 0.15s ease;
      }
      .mela-emoji-btn:hover {
        transform: scale(1.3);
        background: rgba(255, 255, 255, 0.1);
      }
      .mela-chat-form {
        display: flex;
        padding: 8px 10px;
        gap: 6px;
        background: rgba(16, 27, 43, 0.95);
        border-top: 1px solid rgba(245, 219, 171, 0.15);
      }
      .mela-chat-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(245, 219, 171, 0.2);
        border-radius: 8px;
        padding: 7px 10px;
        color: #fff;
        font-size: 13px;
        outline: none;
      }
      .mela-chat-input:focus {
        border-color: #eab308;
      }
      .mela-chat-send-btn {
        background: #eab308;
        color: #1a1005;
        font-weight: 700;
        border: none;
        border-radius: 8px;
        padding: 0 12px;
        font-size: 13px;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .mela-chat-send-btn:hover { opacity: 0.9; }

      /* Profile Edit Modal */
      .mela-modal-overlay {
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        z-index: 2000;
        justify-content: center;
        align-items: center;
      }
      .mela-modal-card {
        background: #111b27;
        border: 1px solid #efb653;
        border-radius: 20px;
        width: 90%;
        max-width: 380px;
        padding: 24px;
        color: #f7e8cc;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
      }
      .mela-modal-card h2 {
        margin: 0 0 6px 0;
        font-size: 20px;
        color: #f9d08b;
        font-family: Georgia, serif;
      }
      .mela-color-swatches {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin: 14px 0 20px 0;
      }
      .mela-color-swatch {
        width: 100%;
        height: 38px;
        border-radius: 8px;
        cursor: pointer;
        border: 2px solid transparent;
        transition: transform 0.15s, border-color 0.15s;
      }
      .mela-color-swatch.active {
        border-color: #fff;
        transform: scale(1.1);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
      }
      .mela-modal-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(245, 219, 171, 0.3);
        border-radius: 10px;
        padding: 10px 14px;
        color: #fff;
        font-size: 15px;
        margin: 8px 0 16px 0;
      }
      .mela-modal-buttons {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .mela-btn-cancel {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #f7e8cc;
        border-radius: 8px;
        padding: 8px 14px;
        cursor: pointer;
      }
      .mela-btn-save {
        background: linear-gradient(135deg, #eab308, #ca8a04);
        border: none;
        color: #1a1005;
        font-weight: 700;
        border-radius: 8px;
        padding: 8px 18px;
        cursor: pointer;
      }

      /* Custom Toast */
      .mela-multiplayer-toast {
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(17, 27, 40, 0.94);
        color: #f8e9cf;
        border: 1px solid #efb653;
        padding: 10px 20px;
        border-radius: 999px;
        font-size: 14px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
        z-index: 3000;
        animation: melaFadeUp 0.2s ease;
      }
    `;
    document.head.appendChild(style);

    // 1. Live Room Badge
    const badge = document.createElement('div');
    badge.className = 'mela-room-badge';
    badge.id = 'melaRoomBadge';
    badge.title = 'Click to customize name & avatar color';
    badge.innerHTML = `
      <span class="mela-status-dot"></span>
      <span id="melaRoomText">Room: <b>${this.roomId}</b> · 1 Friend in Mela</span>
      <button class="mela-badge-invite-btn" id="melaInviteBtn">Dosto Ko Bulao ↗</button>
    `;
    document.body.appendChild(badge);

    badge.addEventListener('click', (e) => {
      if (e.target.id === 'melaInviteBtn') {
        e.stopPropagation();
        this.copyInviteLink();
      } else {
        this.openProfileModal();
      }
    });

    // 2. Live Chat Widget
    const chatContainer = document.createElement('div');
    chatContainer.className = 'mela-chat-container';
    chatContainer.id = 'melaChatContainer';
    chatContainer.innerHTML = `
      <div class="mela-chat-box" id="melaChatBox">
        <div class="mela-chat-header">
          <span>🎪 Mela Live Chat (<span id="melaChatFriendCount">0</span> friends)</span>
          <button class="mela-chat-close-btn" id="melaChatCloseBtn">×</button>
        </div>
        <div class="mela-chat-messages" id="melaChatMessages">
          <div class="mela-chat-msg system">Swagat hai! Chat messages appear as comic speech bubbles above your avatar.</div>
        </div>
        <div class="mela-chat-quick-emojis">
          <button class="mela-emoji-btn" data-emoji="🎉">🎉</button>
          <button class="mela-emoji-btn" data-emoji="😂">😂</button>
          <button class="mela-emoji-btn" data-emoji="❤️">❤️</button>
          <button class="mela-emoji-btn" data-emoji="🔥">🔥</button>
          <button class="mela-emoji-btn" data-emoji="🪔">🪔</button>
          <button class="mela-emoji-btn" data-emoji="🎪">🎪</button>
        </div>
        <form class="mela-chat-form" id="melaChatForm">
          <input type="text" class="mela-chat-input" id="melaChatInput" placeholder="Say something in mela..." autocomplete="off" />
          <button type="submit" class="mela-chat-send-btn">Send</button>
        </form>
      </div>
      <button class="mela-chat-toggle-btn" id="melaChatToggleBtn">
        <span>💬 Live Chat</span>
        <span class="mela-chat-unread-badge" id="melaChatUnreadBadge" style="display:none">0</span>
      </button>
    `;
    document.body.appendChild(chatContainer);

    // Chat Event Listeners
    const toggleBtn = chatContainer.querySelector('#melaChatToggleBtn');
    const closeBtn = chatContainer.querySelector('#melaChatCloseBtn');
    const chatBox = chatContainer.querySelector('#melaChatBox');
    const chatForm = chatContainer.querySelector('#melaChatForm');
    const chatInput = chatContainer.querySelector('#melaChatInput');

    const toggleChat = (open) => {
      this.chatOpen = open;
      chatBox.style.display = open ? 'flex' : 'none';
      toggleBtn.style.display = open ? 'none' : 'flex';
      if (open) {
        this.unreadCount = 0;
        this.updateChatBadge();
        chatInput.focus();
      }
    };

    toggleBtn.addEventListener('click', () => toggleChat(true));
    closeBtn.addEventListener('click', () => toggleChat(false));

    // Prevent game keys while typing in chat
    chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });
    chatInput.addEventListener('keyup', (e) => {
      e.stopPropagation();
    });

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = chatInput.value;
      if (val.trim()) {
        this.sendMessage(val);
        chatInput.value = '';
      }
    });

    // Quick emoji buttons
    chatContainer.querySelectorAll('.mela-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        this.sendMessage(emoji);
      });
    });

    // 3. Profile Customization Modal
    const modal = document.createElement('div');
    modal.className = 'mela-modal-overlay';
    modal.id = 'melaProfileModal';
    modal.innerHTML = `
      <div class="mela-modal-card">
        <h2>Your Mela Avatar</h2>
        <p style="font-size: 13px; color: rgba(247, 232, 204, 0.7); margin-top: 0;">Customize your name and festive outfit color</p>
        
        <label style="font-size: 12px; font-weight: 700; color: #efb653; text-transform: uppercase;">Your Nickname</label>
        <input type="text" class="mela-modal-input" id="melaProfileNameInput" value="${this.playerName}" maxlength="20" />

        <label style="font-size: 12px; font-weight: 700; color: #efb653; text-transform: uppercase;">Avatar Outfit Color</label>
        <div class="mela-color-swatches" id="melaColorSwatches">
          ${AVATAR_COLORS.map(c => `
            <div class="mela-color-swatch ${c.hex === this.playerColor ? 'active' : ''}" 
                 style="background: ${c.hex}" 
                 data-color="${c.hex}" 
                 title="${c.name}"></div>
          `).join('')}
        </div>

        <div class="mela-modal-buttons">
          <button class="mela-btn-cancel" id="melaModalCancel">Cancel</button>
          <button class="mela-btn-save" id="melaModalSave">Save & Walk</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let selectedColor = this.playerColor;
    modal.querySelectorAll('.mela-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        modal.querySelectorAll('.mela-color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        selectedColor = swatch.dataset.color;
      });
    });

    const nameInput = modal.querySelector('#melaProfileNameInput');
    nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    nameInput.addEventListener('keyup', (e) => e.stopPropagation());

    modal.querySelector('#melaModalCancel').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.querySelector('#melaModalSave').addEventListener('click', () => {
      this.updateProfile(nameInput.value, selectedColor);
      modal.style.display = 'none';
    });

    this.profileModal = modal;
    this.updateBadge();
  }

  openProfileModal() {
    if (this.profileModal) {
      this.profileModal.style.display = 'flex';
      const nameInput = this.profileModal.querySelector('#melaProfileNameInput');
      nameInput.value = this.playerName;
      nameInput.focus();
    }
  }

  updateBadge() {
    const badgeText = document.getElementById('melaRoomText');
    const friendCountSpan = document.getElementById('melaChatFriendCount');
    const friendCount = this.peers.size;
    const totalCount = friendCount + 1;

    if (badgeText) {
      if (friendCount === 0) {
        badgeText.innerHTML = `🟢 <b>${this.roomId}</b> · 1 Friend in Mela (${this.playerName})`;
      } else {
        badgeText.innerHTML = `🟢 <b>${this.roomId}</b> · ${totalCount} Friends in Mela`;
      }
    }
    if (friendCountSpan) {
      friendCountSpan.innerText = friendCount.toString();
    }
  }

  updateChatBadge() {
    const badge = document.getElementById('melaChatUnreadBadge');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = this.unreadCount > 9 ? '9+' : this.unreadCount.toString();
      } else {
        badge.style.display = 'none';
      }
    }
  }

  renderChatMessages() {
    const container = document.getElementById('melaChatMessages');
    if (!container) return;

    // Render latest messages
    const recent = this.messages.slice(-50);
    container.innerHTML = recent.map(m => {
      if (m.system) {
        return `<div class="mela-chat-msg system">${m.text}</div>`;
      }
      const timeStr = new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="mela-chat-msg">
          <div class="mela-chat-msg-header">
            <span class="mela-chat-sender" style="color: ${m.senderColor || '#eab308'}">${m.senderName}</span>
            <span class="mela-chat-time">${timeStr}</span>
          </div>
          <div>${m.text}</div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  destroy() {
    this.peers.forEach((_, peerId) => this.removePeerAvatar(peerId));
    this.peers.clear();
    if (this.room) {
      try { this.room.leave(); } catch {}
    }
    document.getElementById('melaRoomBadge')?.remove();
    document.getElementById('melaChatContainer')?.remove();
    document.getElementById('melaProfileModal')?.remove();
    document.getElementById('mela-multiplayer-styles')?.remove();
  }
}
