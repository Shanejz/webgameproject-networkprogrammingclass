import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TITLE_FONT,
  CUTSCENE_TEXT_SPEED,
  CUTSCENE_FADE_TIME,
} from './config.js';
import { getImage } from './assets.js';
import { playSound } from './audio.js';
import { canSpeak, speakAsCommander, stopSpeaking } from './voice.js';

// 開場過場動畫：指揮官在夜晚的游擊隊營地下達任務 (intro cutscene: the commander's night-time briefing)
//
// 劇本 SCRIPT 是一個陣列，每一筆是一句台詞：
//   shot：這句話的「鏡頭」(which scene to show)
//     'camp'      夜晚的游擊隊營地全景 (wide shot of the camp at night)
//     'radio'     野戰無線電特寫：指揮官不在現場，從無線電下命令 (close-up of the field radio: the commander talks over the radio)
//     'hero'      營地 + 主角半身像 (camp + hero portrait)
//     'map'       桌上的作戰地圖特寫 (close-up of the battle map)
//     'title'     任務標題卡 (mission title card)
//   speaker：誰在說話，null = 旁白；'COMMANDER' 的台詞會播無線電雜訊聲 (who is talking, null = narrator; COMMANDER lines play radio noise)
//   text：台詞 (the line)
// 想改劇情，只要改這個陣列就好 (edit this array to change the story)
const SCRIPT = [
  { shot: 'camp', speaker: null, text: 'Somewhere deep in the jungle. 0400 hours.' },
  { shot: 'camp', speaker: null, text: 'The invaders have taken the valley. Every day, their camps creep deeper into our jungle.' },
  { shot: 'camp', speaker: null, text: 'The field radio crackles to life.' },
  { shot: 'radio', speaker: 'COMMANDER', text: "Eagle, this is Base. Good, you're awake, soldier. We don't have much time." },
  { shot: 'map', speaker: 'COMMANDER', text: 'Our scouts found their outposts along the river. Each one is hiding intel on their next attack.' },
  { shot: 'map', speaker: 'COMMANDER', text: 'Sneak into their base, clear it out and grab the intel. Our truck will pick you up outside.' },
  { shot: 'radio', speaker: 'COMMANDER', text: "There's worse news. They've taken villagers hostage, guarded by their field commanders." },
  { shot: 'radio', speaker: 'COMMANDER', text: 'Take those commanders down, and bring our people home.' },
  { shot: 'radio', speaker: 'COMMANDER', text: 'Stay in the bushes and keep your head down. Good luck. Base out.' },
  { shot: 'title', speaker: null, text: '' },
];

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const BAR_HEIGHT = 26;                                   // 上方電影黑邊的高度 (cinematic bar height)
const BOX = { x: 24, y: 292, w: W - 48, h: 108 };        // 對話框 (dialogue box)
const SKIP_BUTTON = { x: W - 108, y: 34, w: 92, h: 30 }; // 右上角的「跳過」按鈕 (skip button)
const SPEAKER_COLORS = { COMMANDER: '#ffd23f', YOU: '#ff7043' };

// ===== 小工具 (helpers) =====

/**
 * 假的隨機數：同一個 n 永遠得到同一個 0~1 的數字 (repeatable pseudo-random)
 */
function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/**
 * 圓角矩形路徑 (rounded-rectangle path)
 */
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * 卡通粗體字：先畫外框再填色 (chunky text: outline, then fill)
 */
function chunkyText(g, text, x, y, size, fill, outline, outlineWidth, align = 'center') {
  g.font = `${size}px ${TITLE_FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.strokeStyle = outline;
  g.lineWidth = outlineWidth;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/**
 * 依照最大寬度把一句話切成好幾行（以單字為單位）(word-wrap a sentence to a max width)
 * @returns {string[]}
 */
function wrapText(g, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current === '' ? word : `${current} ${word}`;
    if (g.measureText(test).width > maxWidth && current !== '') {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

// ===== 不會動的背景，畫一次存起來 (static backgrounds, drawn once and cached) =====
const layers = {};
let layerScale = 0;

/**
 * 取得某個背景圖層；第一次或畫面倍率改變時才畫 (get a cached background layer)
 * @param {CanvasRenderingContext2D} ctx 主畫布畫筆（用來讀倍率）
 * @param {string} name 'camp' 或 'map'
 * @param {function} drawFunction 畫內容的函式
 * @returns {HTMLCanvasElement}
 */
function getLayer(ctx, name, drawFunction) {
  const scale = Math.min(3, Math.max(1, ctx.getTransform().a));
  if (Math.abs(scale - layerScale) > 0.01) {
    for (const key of Object.keys(layers)) delete layers[key];
    layerScale = scale;
  }
  if (layers[name] === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    drawFunction(g);
    layers[name] = canvas;
  }
  return layers[name];
}

// ----- 夜晚的游擊隊營地 (the guerrilla camp at night) -----

/**
 * 營地背景：夜空、月亮、遠山、叢林剪影、帳篷、無線電、地圖桌、兩個人影 (static parts of the camp)
 */
function drawCampStatic(g) {
  const sky = g.createLinearGradient(0, 0, 0, 260);
  sky.addColorStop(0, '#0b1630');
  sky.addColorStop(0.6, '#1a2a4d');
  sky.addColorStop(1, '#2b3550');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 70; i++) {
    circle(g, hash(i) * W, hash(i + 50) * 190, hash(i + 90) < 0.2 ? 1.4 : 0.8, 'rgba(255, 255, 255, 0.8)');
  }

  // 月亮 + 光暈 (moon with a glow)
  const glow = g.createRadialGradient(730, 70, 0, 730, 70, 110);
  glow.addColorStop(0, 'rgba(240, 240, 210, 0.35)');
  glow.addColorStop(1, 'rgba(240, 240, 210, 0)');
  g.fillStyle = glow;
  g.fillRect(600, 0, 260, 200);
  circle(g, 730, 70, 26, '#f3f0d8');
  circle(g, 721, 64, 6, '#dcd8bd');
  circle(g, 738, 80, 4, '#dcd8bd');

  // 遠山與叢林剪影 (distant hills and jungle silhouette)
  drawRidge(g, 205, 18, 0.013, '#16283d');
  drawRidge(g, 232, 14, 0.031, '#0f2a22');
  for (const [x, h, lean] of [[40, 120, 14], [150, 95, -10], [860, 130, -16], [770, 90, 12], [420, 80, 8]]) {
    drawPalmSilhouette(g, x, 250, h, lean, '#0a1f18');
  }

  // 地面 (ground)
  const ground = g.createLinearGradient(0, 245, 0, H);
  ground.addColorStop(0, '#1b2c1e');
  ground.addColorStop(1, '#0b140d');
  g.fillStyle = ground;
  g.fillRect(0, 245, W, H);

  // 帳篷：正面三角形 + 側面 + 透出暖光的門 (tent: front, side, glowing doorway)
  g.fillStyle = '#3a4728';
  g.beginPath();
  g.moveTo(205, 150); g.lineTo(300, 262); g.lineTo(336, 258); g.lineTo(244, 152);
  g.closePath(); g.fill();
  g.fillStyle = '#4b5a34';
  g.beginPath();
  g.moveTo(110, 262); g.lineTo(205, 150); g.lineTo(300, 262);
  g.closePath(); g.fill();
  g.fillStyle = '#ffb45a';
  g.beginPath();
  g.moveTo(180, 262); g.lineTo(205, 205); g.lineTo(230, 262);
  g.closePath(); g.fill();
  g.strokeStyle = '#2a3320';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(205, 150); g.lineTo(205, 140);
  g.moveTo(110, 262); g.lineTo(80, 272);
  g.moveTo(300, 262); g.lineTo(330, 272);
  g.stroke();

  // 箱子 + 無線電 + 天線 (crate, field radio, antenna)
  g.fillStyle = '#4f5d30';
  g.fillRect(340, 224, 52, 38);
  g.strokeStyle = '#2f381c';
  g.strokeRect(340, 224, 52, 38);
  g.fillStyle = '#2c3138';
  g.fillRect(348, 206, 36, 18);
  circle(g, 358, 215, 4, '#6b737d');
  g.fillStyle = '#9bd36b';
  g.fillRect(366, 211, 12, 6);
  g.strokeStyle = '#2c3138';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(380, 206); g.lineTo(392, 150);
  g.stroke();

  // 營火的木頭和石頭（火焰本身會動，每幀畫）(campfire logs & stones; flames are animated)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    circle(g, 470 + Math.cos(a) * 28, 266 + Math.sin(a) * 8, 6, '#4a4a46');
  }
  g.strokeStyle = '#5a3a1c';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(450, 270); g.lineTo(492, 258);
  g.moveTo(452, 258); g.lineTo(490, 270);
  g.stroke();

  // 地圖桌 + 油燈 (map table with a lantern)
  g.fillStyle = '#5a3a1e';
  g.fillRect(610, 230, 190, 10);
  g.fillRect(620, 240, 8, 24);
  g.fillRect(782, 240, 8, 24);
  g.fillStyle = '#e6d3a3';
  g.fillRect(630, 224, 120, 7);
  g.fillStyle = '#3a3a3a';
  g.fillRect(768, 212, 14, 18);

  // 主角站在無線電旁邊聽命令；指揮官不在這裡，是從無線電講話 (the hero stands by the radio; the commander is only on the radio)
  drawFigure(g, 418, 262, false);
  // 話筒的捲線：從無線電拉到主角耳邊 (handset cord from the radio to the hero's ear)
  g.strokeStyle = '#1b1f24';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(352, 222);
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    g.lineTo(352 + (406 - 352) * t, 222 + (190 - 222) * t + Math.sin(i * 2.4) * 3);
  }
  g.stroke();
  g.fillStyle = '#1b1f24';
  roundRectPath(g, 403, 178, 8, 18, 3);
  g.fill();
}

/**
 * 起伏的山稜線 (a wavy ridge, filled below)
 */
function drawRidge(g, baseY, amplitude, frequency, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    g.lineTo(x, baseY - amplitude * (Math.sin(x * frequency) * 0.6 + Math.sin(x * frequency * 2.3 + 1) * 0.4));
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}

/**
 * 棕櫚樹剪影 (palm tree silhouette)
 */
function drawPalmSilhouette(g, x, y, height, lean, color) {
  const topX = x + lean;
  const topY = y - height;
  g.strokeStyle = color;
  g.lineWidth = height * 0.06;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x - lean * 0.2, y - height * 0.55, topX, topY);
  g.stroke();
  g.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (1.0 + i / 6);
    const length = height * 0.5;
    const tipX = topX + Math.cos(angle) * length;
    const tipY = topY + Math.sin(angle) * length * 0.4 + length * 0.4;
    g.beginPath();
    g.moveTo(topX, topY);
    g.quadraticCurveTo(topX + Math.cos(angle) * length * 0.6, topY + Math.sin(angle) * length * 0.6 - length * 0.2, tipX, tipY);
    g.quadraticCurveTo(topX + Math.cos(angle) * length * 0.5, topY + Math.sin(angle) * length * 0.3, topX, topY + 3);
    g.fill();
  }
}

/**
 * 站著的人影，靠營火那一側有一點火光照亮的邊 (standing silhouette with a firelit rim)
 * @param {boolean} beret true = 指揮官（貝雷帽），false = 主角（頭巾尾巴）
 */
function drawFigure(g, x, y, beret) {
  const dark = '#0a120d';
  g.fillStyle = dark;
  roundRectPath(g, x - 15, y - 62, 30, 46, 10);
  g.fill();
  g.fillRect(x - 12, y - 20, 9, 20);
  g.fillRect(x + 3, y - 20, 9, 20);
  circle(g, x, y - 74, 11, dark);
  if (beret) {
    g.beginPath();
    g.ellipse(x - 3, y - 84, 14, 6, -0.2, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#b52520';
    g.fillRect(x - 11, y - 80, 22, 4);
    g.fillRect(x + 9, y - 79, 9, 3);
  }
  // 面向營火那一側的火光 (warm rim light on the fire side)
  g.strokeStyle = 'rgba(255, 150, 60, 0.55)';
  g.lineWidth = 2;
  const side = x < 470 ? 1 : -1;
  g.beginPath();
  g.moveTo(x + side * 15, y - 56);
  g.lineTo(x + side * 15, y - 20);
  g.stroke();
}

/**
 * 營地會動的部分：營火、火光、火星、無線電燈、螢火蟲 (animated parts: fire, glow, sparks, radio light, fireflies)
 */
function drawCampAnimated(g, time) {
  const flicker = 0.85 + 0.15 * Math.sin(time * 11) * Math.sin(time * 7.3);

  // 火光照亮四周：用 'lighter' 混合模式，顏色會「加亮」底下的畫面 (additive glow lights up the scene)
  g.save();
  g.globalCompositeOperation = 'lighter';
  const light = g.createRadialGradient(470, 250, 0, 470, 250, 260);
  light.addColorStop(0, `rgba(255, 140, 50, ${0.35 * flicker})`);
  light.addColorStop(1, 'rgba(255, 140, 50, 0)');
  g.fillStyle = light;
  g.fillRect(200, 0, 540, H);
  g.restore();

  // 火焰：三層，外紅、中橘、內黃，每層用不同速度擺動 (flames: three layers wobbling at different speeds)
  const flames = [
    { w: 40, h: 56, color: '#ff5a00', speed: 6 },
    { w: 28, h: 42, color: '#ffa000', speed: 8 },
    { w: 14, h: 26, color: '#fff1a8', speed: 11 },
  ];
  for (const f of flames) {
    const wobble = Math.sin(time * f.speed) * 5;
    const height = f.h * (0.9 + 0.1 * Math.sin(time * f.speed * 1.7));
    g.fillStyle = f.color;
    g.beginPath();
    g.moveTo(470 - f.w / 2, 264);
    g.quadraticCurveTo(470 - f.w / 2, 264 - height * 0.5, 470 + wobble, 264 - height);
    g.quadraticCurveTo(470 + f.w / 2, 264 - height * 0.5, 470 + f.w / 2, 264);
    g.closePath();
    g.fill();
  }

  // 火星往上飄 (sparks drifting up)
  for (let i = 0; i < 10; i++) {
    const t = (time * 0.6 + hash(i)) % 1;
    circle(g, 470 + Math.sin(t * 8 + i) * 14 + (hash(i + 3) - 0.5) * 20, 250 - t * 110, 1.4, `rgba(255, 200, 90, ${1 - t})`);
  }

  // 無線電的紅燈一閃一閃 (blinking radio light)
  if (Math.sin(time * 4) > 0) circle(g, 392, 150, 2.5, '#ff4040');

  // 油燈 (lantern glow)
  circle(g, 775, 216, 9, `rgba(255, 210, 120, ${0.35 * flicker})`);
  circle(g, 775, 220, 4, '#ffe9a8');

  // 螢火蟲 (fireflies)
  for (let i = 0; i < 12; i++) {
    if (Math.sin(time * 2.5 + i * 1.7) < 0) continue;
    const x = (hash(i + 200) * W + Math.sin(time * 0.6 + i) * 20 + W) % W;
    const y = 150 + hash(i + 300) * 110 + Math.sin(time * 1.1 + i * 2) * 6;
    circle(g, x, y, 1.6, '#d4ff5a');
  }
}

// ----- 作戰地圖特寫 (battle map close-up) -----

// 地圖上的重要位置（地圖紙內的座標）(key points on the paper map)
const MAP_ORIGIN = { x: 150, y: 34, angle: -0.02 };
const OUR_CAMP = { x: 70, y: 170 };
const OUTPOSTS = [{ x: 250, y: 80 }, { x: 330, y: 190 }, { x: 440, y: 110 }];
const ENEMY_HQ = { x: 545, y: 150 };

/**
 * 地圖特寫的不動部分：木頭桌面、羊皮紙地圖、河流、叢林、標記、油燈的光暈 (static map scene)
 */
function drawMapStatic(g) {
  // 木頭桌面 (wooden table)
  g.fillStyle = '#5a3a1e';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#462c15';
  g.lineWidth = 2;
  for (let y = 0; y < H; y += 52) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  g.strokeStyle = 'rgba(30, 18, 8, 0.25)';
  g.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const y = hash(i) * H;
    g.beginPath(); g.moveTo(hash(i + 1) * W, y); g.lineTo(hash(i + 1) * W + 80, y + 2); g.stroke();
  }
  // 咖啡杯的印子 (a coffee ring stain)
  g.strokeStyle = 'rgba(40, 20, 5, 0.4)';
  g.lineWidth = 4;
  g.beginPath(); g.arc(820, 90, 30, 0, Math.PI * 2); g.stroke();

  g.save();
  g.translate(MAP_ORIGIN.x, MAP_ORIGIN.y);
  g.rotate(MAP_ORIGIN.angle);

  // 羊皮紙 + 邊緣 (parchment with a darker edge)
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillRect(8, 10, 610, 260);
  g.fillStyle = '#e6d3a3';
  g.fillRect(0, 0, 610, 258);
  g.strokeStyle = '#b89b62';
  g.lineWidth = 5;
  g.strokeRect(0, 0, 610, 258);

  // 格線 (grid)
  g.strokeStyle = 'rgba(120, 95, 50, 0.25)';
  g.lineWidth = 1;
  for (let x = 40; x < 610; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 258); g.stroke(); }
  for (let y = 40; y < 258; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(610, y); g.stroke(); }

  // 叢林 (jungle patches)
  for (let i = 0; i < 40; i++) {
    circle(g, 20 + hash(i + 7) * 570, 15 + hash(i + 17) * 230, 10 + hash(i + 27) * 18, 'rgba(110, 160, 90, 0.35)');
  }

  // 河流 (river)
  g.strokeStyle = '#5b9cc8';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(190, 0);
  g.bezierCurveTo(150, 80, 230, 150, 180, 258);
  g.stroke();

  // 我方營地：綠色旗子 (our camp: green flag)
  g.strokeStyle = '#3b2a14';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(OUR_CAMP.x, OUR_CAMP.y); g.lineTo(OUR_CAMP.x, OUR_CAMP.y - 30); g.stroke();
  g.fillStyle = '#2e7d32';
  g.beginPath();
  g.moveTo(OUR_CAMP.x, OUR_CAMP.y - 30); g.lineTo(OUR_CAMP.x + 22, OUR_CAMP.y - 23); g.lineTo(OUR_CAMP.x, OUR_CAMP.y - 16);
  g.closePath(); g.fill();
  chunkyText(g, 'OUR CAMP', OUR_CAMP.x, OUR_CAMP.y + 14, 13, '#2e4a1e', '#e6d3a3', 3);

  // 敵軍前哨站：紅色叉叉 + 「INTEL」(enemy outposts: red X with "INTEL")
  for (const outpost of OUTPOSTS) {
    g.strokeStyle = '#c62828';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(outpost.x - 10, outpost.y - 10); g.lineTo(outpost.x + 10, outpost.y + 10);
    g.moveTo(outpost.x + 10, outpost.y - 10); g.lineTo(outpost.x - 10, outpost.y + 10);
    g.stroke();
    chunkyText(g, 'INTEL', outpost.x, outpost.y + 22, 12, '#8a1c1c', '#e6d3a3', 3);
  }

  // 敵軍司令部：紅圈 + 「HQ」+「HOSTAGES?」(enemy HQ: red circle, "HQ", "HOSTAGES?")
  g.strokeStyle = '#c62828';
  g.lineWidth = 4;
  g.beginPath(); g.arc(ENEMY_HQ.x, ENEMY_HQ.y, 26, 0, Math.PI * 2); g.stroke();
  chunkyText(g, 'HQ', ENEMY_HQ.x, ENEMY_HQ.y, 18, '#8a1c1c', '#e6d3a3', 3);
  chunkyText(g, 'HOSTAGES?', ENEMY_HQ.x, ENEMY_HQ.y + 42, 13, '#8a1c1c', '#e6d3a3', 3);
  g.restore();

  // 紅色圖釘 (red pins)
  for (const [x, y] of [[160, 44], [752, 32], [764, 274], [162, 280]]) {
    circle(g, x + 2, y + 3, 6, 'rgba(0, 0, 0, 0.4)');
    circle(g, x, y, 6, '#d32f2f');
    circle(g, x - 2, y - 2, 2, '#ff8a80');
  }

  // 油燈的光：中間亮、四周暗 (lamp light vignette: bright middle, dark edges)
  const vignette = g.createRadialGradient(W / 2, 150, 120, W / 2, 150, 520);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, W, H);
}

/**
 * 地圖上會動的部分：虛線路線一直往前流、目標一閃一閃 (animated: flowing dashed route, pulsing targets)
 */
function drawMapAnimated(g, time) {
  g.save();
  g.translate(MAP_ORIGIN.x, MAP_ORIGIN.y);
  g.rotate(MAP_ORIGIN.angle);

  // 虛線路線：setLineDash 設定虛線，lineDashOffset 一直變，虛線就會往前流動 (marching dashes)
  g.strokeStyle = '#c62828';
  g.lineWidth = 3;
  g.setLineDash([10, 8]);
  g.lineDashOffset = -time * 30;
  g.beginPath();
  g.moveTo(OUR_CAMP.x + 10, OUR_CAMP.y - 6);
  for (const point of [...OUTPOSTS, ENEMY_HQ]) g.lineTo(point.x, point.y);
  g.stroke();
  g.setLineDash([]);

  // 目標上的脈衝圈 (pulsing rings on the targets)
  const pulse = (time * 1.2) % 1;
  g.strokeStyle = `rgba(198, 40, 40, ${1 - pulse})`;
  g.lineWidth = 2;
  for (const point of [...OUTPOSTS, ENEMY_HQ]) {
    g.beginPath();
    g.arc(point.x, point.y, 12 + pulse * 22, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

// ===== 過場動畫本體 (the cutscene) =====

export class Cutscene {
  constructor() {
    this.index = 0;          // 目前第幾句 (current line)
    this.shownChars = 0;     // 打字機效果：已經顯示幾個字（可以是小數）(typewriter progress)
    this.time = 0;           // 經過秒數，動畫用 (seconds, for animations)
    this.fadeIn = CUTSCENE_FADE_TIME;  // 從黑畫面淡入 (fade in from black)
    this.fadeOut = 0;        // 淡出到黑畫面的倒數 (fade-out countdown)
    this.nextIndex = null;   // 淡出結束後要跳到第幾句 (line to show after the fade-out)
    this.done = false;       // 播完了沒 (finished)
    this.voicedIndex = -1;   // 已經念過第幾句，每句只念一次 (which line has been voiced)
  }

  /**
   * 結束過場動畫：停止說話 (finish: stop the voice)
   */
  finish() {
    stopSpeaking();
    this.done = true;
  }

  /**
   * 每幀更新：打字機、換句、換鏡頭的淡入淡出、跳過 (typewriter, advancing, fades, skipping)
   * @param {number} dt 經過秒數
   * @param {object} input 輸入狀態
   */
  update(dt, input) {
    this.time += dt;
    this.fadeIn = Math.max(0, this.fadeIn - dt);

    // 正在淡出：等黑幕蓋滿再換下一句 (fading out: switch lines once the screen is black)
    if (this.nextIndex !== null) {
      this.fadeOut = Math.max(0, this.fadeOut - dt);
      if (this.fadeOut === 0) {
        if (this.nextIndex >= SCRIPT.length) {
          this.finish();
          return;
        }
        this.index = this.nextIndex;
        this.nextIndex = null;
        this.shownChars = 0;
        this.fadeIn = CUTSCENE_FADE_TIME;
      }
      return;
    }

    // 跳過：按 Esc 或點右上角的 SKIP (skip: Esc or the SKIP button)
    if (input.back || (input.tap !== null && isInside(input.tap, SKIP_BUTTON))) {
      this.finish();
      return;
    }

    const line = SCRIPT[this.index];

    // 指揮官的台詞：一出現就開始念 (commander lines are spoken as soon as they appear)
    const isCommander = line.speaker === 'COMMANDER';
    if (isCommander && this.voicedIndex !== this.index && canSpeak()) {
      speakAsCommander(line.text);
    }
    this.voicedIndex = this.index;

    this.shownChars = Math.min(line.text.length, this.shownChars + CUTSCENE_TEXT_SPEED * dt);


    // 按 Enter / 點一下：字還沒打完就直接顯示全部，打完了就下一句 (confirm: finish the line, or go to the next)
    if (input.confirm) {
      if (this.shownChars < line.text.length) {
        this.shownChars = line.text.length;
      } else {
        this.advance();
      }
    }
  }

  /**
   * 下一句：鏡頭一樣就直接換字，鏡頭不同就先淡出 (next line: instant if same shot, fade if the shot changes)
   */
  advance() {
    stopSpeaking(); // 下一句之前先停止上一句的聲音 (stop the previous line's voice)
    playSound('dialogueNext');
    const next = this.index + 1;
    const sameShot = next < SCRIPT.length && SCRIPT[next].shot === SCRIPT[this.index].shot;
    if (sameShot) {
      this.index = next;
      this.shownChars = 0;
    } else {
      this.nextIndex = next;
      this.fadeOut = CUTSCENE_FADE_TIME;
    }
  }

  /**
   * 畫出目前的鏡頭、對話框、跳過按鈕、淡入淡出黑幕 (draw the shot, dialogue box, skip button and fades)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {boolean} touchMode 是否為觸控模式（提示文字不同）(touch mode changes the hints)
   */
  draw(ctx, touchMode) {
    const line = SCRIPT[this.index];

    if (line.shot === 'title') {
      this.drawTitleCard(ctx, touchMode);
    } else {
      if (line.shot === 'map') {
        ctx.drawImage(getLayer(ctx, 'map', drawMapStatic), 0, 0, W, H);
        drawMapAnimated(ctx, this.time);
      } else {
        ctx.drawImage(getLayer(ctx, 'camp', drawCampStatic), 0, 0, W, H);
        drawCampAnimated(ctx, this.time);
      }

      // 無線電特寫：背景暗下來，中間一台大大的野戰無線電 (radio close-up: darken the camp, big field radio in the middle)
      if (line.shot === 'radio') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, W, H);
        this.drawRadio(ctx, line);
      }

      // 有人說話時，背景暗一點，讓半身像跳出來 (dim the background behind a portrait)
      if (line.shot === 'hero') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, W, H);
        this.drawPortrait(ctx, line);
      }

      // 上方電影黑邊 (cinematic bar at the top)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, BAR_HEIGHT);
      this.drawDialogueBox(ctx, line, touchMode);
      this.drawSkipButton(ctx);
    }

    // 淡入淡出黑幕 (fade overlay)
    let black = this.fadeIn / CUTSCENE_FADE_TIME;
    if (this.nextIndex !== null) black = 1 - this.fadeOut / CUTSCENE_FADE_TIME;
    if (black > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${black})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /**
   * 野戰無線電特寫：收到訊號時燈號、訊號格、喇叭會跟著「說話」跳動，天線輕輕晃
   * (field radio close-up: lights, signal meter and speaker react while the commander talks; the antenna sways)
   */
  drawRadio(ctx, line) {
    const time = this.time;
    const talking = this.shownChars < line.text.length;
    // 說話的音量起伏（假的），用來驅動燈號和訊號格 (a fake speech level to drive the meters)
    const level = talking ? Math.max(0, 0.55 + 0.45 * Math.sin(time * 23) * Math.sin(time * 7.3 + 1)) : 0;
    const x = 236;
    const y = 58;
    const w = 424;
    const h = 206;

    // 天線（底部固定，頂端輕晃）(antenna: fixed base, swaying tip)
    const sway = Math.sin(time * 1.6) * 6;
    ctx.strokeStyle = '#1d2126';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w - 54, y + 6);
    ctx.quadraticCurveTo(x + w - 46 + sway * 0.3, y - 30, x + w - 30 + sway, y - 52);
    ctx.stroke();
    circle(ctx, x + w - 30 + sway, y - 52, 4, '#1d2126');

    // 機身：陰影、軍綠外殼、提把、四角螺絲 (body: shadow, olive case, handle, corner bolts)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    roundRectPath(ctx, x + 8, y + 12, w, h, 18);
    ctx.fill();
    ctx.fillStyle = '#55622f';
    roundRectPath(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = '#26301a';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#66753a';
    roundRectPath(ctx, x + 6, y + 6, w - 12, 18, 9);
    ctx.fill();
    ctx.strokeStyle = '#26301a';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 120, y + 2);
    ctx.lineTo(x + 130, y - 16);
    ctx.lineTo(x + 210, y - 16);
    ctx.lineTo(x + 220, y + 2);
    ctx.stroke();
    for (const [bx, by] of [[x + 16, y + 16], [x + w - 16, y + 16], [x + 16, y + h - 16], [x + w - 16, y + h - 16]]) {
      circle(ctx, bx, by, 5, '#3b4524');
      circle(ctx, bx - 1, by - 1, 2, '#8a9a55');
    }

    // 前面板 (front panel)
    ctx.fillStyle = '#2d3420';
    roundRectPath(ctx, x + 26, y + 34, w - 52, h - 58, 10);
    ctx.fill();

    // 喇叭：說話時會微微放大 (speaker grille pulses while talking)
    const speakerX = x + 100;
    const speakerY = y + 112;
    const pulse = 1 + level * 0.05;
    circle(ctx, speakerX, speakerY, 58 * pulse, '#1a1e14');
    circle(ctx, speakerX, speakerY, 52 * pulse, '#232a1a');
    ctx.fillStyle = '#0c0f0a';
    for (let row = -4; row <= 4; row++) {
      for (let col = -4; col <= 4; col++) {
        if (row * row + col * col > 18) continue;
        circle(ctx, speakerX + col * 11 * pulse, speakerY + row * 11 * pulse, 3, '#0c0f0a');
      }
    }

    // 頻率顯示器：綠色螢幕、會閃的掃描線 (frequency display: green screen with flickering scanlines)
    const screenX = x + 190;
    const screenY = y + 52;
    ctx.fillStyle = '#0d2412';
    roundRectPath(ctx, screenX, screenY, 190, 54, 6);
    ctx.fill();
    ctx.strokeStyle = '#141a10';
    ctx.lineWidth = 3;
    ctx.stroke();
    const flicker = 0.85 + 0.15 * Math.sin(time * 40);
    ctx.fillStyle = `rgba(140, 255, 120, ${flicker})`;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('41.250 MHz', screenX + 14, screenY + 22);
    ctx.font = 'bold 12px monospace';
    ctx.fillText(talking ? 'CH 07  ◀ RX' : 'CH 07  STBY', screenX + 14, screenY + 43);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    for (let i = 0; i < 54; i += 3) {
      ctx.fillRect(screenX, screenY + i, 190, 1);
    }

    // 訊號格：五格，跟著說話的音量跳 (signal meter: five bars bouncing with the voice)
    const meterX = screenX;
    const meterY = y + 150;
    for (let i = 0; i < 5; i++) {
      const lit = level * 5 > i;
      ctx.fillStyle = lit ? (i < 3 ? '#9cff57' : i < 4 ? '#ffd23f' : '#ff5a3c') : '#1c2214';
      ctx.fillRect(meterX + i * 22, meterY - i * 5, 16, 14 + i * 5);
    }

    // 旋鈕兩顆 (two knobs)
    for (const [kx, ky, angle] of [[x + w - 92, y + 140, time * 0.2], [x + w - 48, y + 140, -0.8]]) {
      circle(ctx, kx, ky, 17, '#15181c');
      circle(ctx, kx, ky, 13, '#2a2f35');
      ctx.strokeStyle = '#d9d9d9';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(kx + Math.cos(angle - Math.PI / 2) * 11, ky + Math.sin(angle - Math.PI / 2) * 11);
      ctx.stroke();
    }

    // 收訊燈：收到訊號是綠色，沒訊號時慢慢閃紅燈 (RX light: green while receiving, slow red blink on standby)
    const ledColor = talking ? (level > 0.3 ? '#7dff5a' : '#2f6b23') : (Math.sin(time * 3) > 0 ? '#ff4040' : '#5a1a1a');
    circle(ctx, x + w - 70, y + 70, 7, '#111');
    circle(ctx, x + w - 70, y + 70, 5, ledColor);
    if (talking && level > 0.3) {
      circle(ctx, x + w - 70, y + 70, 12, 'rgba(125, 255, 90, 0.25)');
    }

    // 收到訊號時，喇叭旁邊冒出聲波弧線 (sound-wave arcs next to the speaker while receiving)
    if (talking) {
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const phase = (time * 2.2 + i / 3) % 1;
        ctx.strokeStyle = `rgba(200, 255, 170, ${(1 - phase) * 0.6 * (0.4 + level * 0.6)})`;
        ctx.beginPath();
        ctx.arc(speakerX, speakerY, 64 + phase * 46, Math.PI * 0.75, Math.PI * 1.25);
        ctx.stroke();
      }
    }

    // 側面的模板字 (stenciled label)
    chunkyText(ctx, 'FIELD RADIO', x + w / 2 + 40, y + h - 12, 13, '#a9b77a', '#26301a', 3);
  }

  /**
   * 主角半身像（在右邊）；說話時（字還在打）會輕輕上下動 (hero portrait on the right; bobs while talking)
   */
  drawPortrait(ctx, line) {
    const isCommander = false;
    const image = getImage('portrait_hero');
    const size = 300;
    const talking = this.shownChars < line.text.length;
    const bob = talking ? Math.sin(this.time * 14) * 1.5 : 0;
    const x = isCommander ? 40 : W - 40 - size;
    const y = BOX.y - size + 40 + bob;
    if (image !== null) {
      ctx.drawImage(image, x, y, size, size);
      return;
    }
    // 沒有圖片：一個簡單的人形剪影 (fallback: a simple bust silhouette)
    ctx.fillStyle = isCommander ? '#4e5d35' : '#b59a62';
    ctx.beginPath();
    ctx.ellipse(x + size / 2, y + size, size / 2, size / 3, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, x + size / 2, y + size * 0.47, size * 0.2, '#c98a5c');
  }

  /**
   * 對話框：名字標籤 + 自動換行的台詞（打字機效果）+ 右下角的提示 (dialogue box with name tag, typewriter text, hint)
   */
  drawDialogueBox(ctx, line, touchMode) {
    ctx.fillStyle = 'rgba(8, 20, 14, 0.9)';
    roundRectPath(ctx, BOX.x, BOX.y, BOX.w, BOX.h, 14);
    ctx.fill();
    ctx.strokeStyle = '#9ccc65';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (line.speaker !== null) {
      const color = SPEAKER_COLORS[line.speaker] ?? '#ffffff';
      ctx.font = `16px ${TITLE_FONT}`;
      // 從無線電講話的，名字後面加上「RADIO」(add a RADIO label when the speaker is on the radio)
      const label = line.shot === 'radio' || line.shot === 'map' ? `${line.speaker} · RADIO` : line.speaker;
      const tagWidth = ctx.measureText(label).width + 28;
      const tagX = line.shot === 'hero' ? BOX.x + BOX.w - tagWidth - 20 : BOX.x + 20;
      ctx.fillStyle = '#0b1e14';
      roundRectPath(ctx, tagX, BOX.y - 14, tagWidth, 26, 13);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
      chunkyText(ctx, label, tagX + tagWidth / 2, BOX.y - 1, 16, color, '#0b1e14', 3);
    }

    // 先用完整的句子決定怎麼換行，再只畫出「已經打出來」的字，字才不會打到一半跳行 (wrap the full line first so words don't jump)
    ctx.font = `19px ${TITLE_FONT}`;
    const lines = wrapText(ctx, line.text, BOX.w - 60);
    let remaining = Math.floor(this.shownChars);
    const narrator = line.speaker === null;
    ctx.fillStyle = narrator ? '#c5e1a5' : '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length && remaining > 0; i++) {
      const visible = lines[i].slice(0, remaining);
      ctx.fillText(visible, BOX.x + 30, BOX.y + 22 + i * 26);
      remaining -= lines[i].length + 1; // +1 是換行時拿掉的空白 (the space removed at the wrap)
    }

    // 字打完了才出現閃爍的「下一句」提示 (blinking "next" hint once the line is complete)
    if (this.shownChars >= line.text.length && Math.sin(this.time * 6) > 0) {
      chunkyText(ctx, touchMode ? 'Tap ▶' : 'Enter ▶', BOX.x + BOX.w - 18, BOX.y + BOX.h - 16, 13, '#9ccc65', '#0b1e14', 3, 'right');
    }
  }

  /**
   * 右上角的「跳過」按鈕 (skip button, top-right)
   */
  drawSkipButton(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundRectPath(ctx, SKIP_BUTTON.x, SKIP_BUTTON.y, SKIP_BUTTON.w, SKIP_BUTTON.h, 15);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    chunkyText(ctx, 'SKIP ▶▶', SKIP_BUTTON.x + SKIP_BUTTON.w / 2, SKIP_BUTTON.y + SKIP_BUTTON.h / 2 + 1, 14, '#ffffff', '#000000', 3);
  }

  /**
   * 任務標題卡：行動名稱 + 三個任務目標 + 開始提示 (mission title card)
   */
  drawTitleCard(ctx, touchMode) {
    ctx.fillStyle = '#050a07';
    ctx.fillRect(0, 0, W, H);
    drawRidge(ctx, H - 30, 14, 0.02, '#0d1f16');

    chunkyText(ctx, 'OPERATION', W / 2, 74, 22, '#9ccc65', '#000000', 4);
    const gradient = ctx.createLinearGradient(0, 100, 0, 150);
    gradient.addColorStop(0, '#fff27a');
    gradient.addColorStop(1, '#ff9d00');
    chunkyText(ctx, 'JUNGLE STORM', W / 2, 124, 56, gradient, '#1a0e00', 10);

    const objectives = [
      'Sneak into the invaders’ outposts and steal the intel',
      'Defeat their field commanders',
      'Rescue the hostages and get to the extraction truck',
    ];
    for (let i = 0; i < objectives.length; i++) {
      chunkyText(ctx, `★  ${objectives[i]}`, W / 2, 196 + i * 34, 20, '#ffffff', '#000000', 4);
    }
    if (Math.sin(this.time * 5) > 0) {
      chunkyText(ctx, touchMode ? 'Tap to begin' : 'Press Enter to begin', W / 2, 340, 24, '#ffd23f', '#000000', 5);
    }
  }
}

/**
 * 某個點是否在矩形裡 (is the point inside the rectangle)
 */
function isInside(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}
