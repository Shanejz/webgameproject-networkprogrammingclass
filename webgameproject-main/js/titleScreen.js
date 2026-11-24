import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GAME_TITLE,
  GAME_TAGLINE,
  TITLE_FONT,
  MENU_BLINK_PERIOD,
} from './config.js';

// 歡迎畫面：明亮的卡通風叢林戰場 (welcome screen: bright cartoon jungle battlefield)
//
// 畫面內容：游擊隊從前景的叢林小路往前推進，攻打山丘上的軍隊基地（瞭望塔、碉堡、砲塔、司令部）。
// 基地一直被炸、冒煙，雙方互射曳光彈，天上有信號彈拖著煙飛過。
//
// 效能小技巧：不會動的東西（天空、山、基地、地面、樹）只在第一次畫進兩張「圖層」畫布 (layer canvas)，
// 之後每一幀直接貼上去；每一幀真正重畫的只有雲、爆炸、煙、子彈、隊員這些會動的東西。
//
// 這個檔案的座標都是畫面上的位置（896×416 的邏輯座標），只用在這張圖，不是遊戲數值，所以寫在這裡。

const W = GAME_WIDTH;   // 896
const H = GAME_HEIGHT;  // 416

// ----- 場景中重要物件的位置 (key positions in the scene) -----
const HQ_X = 470;             // 司令部 (headquarters)
const HQ_Y = 152;
const FLAG_POLE_X = 528;      // 旗桿，立在司令部右邊 (flag pole, beside the HQ)
const FLAG_TOP_Y = 100;
const TOWER_X = 330;          // 瞭望塔 (watchtower)
const BUNKER_X = 470;         // 碉堡 (bunker)
const TURRET_X = 620;         // 砲塔 (gun turret)
const BASE_GROUND_Y = 230;    // 基地前排建築站的高度 (ground line of the lower base)
const SANDBAG_TOP_Y = 236;    // 沙包牆頂端 (top of the sandbag wall)

// 爆炸會輪流出現的位置 (where explosions happen, in turn)
const BLAST_POINTS = [
  { x: 330, y: 168 },
  { x: 560, y: 140 },
  { x: 470, y: 205 },
  { x: 640, y: 214 },
  { x: 405, y: 236 },
];

// 一直冒煙的地方 (places that keep smoking)
const SMOKE_POINTS = [
  { x: 420, y: 140, seed: 0.1 },
  { x: 610, y: 205, seed: 0.55 },
];

// 敵兵從沙包後面探頭的位置 (where enemy soldiers peek over the sandbags)
const ENEMY_PEEK_X = [325, 388, 548, 600];

// 我方隊員：x、腳的 y、大小、是否蹲著、動畫相位 (our squad: position, scale, crouching, animation phase)
const SQUAD = [
  { x: 448, y: 396, scale: 0.85, crouch: true, phase: 1.3 },
  { x: 372, y: 414, scale: 1.08, crouch: false, phase: 0 },
  { x: 540, y: 412, scale: 1.02, crouch: false, phase: 2.1 },
];

// 雲：起始 x、y、大小、飄的速度 (clouds: start x, y, size, drift speed)
const CLOUDS = [
  { x: 40, y: 70, s: 1.1, speed: 6 },
  { x: 330, y: 40, s: 0.8, speed: 9 },
  { x: 640, y: 80, s: 1.3, speed: 5 },
  { x: 880, y: 35, s: 0.7, speed: 8 },
];

// ===== 小工具 (helpers) =====

/**
 * 假的隨機數：同一個 n 永遠得到同一個 0~1 的數字，所以每次畫出來的樹都在同一個位置 (repeatable pseudo-random)
 * @param {number} n 種子 (seed)
 * @returns {number} 0 ~ 1
 */
function hash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 讓數字在 0 ~ period 之間循環，負數也可以 (wrap into 0..period)
 * @param {number} x
 * @param {number} period
 * @returns {number}
 */
function wrap(x, period) {
  return ((x % period) + period) % period;
}

/**
 * 畫圓角矩形的路徑（自己寫，舊瀏覽器沒有 ctx.roundRect）(rounded-rectangle path)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} x 左上 x
 * @param {number} y 左上 y
 * @param {number} w 寬
 * @param {number} h 高
 * @param {number} r 圓角半徑
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
 * 畫一個實心圓 (filled circle)
 */
function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/**
 * 畫一個實心橢圓 (filled ellipse)
 */
function ellipse(g, x, y, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/**
 * 畫一條粗線，兩端是圓的 (thick line with round ends)
 */
function thickLine(g, x0, y0, x1, y1, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

// ===== 圖層快取 (layer cache) =====
// 圖層的解析度要跟主畫布一樣細，才不會糊；主畫布的倍率可以從畫筆目前的 transform 讀到。
let backLayer = null;   // 天空 + 遠山 (sky + distant hills)
let frontLayer = null;  // 山丘、基地、地面、樹、前景葉子 (hill, base, ground, trees, foreground leaves)
let layerScale = 0;

/**
 * 確認圖層已經畫好；第一次、或畫面倍率改變（例如視窗縮放）才重畫 (build layers when needed)
 * @param {CanvasRenderingContext2D} ctx 主畫布的畫筆
 */
function ensureLayers(ctx) {
  // getTransform().a = 目前水平方向的放大倍率，也就是 main.js 設定的 renderScale (current render scale)
  const scale = Math.min(3, Math.max(1, ctx.getTransform().a));
  if (backLayer !== null && Math.abs(scale - layerScale) < 0.01) return;

  layerScale = scale;
  backLayer = makeLayer(scale, drawBackScenery);
  frontLayer = makeLayer(scale, drawFrontScenery);
}

/**
 * 建立一張圖層畫布，用邏輯座標畫好內容 (create a layer canvas and draw into it)
 * @param {number} scale 解析度倍率
 * @param {function} drawFunction 負責畫內容的函式 (function that draws the content)
 * @returns {HTMLCanvasElement}
 */
function makeLayer(scale, drawFunction) {
  const layer = document.createElement('canvas');
  layer.width = Math.round(W * scale);
  layer.height = Math.round(H * scale);
  const g = layer.getContext('2d');
  g.scale(scale, scale); // 之後都用 896×416 的座標畫 (draw in logical coordinates)
  drawFunction(g);
  return layer;
}

// ===== 背景圖層：天空與遠山 (back layer: sky & distant hills) =====

/**
 * 畫天空漸層、太陽光暈、兩層遠山 (sky gradient, sun glow, two distant ridges)
 * @param {CanvasRenderingContext2D} g 圖層畫筆
 */
function drawBackScenery(g) {
  const sky = g.createLinearGradient(0, 0, 0, 260);
  sky.addColorStop(0, '#1f7fd6');
  sky.addColorStop(0.6, '#5fb4f0');
  sky.addColorStop(1, '#c4eaff');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // 右上角的太陽光暈 (sun glow in the top-right)
  const sun = g.createRadialGradient(790, 30, 0, 790, 30, 160);
  sun.addColorStop(0, 'rgba(255, 255, 230, 0.9)');
  sun.addColorStop(0.2, 'rgba(255, 250, 210, 0.45)');
  sun.addColorStop(1, 'rgba(255, 250, 210, 0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);

  drawRidge(g, 232, 26, 0.012, '#93c6d8');   // 最遠的藍色山 (far blue mountains)
  drawRidge(g, 246, 16, 0.021, '#6fb39a');   // 比較近的綠色丘陵 (nearer green hills)
}

/**
 * 用兩個正弦波疊出起伏的山稜線，下面填滿 (ridge line from two sine waves, filled below)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} baseY 平均高度 (average height)
 * @param {number} amplitude 起伏大小 (how bumpy)
 * @param {number} frequency 起伏的密度 (how frequent the bumps are)
 * @param {string} color 顏色
 */
function drawRidge(g, baseY, amplitude, frequency, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const y = baseY - amplitude * (Math.sin(x * frequency) * 0.6 + Math.sin(x * frequency * 2.7 + 1) * 0.4);
    g.lineTo(x, y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}

// ===== 前景圖層：山丘、基地、地面、叢林 (front layer: hill, base, ground, jungle) =====

/**
 * 依照「由遠到近」的順序畫，後畫的會蓋住先畫的 (painter's order: far to near)
 * @param {CanvasRenderingContext2D} g 圖層畫筆
 */
function drawFrontScenery(g) {
  drawHill(g);
  drawHillTrees(g);
  drawTerraces(g);
  drawHeadquarters(g);
  drawWatchtower(g);
  drawBunker(g);
  drawTurret(g);
  drawSandbags(g);
  drawGround(g);
  drawSideJungle(g, -30, 250, 0);
  drawSideJungle(g, 650, 930, 500);
  drawForegroundLeaves(g);
}

/**
 * 山丘本體 + 岩壁 (the hill and its rock faces)
 */
function drawHill(g) {
  const hill = g.createLinearGradient(0, 100, 0, 280);
  hill.addColorStop(0, '#5fc24e');
  hill.addColorStop(1, '#2e8735');
  g.fillStyle = hill;
  g.beginPath();
  g.moveTo(160, 290);
  g.bezierCurveTo(250, 190, 360, 108, 470, 104);
  g.bezierCurveTo(585, 100, 700, 180, 790, 290);
  g.closePath();
  g.fill();

  // 岩壁：亮面 + 暗面兩塊多邊形 (rock faces: lit side + shaded side)
  drawRock(g, [[268, 248], [300, 182], [345, 160], [338, 214]], '#b59d78', '#8e7756');
  drawRock(g, [[640, 168], [690, 190], [722, 252], [668, 246]], '#b59d78', '#8e7756');
  drawRock(g, [[520, 108], [555, 112], [548, 130], [515, 126]], '#b59d78', '#8e7756');
}

/**
 * 畫一塊岩石：先畫整塊亮色，再在右半邊疊暗色 (a rock: lit fill, then shade on the right half)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number[][]} points 多邊形頂點 (polygon points)
 * @param {string} light 亮面顏色
 * @param {string} dark 暗面顏色
 */
function drawRock(g, points, light, dark) {
  g.fillStyle = light;
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points) g.lineTo(x, y);
  g.closePath();
  g.fill();

  // 暗面：第 2 個點到第 3 個點那一邊往內縮 (shade along the right edge)
  const [x1, y1] = points[1];
  const [x2, y2] = points[2];
  const [x3, y3] = points[3];
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.lineTo((x1 + x3) / 2 + 6, (y1 + y3) / 2);
  g.closePath();
  g.fill();
}

/**
 * 一棵卡通樹冠：暗色底 + 中間色 + 左上的亮面，看起來圓滾滾的 (cartoon tree crown with 3 tones)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} x 中心 x
 * @param {number} y 中心 y
 * @param {number} r 半徑
 * @param {number} variant 0~1，決定顏色深淺 (color variant)
 */
function drawTreeCrown(g, x, y, r, variant) {
  const palettes = [
    ['#1f6b2c', '#2f9a3a', '#6ed15a'],
    ['#1b5e2a', '#278a37', '#57bf4c'],
    ['#24703a', '#36a24a', '#7fdc6a'],
  ];
  const [dark, mid, light] = palettes[Math.floor(variant * palettes.length)];
  circle(g, x + r * 0.1, y + r * 0.15, r, dark);
  circle(g, x - r * 0.05, y - r * 0.02, r * 0.9, mid);
  circle(g, x - r * 0.3, y - r * 0.32, r * 0.45, light);
}

/**
 * 一棵棕櫚樹：彎曲的樹幹 + 幾片下垂的葉子 (palm tree: curved trunk + drooping fronds)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} x 樹根 x
 * @param {number} y 樹根 y
 * @param {number} height 樹高
 * @param {number} lean 樹頂往右偏多少 (how far the top leans)
 */
function drawPalm(g, x, y, height, lean) {
  const topX = x + lean;
  const topY = y - height;

  // 樹幹：一條粗的二次曲線，再畫幾道橫紋 (trunk: thick curve with ring marks)
  g.strokeStyle = '#8a5a2e';
  g.lineWidth = height * 0.07;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x - lean * 0.2, y - height * 0.55, topX, topY);
  g.stroke();
  g.strokeStyle = '#6b4220';
  g.lineWidth = 1.5;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    // 二次曲線上的點：(1-t)²P0 + 2(1-t)t P1 + t² P2 (point on a quadratic curve)
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x - lean * 0.2) + t * t * topX;
    const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y - height * 0.55) + t * t * topY;
    g.beginPath();
    g.moveTo(px - height * 0.035, py);
    g.lineTo(px + height * 0.035, py);
    g.stroke();
  }

  // 葉子：從樹頂往外，尖端下垂 (fronds radiate from the top and droop)
  const leafLength = height * 0.55;
  for (let i = 0; i < 7; i++) {
    const angle = Math.PI * (1.0 + i * (1.0 / 6));       // 從左邊掃到右邊 (sweep from left to right)
    const tipX = topX + Math.cos(angle) * leafLength;
    const tipY = topY + Math.sin(angle) * leafLength * 0.45 + leafLength * 0.35;
    const ctrlX = topX + Math.cos(angle) * leafLength * 0.6;
    const ctrlY = topY + Math.sin(angle) * leafLength * 0.6 - leafLength * 0.1;
    g.fillStyle = i % 2 === 0 ? '#2f9a3a' : '#3fb14a';
    g.beginPath();
    g.moveTo(topX, topY);
    g.quadraticCurveTo(ctrlX, ctrlY - leafLength * 0.12, tipX, tipY);
    g.quadraticCurveTo(ctrlX, ctrlY + leafLength * 0.1, topX, topY + 2);
    g.fill();
  }
  circle(g, topX, topY, height * 0.05, '#6b4220'); // 椰子 (coconuts)
}

/**
 * 山坡上的樹：隨機撒，但避開基地的位置，由上往下排序後再畫，下面的樹才會蓋住上面的 (trees on the slope)
 */
function drawHillTrees(g) {
  const trees = [];
  for (let i = 0; i < 90; i++) {
    const x = 190 + hash(i) * 580;
    const y = 112 + hash(i + 99) * 150;
    // 山頂的大概高度：以 x=470 為中心的拋物線 (approximate hill top as a parabola)
    const hillTop = 104 + ((x - 470) / 300) * ((x - 470) / 300) * 190;
    if (y < hillTop + 10) continue;
    if (isInsideBaseArea(x, y)) continue;
    trees.push({ x, y, r: 10 + hash(i + 7) * 12, variant: hash(i + 13) });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const tree of trees) {
    drawTreeCrown(g, tree.x, tree.y, tree.r, tree.variant);
  }
  drawPalm(g, 392, 150, 52, -10);
  drawPalm(g, 575, 146, 48, 12);
  drawPalm(g, 262, 232, 60, -14);
  drawPalm(g, 700, 232, 56, 14);
}

/**
 * 這個點是不是在基地範圍內，是的話不種樹 (is this point inside the base, keep it clear of trees)
 * @returns {boolean}
 */
function isInsideBaseArea(x, y) {
  const inUpperTerrace = Math.abs(x - HQ_X) < 100 && y > 95 && y < 175;
  const inLowerTerrace = x > 285 && x < 670 && y > 175;
  return inUpperTerrace || inLowerTerrace;
}

/**
 * 基地的兩層平台：上層放司令部，下層放瞭望塔、碉堡、砲塔 (two flattened terraces for the base)
 */
function drawTerraces(g) {
  ellipse(g, HQ_X, HQ_Y + 4, 90, 18, '#9e8960');
  ellipse(g, HQ_X, HQ_Y, 88, 16, '#d2bb8a');
  ellipse(g, 475, BASE_GROUND_Y + 6, 205, 28, '#9e8960');
  ellipse(g, 475, BASE_GROUND_Y + 2, 202, 25, '#d2bb8a');
}

/**
 * 司令部：水泥建築、深色屋頂、紅色條紋、雷達天線；旗子會動，所以在每一幀畫 (headquarters)
 */
function drawHeadquarters(g) {
  const left = HQ_X - 40;
  const top = HQ_Y - 40;
  // 牆面：正面亮、右側暗 (front wall lit, side wall shaded)
  g.fillStyle = '#e3ddcf';
  g.fillRect(left, top, 64, 40);
  g.fillStyle = '#bdb5a3';
  g.fillRect(left + 64, top, 16, 40);
  // 紅色條紋 = 敵軍陣營色 (red stripe = enemy faction color)
  g.fillStyle = '#d63a3a';
  g.fillRect(left, top + 12, 80, 5);
  // 窗戶與門 (windows & door)
  g.fillStyle = '#2d3640';
  g.fillRect(left + 8, top + 22, 12, 7);
  g.fillRect(left + 44, top + 22, 12, 7);
  g.fillRect(left + 26, top + 22, 12, 18);
  // 屋頂 (roof)
  g.fillStyle = '#4e5965';
  g.beginPath();
  g.moveTo(left - 6, top + 2);
  g.lineTo(left + 86, top + 2);
  g.lineTo(left + 80, top - 8);
  g.lineTo(left, top - 8);
  g.closePath();
  g.fill();
  // 雷達天線：碟子 + 支架 (radar dish on the roof)
  thickLine(g, left + 14, top - 8, left + 14, top - 12, 3, '#5d6670');
  g.fillStyle = '#c9ced4';
  g.beginPath();
  g.ellipse(left + 14, top - 15, 11, 5, -0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#7a838c';
  g.lineWidth = 1.5;
  g.stroke();
  // 旗桿（旗子本身每一幀畫，才能飄）(flag pole; the flag is animated per frame)
  thickLine(g, FLAG_POLE_X, HQ_Y - 2, FLAG_POLE_X, FLAG_TOP_Y, 2.5, '#4a4f55');
  circle(g, FLAG_POLE_X, FLAG_TOP_Y, 3, '#ffd23f');
}

/**
 * 瞭望塔：木頭腳架、平台、紅色屋頂 (wooden watchtower with red roof)
 */
function drawWatchtower(g) {
  const x = TOWER_X;
  const bottom = BASE_GROUND_Y;
  const platformY = bottom - 70;
  // 四隻腳（畫兩隻前腳、兩隻後腳）(legs)
  thickLine(g, x - 20, bottom, x - 13, platformY, 4, '#6b4220');
  thickLine(g, x + 20, bottom, x + 13, platformY, 4, '#6b4220');
  thickLine(g, x - 9, bottom - 2, x - 6, platformY, 3, '#5a3818');
  thickLine(g, x + 9, bottom - 2, x + 6, platformY, 3, '#5a3818');
  // 交叉支撐 (cross braces)
  thickLine(g, x - 18, bottom - 10, x + 16, platformY + 22, 2, '#8a5a2e');
  thickLine(g, x + 18, bottom - 10, x - 16, platformY + 22, 2, '#8a5a2e');
  thickLine(g, x - 16, platformY + 28, x + 16, platformY + 28, 2, '#8a5a2e');
  // 平台與木板牆 (platform & plank walls)
  g.fillStyle = '#a0703d';
  g.fillRect(x - 22, platformY - 18, 44, 20);
  g.strokeStyle = '#7a5129';
  g.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(x - 22, platformY - 18 + i * 5);
    g.lineTo(x + 22, platformY - 18 + i * 5);
    g.stroke();
  }
  // 屋頂 (roof)
  g.fillStyle = '#c0392b';
  g.beginPath();
  g.moveTo(x - 28, platformY - 18);
  g.lineTo(x, platformY - 40);
  g.lineTo(x + 28, platformY - 18);
  g.closePath();
  g.fill();
  g.fillStyle = '#922b21';
  g.beginPath();
  g.moveTo(x, platformY - 40);
  g.lineTo(x + 28, platformY - 18);
  g.lineTo(x + 6, platformY - 18);
  g.closePath();
  g.fill();
}

/**
 * 碉堡：半圓形水泥圓頂 + 射擊口 + 朝我方的大砲 (concrete bunker with a cannon aimed at us)
 */
function drawBunker(g) {
  const x = BUNKER_X;
  const y = BASE_GROUND_Y;
  const dome = g.createLinearGradient(0, y - 40, 0, y);
  dome.addColorStop(0, '#d8d5cc');
  dome.addColorStop(1, '#8f8c84');
  g.fillStyle = dome;
  g.beginPath();
  g.arc(x, y, 40, Math.PI, 0);
  g.closePath();
  g.fill();
  // 紅色陣營標誌 (red faction emblem)
  circle(g, x + 18, y - 26, 6, '#d63a3a');
  circle(g, x + 18, y - 26, 2.5, '#ffffff');
  // 射擊口 (gun slit)
  g.fillStyle = '#2a2f35';
  g.fillRect(x - 22, y - 18, 44, 6);
  // 砲管：從圓頂往左下方伸出來 (cannon barrel pointing down-left, toward the player)
  thickLine(g, x - 4, y - 12, x - 38, y + 4, 10, '#3b4148');
  thickLine(g, x - 34, y + 2, x - 42, y + 6, 13, '#2a2f35');
}

/**
 * 小砲塔：圓形底座 + 雙管機槍 (small turret with twin barrels)
 */
function drawTurret(g) {
  const x = TURRET_X;
  const y = BASE_GROUND_Y;
  ellipse(g, x, y - 2, 24, 8, '#7d8088');
  g.fillStyle = '#5c6068';
  roundRectPath(g, x - 15, y - 26, 30, 22, 6);
  g.fill();
  circle(g, x - 6, y - 18, 3, '#d63a3a');
  thickLine(g, x - 12, y - 18, x - 40, y - 10, 4, '#2a2f35');
  thickLine(g, x - 12, y - 12, x - 40, y - 4, 4, '#2a2f35');
}

/**
 * 沙包牆：兩排橢圓，上排和下排錯開半個沙包 (sandbag wall: two staggered rows)
 */
function drawSandbags(g) {
  for (let row = 0; row < 2; row++) {
    const y = SANDBAG_TOP_Y + 13 - row * 8;
    const offset = row * 11;
    for (let x = 292 + offset; x < 660; x += 22) {
      g.fillStyle = row === 0 ? '#cdb37b' : '#dcc48e';
      g.beginPath();
      g.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#9c8456';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
}

/**
 * 地面：草地、通往基地的泥土路、彈坑、反坦克拒馬 (ground: grass, dirt path, craters, tank traps)
 */
function drawGround(g) {
  // 草地，上緣稍微起伏 (grass with a slightly wavy top edge)
  const grass = g.createLinearGradient(0, 250, 0, H);
  grass.addColorStop(0, '#86d35a');
  grass.addColorStop(1, '#3f9a3a');
  g.fillStyle = grass;
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(0, 262);
  for (let x = 0; x <= W; x += 32) {
    g.quadraticCurveTo(x + 16, 256 + (x % 64 === 0 ? -4 : 4), x + 32, 262);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();

  // 草地上深一點的斑塊，讓地面不會太平 (darker patches for texture)
  for (let i = 0; i < 26; i++) {
    const x = hash(i + 500) * W;
    const y = 275 + hash(i + 600) * 130;
    ellipse(g, x, y, 18 + hash(i) * 26, 4 + hash(i + 1) * 4, 'rgba(46, 125, 50, 0.35)');
  }

  // 泥土路：從基地一路變寬到畫面下方（透視）(dirt path widening toward the viewer: perspective)
  const dirt = g.createLinearGradient(0, 256, 0, H);
  dirt.addColorStop(0, '#e8d29a');
  dirt.addColorStop(1, '#d4b073');
  g.fillStyle = dirt;
  g.beginPath();
  g.moveTo(448, 258);
  g.lineTo(504, 258);
  g.quadraticCurveTo(560, 330, 670, H);
  g.lineTo(250, H);
  g.quadraticCurveTo(380, 330, 448, 258);
  g.closePath();
  g.fill();
  // 車輪痕 (tyre ruts)
  g.strokeStyle = 'rgba(150, 110, 60, 0.45)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(462, 262);
  g.quadraticCurveTo(420, 340, 380, H);
  g.moveTo(490, 262);
  g.quadraticCurveTo(530, 340, 560, H);
  g.stroke();

  // 彈坑 (craters)
  drawCrater(g, 300, 300, 30);
  drawCrater(g, 650, 318, 36);
  drawCrater(g, 575, 278, 20);

  // 反坦克拒馬：三根鐵條交叉 (tank traps: three crossed steel beams)
  drawTankTrap(g, 352, 276, 1);
  drawTankTrap(g, 606, 272, 1);
  drawTankTrap(g, 228, 316, 1.3);
}

/**
 * 彈坑：深色凹洞 + 亮色邊緣 (crater: dark hole with a lit rim)
 */
function drawCrater(g, x, y, r) {
  ellipse(g, x, y, r, r * 0.3, '#a5894f');
  ellipse(g, x, y + 1, r * 0.8, r * 0.22, '#6b5a3a');
}

/**
 * 反坦克拒馬 (czech hedgehog tank trap)
 */
function drawTankTrap(g, x, y, s) {
  thickLine(g, x - 12 * s, y + 6 * s, x + 12 * s, y - 12 * s, 4 * s, '#4f565e');
  thickLine(g, x + 12 * s, y + 6 * s, x - 12 * s, y - 12 * s, 4 * s, '#636b74');
  thickLine(g, x, y + 8 * s, x, y - 14 * s, 4 * s, '#3e444a');
}

/**
 * 畫面左右兩側的叢林樹叢 (jungle clumps on the left/right edge)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} fromX 範圍左邊 (left of the range)
 * @param {number} toX 範圍右邊 (right of the range)
 * @param {number} seed 隨機種子，兩邊才會長得不一樣 (seed so the sides differ)
 */
function drawSideJungle(g, fromX, toX, seed) {
  const trees = [];
  for (let i = 0; i < 26; i++) {
    const x = fromX + hash(seed + i) * (toX - fromX);
    const y = 175 + hash(seed + i + 40) * 115;
    trees.push({ x, y, r: 18 + hash(seed + i + 80) * 22, variant: hash(seed + i + 120) });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const tree of trees) {
    drawTreeCrown(g, tree.x, tree.y, tree.r, tree.variant);
  }
  const middle = (fromX + toX) / 2;
  drawPalm(g, middle - 40, 300, 150, seed === 0 ? 30 : -30);
  drawPalm(g, middle + 50, 296, 120, seed === 0 ? 18 : -18);
}

/**
 * 前景左右下角的大片熱帶葉子，把畫面框起來 (big tropical leaves framing the bottom corners)
 */
function drawForegroundLeaves(g) {
  const leaves = [
    { x: -10, y: H + 10, angle: -1.25, length: 150, width: 34 },
    { x: 10, y: H + 10, angle: -0.85, length: 170, width: 38 },
    { x: 40, y: H + 15, angle: -0.45, length: 130, width: 30 },
    { x: W + 10, y: H + 10, angle: Math.PI + 1.25, length: 150, width: 34 },
    { x: W - 10, y: H + 10, angle: Math.PI + 0.85, length: 170, width: 38 },
    { x: W - 40, y: H + 15, angle: Math.PI + 0.45, length: 130, width: 30 },
  ];
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    drawBigLeaf(g, leaf.x, leaf.y, leaf.angle, leaf.length, leaf.width, i % 2 === 0 ? '#1e6b2a' : '#2a8a36');
  }

  // 底部的草叢 (grass tufts along the bottom)
  g.fillStyle = '#2f7d2f';
  for (let x = 0; x < W; x += 9) {
    const height = 8 + hash(x) * 14;
    g.beginPath();
    g.moveTo(x - 5, H);
    g.lineTo(x + (hash(x + 1) - 0.5) * 6, H - height);
    g.lineTo(x + 5, H);
    g.closePath();
    g.fill();
  }
}

/**
 * 一片大葉子：兩條曲線圍成葉形 + 中間的葉脈 (one big leaf with a midrib)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} x 葉柄位置 x (stem x)
 * @param {number} y 葉柄位置 y (stem y)
 * @param {number} angle 葉子指向的角度 (direction)
 * @param {number} length 長度
 * @param {number} width 最寬處的寬度
 * @param {string} color 顏色
 */
function drawBigLeaf(g, x, y, angle, length, width, color) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(length * 0.45, -width, length, 0);
  g.quadraticCurveTo(length * 0.45, width, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(160, 220, 120, 0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(length * 0.95, 0);
  for (let i = 1; i < 6; i++) {
    const along = length * i / 6.5;
    g.moveTo(along, 0);
    g.lineTo(along + length * 0.08, -width * 0.45);
    g.moveTo(along, 0);
    g.lineTo(along + length * 0.08, width * 0.45);
  }
  g.stroke();
  g.restore();
}

// ===== 會動的東西：每一幀重畫 (animated parts, redrawn every frame) =====

/**
 * 一朵蓬鬆的雲：先畫淡藍色的陰影，再畫白色的團塊 (fluffy cloud: blue-grey shadow, then white puffs)
 */
function drawCloud(ctx, x, y, s) {
  const puffs = [[0, 0, 34], [32, -10, 28], [-34, -4, 26], [62, 6, 20], [-62, 8, 18], [8, -26, 24]];
  for (const [dx, dy, r] of puffs) {
    circle(ctx, x + dx * s, y + dy * s + 7 * s, r * s, '#b9d6ec');
  }
  for (const [dx, dy, r] of puffs) {
    circle(ctx, x + dx * s, y + dy * s, r * s, '#ffffff');
  }
}

/**
 * 天上拖著煙的信號彈，沿著二次曲線飛 (signal flares flying along a curve, trailing smoke)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} time 經過秒數
 */
function drawFlares(ctx, time) {
  const flares = [
    { sx: 330, sy: 150, cx: 220, cy: -40, ex: -60, ey: 70, offset: 0 },
    { sx: 610, sy: 140, cx: 720, cy: -60, ex: 960, ey: 40, offset: 0.5 },
  ];
  for (const flare of flares) {
    const progress = wrap(time / 5 + flare.offset, 1);  // 0 → 1 飛行進度 (flight progress)
    // 煙：沿著已經飛過的路徑，每隔一小段放一團，越舊越淡 (smoke puffs along the path, older = fainter)
    for (let u = Math.max(0, progress - 0.55); u < progress; u += 0.018) {
      const age = (progress - u) / 0.55;
      const point = quadraticPoint(flare, u);
      circle(ctx, point.x, point.y, 3 + age * 6, `rgba(170, 70, 70, ${0.55 * (1 - age)})`);
    }
    if (progress < 0.9) {
      const head = quadraticPoint(flare, progress);
      circle(ctx, head.x, head.y, 9, 'rgba(255, 80, 60, 0.35)');
      circle(ctx, head.x, head.y, 4, '#ff4a3a');
      circle(ctx, head.x, head.y, 2, '#ffffff');
    }
  }
}

/**
 * 二次貝茲曲線上第 t 的位置 (point on a quadratic Bézier curve at t)
 * @param {{sx:number, sy:number, cx:number, cy:number, ex:number, ey:number}} c 起點、控制點、終點
 * @param {number} t 0 ~ 1
 * @returns {{x:number, y:number}}
 */
function quadraticPoint(c, t) {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const d = t * t;
  return { x: a * c.sx + b * c.cx + d * c.ex, y: a * c.sy + b * c.cy + d * c.ey };
}

/**
 * 一直往上冒的黑煙：好幾團煙依序往上飄、變大、變淡 (rising smoke column)
 */
function drawSmokeColumn(ctx, x, y, time, seed) {
  for (let k = 0; k < 9; k++) {
    const t = wrap(time * 0.22 + k / 9 + seed, 1);  // 這團煙的年紀 0 → 1 (age of this puff)
    const px = x + t * 40 + Math.sin(t * 6 + k) * 4;
    const py = y - t * 130;
    circle(ctx, px, py, 6 + t * 20, `rgba(70, 70, 78, ${0.6 * (1 - t)})`);
  }
}

/**
 * 爆炸：前段是火球 + 碎片，後段是一團灰煙 (explosion: fireball + debris, then a smoke puff)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} x 位置 x
 * @param {number} y 位置 y
 * @param {number} t 這次爆炸的進度 0 ~ 1 (progress of this explosion)
 */
function drawExplosion(ctx, x, y, t) {
  if (t < 0.35) {
    const f = t / 0.35;
    const r = 10 + f * 36;
    const fire = ctx.createRadialGradient(x, y, 0, x, y, r);
    fire.addColorStop(0, `rgba(255, 255, 240, ${1 - f * 0.5})`);
    fire.addColorStop(0.35, `rgba(255, 220, 80, ${1 - f * 0.4})`);
    fire.addColorStop(0.7, `rgba(255, 120, 30, ${0.9 - f * 0.5})`);
    fire.addColorStop(1, 'rgba(255, 80, 0, 0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 碎片：往外飛，再被重力拉下來 (debris flying out, pulled down by gravity)
    for (let i = 0; i < 7; i++) {
      const angle = -Math.PI * (0.1 + i * 0.12);
      const dx = Math.cos(angle) * f * 60;
      const dy = Math.sin(angle) * f * 60 + f * f * 40;
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(x + dx - 2, y + dy - 2, 4, 4);
    }
  } else {
    const f = (t - 0.35) / 0.65;
    circle(ctx, x + f * 10, y - f * 30, 14 + f * 18, `rgba(90, 85, 85, ${0.6 * (1 - f)})`);
    circle(ctx, x - 10 + f * 6, y - f * 18, 10 + f * 12, `rgba(120, 115, 110, ${0.5 * (1 - f)})`);
  }
}

/**
 * 司令部上的紅旗，用正弦波讓它飄 (red flag waving with a sine wave)
 */
function drawFlag(ctx, time) {
  const width = 32;
  const height = 20;
  ctx.fillStyle = '#d63a3a';
  ctx.beginPath();
  ctx.moveTo(FLAG_POLE_X, FLAG_TOP_Y + 2);
  // 上緣：每隔幾 px 依時間上下擺動，越往外擺越大 (top edge waves more toward the tip)
  for (let i = 0; i <= 8; i++) {
    const along = (i / 8) * width;
    ctx.lineTo(FLAG_POLE_X + along, FLAG_TOP_Y + 2 + Math.sin(time * 6 - i * 0.8) * (i / 8) * 4);
  }
  for (let i = 8; i >= 0; i--) {
    const along = (i / 8) * width;
    ctx.lineTo(FLAG_POLE_X + along, FLAG_TOP_Y + 2 + height + Math.sin(time * 6 - i * 0.8) * (i / 8) * 4);
  }
  ctx.closePath();
  ctx.fill();
  circle(ctx, FLAG_POLE_X + 14, FLAG_TOP_Y + 12 + Math.sin(time * 6 - 3.5) * 2, 4, '#ffffff');
}

/**
 * 沙包後面探頭開槍的敵兵：只畫頭盔的上半圓，貼在沙包頂端 (enemy helmets peeking over the sandbags)
 */
function drawEnemyPeekers(ctx, time) {
  for (let i = 0; i < ENEMY_PEEK_X.length; i++) {
    const x = ENEMY_PEEK_X[i];
    const up = Math.sin(time * 1.7 + i * 2.1) > -0.2;
    if (!up) continue;
    ctx.fillStyle = '#4b5540';
    ctx.beginPath();
    ctx.arc(x, SANDBAG_TOP_Y + 1, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#d63a3a';
    ctx.fillRect(x - 8, SANDBAG_TOP_Y - 2, 16, 2);
    // 槍口火光 (muzzle flash)
    if ((Math.floor(time * 7) + i) % 3 === 0) {
      drawMuzzleFlash(ctx, x - 13, SANDBAG_TOP_Y - 1, 5, '#ffb08a');
    }
  }
}

/**
 * 槍口火光：一個小星星 (muzzle flash: a small star)
 */
function drawMuzzleFlash(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? size : size * 0.4;
    const angle = (i / 8) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  circle(ctx, x, y, size * 0.35, '#ffffff');
}

/**
 * 曳光彈：一小段亮線沿著起點到終點的直線移動 (tracer: a short bright streak moving from A to B)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} x0 起點 x
 * @param {number} y0 起點 y
 * @param {number} x1 終點 x
 * @param {number} y1 終點 y
 * @param {number} t 進度 0 ~ 1
 * @param {string} color 顏色
 */
function drawTracer(ctx, x0, y0, x1, y1, t, color) {
  const length = 0.12; // 亮線長度佔整段的比例 (streak length as a fraction of the path)
  const tail = Math.max(0, t - length);
  thickLine(ctx, x0 + (x1 - x0) * tail, y0 + (y1 - y0) * tail, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 2.5, color);
}

/**
 * 我方游擊隊員（背影），手上的步槍對準基地 (a guerrilla seen from behind, rifle aimed at the base)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {object} member SQUAD 裡的一筆資料 (one entry of SQUAD)
 * @param {number} time 經過秒數
 * @returns {{x:number, y:number}} 槍口位置，曳光彈從這裡射出 (muzzle position for tracers)
 */
function drawGuerrilla(ctx, member, time) {
  const s = member.scale;
  const x = member.x;
  // 呼吸般的小晃動 (gentle idle bob)
  const y = member.y + Math.sin(time * 4 + member.phase) * 1.2;
  // 蹲著的人身體往下移，腿變短 (crouching: body lower, shorter legs)
  const drop = member.crouch ? 16 * s : 0;
  const skin = '#d29a68';

  // 影子 (shadow)
  ellipse(ctx, x, y, 26 * s, 6 * s, 'rgba(0, 0, 0, 0.25)');

  // 腿 + 靴子 (legs & boots)
  ctx.fillStyle = '#6b7442';
  if (member.crouch) {
    roundRectPath(ctx, x - 16 * s, y - 28 * s, 13 * s, 24 * s, 5 * s);
    ctx.fill();
    roundRectPath(ctx, x + 2 * s, y - 20 * s, 22 * s, 11 * s, 5 * s);  // 跪著的那隻腳 (kneeling leg)
    ctx.fill();
  } else {
    roundRectPath(ctx, x - 14 * s, y - 46 * s, 12 * s, 44 * s, 5 * s);
    ctx.fill();
    roundRectPath(ctx, x + 2 * s, y - 46 * s, 12 * s, 42 * s, 5 * s);
    ctx.fill();
  }
  ellipse(ctx, x - 8 * s, y - 2 * s, 8 * s, 4 * s, '#3b2a1c');
  ellipse(ctx, member.crouch ? x + 20 * s : x + 8 * s, member.crouch ? y - 9 * s : y - 4 * s, 8 * s, 4 * s, '#3b2a1c');

  const bodyBottom = y - 40 * s + drop;
  const shoulderY = y - 82 * s + drop;

  // 身體：卡其襯衫，右邊暗一點 (torso: khaki shirt, right side shaded)
  ctx.fillStyle = '#c9a86a';
  ctx.beginPath();
  ctx.moveTo(x - 19 * s, shoulderY);
  ctx.lineTo(x + 19 * s, shoulderY);
  ctx.lineTo(x + 15 * s, bodyBottom);
  ctx.lineTo(x - 15 * s, bodyBottom);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b08f55';
  ctx.beginPath();
  ctx.moveTo(x + 6 * s, shoulderY);
  ctx.lineTo(x + 19 * s, shoulderY);
  ctx.lineTo(x + 15 * s, bodyBottom);
  ctx.lineTo(x + 5 * s, bodyBottom);
  ctx.closePath();
  ctx.fill();
  // 腰帶 (belt)
  ctx.fillStyle = '#4a3220';
  ctx.fillRect(x - 15 * s, bodyBottom - 6 * s, 30 * s, 5 * s);
  // 斜背子彈帶 (bandolier)
  thickLine(ctx, x - 17 * s, shoulderY + 2 * s, x + 13 * s, bodyBottom - 6 * s, 5 * s, '#4a2e16');
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    circle(ctx, x - 17 * s + 30 * s * t, shoulderY + 2 * s + (bodyBottom - shoulderY - 8 * s) * t, 1.6 * s, '#f0c040');
  }
  // 背上的捲起睡袋 (bedroll across the shoulders)
  ctx.fillStyle = '#6f7d4b';
  roundRectPath(ctx, x - 21 * s, shoulderY - 6 * s, 42 * s, 11 * s, 5 * s);
  ctx.fill();
  ctx.fillStyle = '#3b3020';
  ctx.fillRect(x - 11 * s, shoulderY - 6 * s, 3 * s, 11 * s);
  ctx.fillRect(x + 8 * s, shoulderY - 6 * s, 3 * s, 11 * s);

  // 步槍：從右肩往基地方向伸出去 (rifle from the right shoulder toward the base)
  const gunX = x + 14 * s;
  const gunY = shoulderY - 2 * s;
  // 槍往畫面裡面指，看起來會變短（透視），所以只畫短短一截，角度也壓低一點 (pointing into the scene: short, foreshortened)
  const angle = Math.atan2(BASE_GROUND_Y + 40 - gunY, BUNKER_X - gunX);
  const muzzleX = gunX + Math.cos(angle) * 36 * s;
  const muzzleY = gunY + Math.sin(angle) * 36 * s;
  thickLine(ctx, gunX, gunY, gunX + Math.cos(angle) * 14 * s, gunY + Math.sin(angle) * 14 * s, 7 * s, '#6b4220');
  thickLine(ctx, gunX + Math.cos(angle) * 11 * s, gunY + Math.sin(angle) * 11 * s, muzzleX, muzzleY, 4 * s, '#1f1f1f');

  // 手臂：兩隻手往前舉著槍，只看得到上臂和捲起的袖子 (arms raised forward: upper arms & rolled sleeves)
  thickLine(ctx, x + 17 * s, shoulderY + 2 * s, x + 24 * s, shoulderY + 14 * s, 9 * s, skin);
  thickLine(ctx, x - 17 * s, shoulderY + 2 * s, x - 6 * s, shoulderY + 10 * s, 9 * s, skin);
  circle(ctx, x + 17 * s, shoulderY + 3 * s, 6 * s, '#c9a86a');
  circle(ctx, x - 17 * s, shoulderY + 3 * s, 6 * s, '#c9a86a');

  // 脖子與頭：黑頭髮 + 耳朵 + 紅頭巾，頭巾尾巴在風中飄 (neck, hair, ears, red bandana with waving tails)
  const headY = shoulderY - 16 * s;
  ctx.fillStyle = skin;
  ctx.fillRect(x - 5 * s, shoulderY - 9 * s, 10 * s, 9 * s);
  circle(ctx, x - 11 * s, headY + 1 * s, 3 * s, skin);
  circle(ctx, x + 11 * s, headY + 1 * s, 3 * s, skin);
  circle(ctx, x, headY, 11 * s, '#1d1712');
  ctx.fillStyle = '#e0332e';
  ctx.fillRect(x - 11 * s, headY - 6 * s, 22 * s, 5 * s);
  const wave = Math.sin(time * 8 + member.phase);
  ctx.beginPath();
  ctx.moveTo(x - 1 * s, headY - 3 * s);
  ctx.quadraticCurveTo(x - 10 * s, headY + 6 * s, x - 14 * s + wave * 3 * s, headY + 14 * s);
  ctx.lineTo(x - 9 * s + wave * 3 * s, headY + 15 * s);
  ctx.quadraticCurveTo(x - 5 * s, headY + 6 * s, x + 1 * s, headY - 3 * s);
  ctx.moveTo(x + 1 * s, headY - 3 * s);
  ctx.quadraticCurveTo(x + 4 * s, headY + 8 * s, x + 2 * s - wave * 2 * s, headY + 17 * s);
  ctx.lineTo(x + 7 * s - wave * 2 * s, headY + 16 * s);
  ctx.quadraticCurveTo(x + 8 * s, headY + 6 * s, x + 2 * s, headY - 3 * s);
  ctx.fill();
  circle(ctx, x, headY - 3 * s, 3 * s, '#b52520');

  return { x: muzzleX, y: muzzleY };
}

/**
 * 畫整個戰場場景（開機畫面和歡迎畫面共用）(draw the whole battlefield; shared by splash & menu)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} time 經過秒數
 */
function drawBattlefield(ctx, time) {
  ensureLayers(ctx);
  ctx.drawImage(backLayer, 0, 0, W, H);

  // 雲慢慢往右飄，飄出畫面再從左邊出現 (clouds drift right and wrap around)
  for (const cloud of CLOUDS) {
    drawCloud(ctx, wrap(cloud.x + time * cloud.speed, W + 300) - 150, cloud.y, cloud.s);
  }
  drawFlares(ctx, time);

  ctx.drawImage(frontLayer, 0, 0, W, H);

  drawFlag(ctx, time);
  for (const smoke of SMOKE_POINTS) {
    drawSmokeColumn(ctx, smoke.x, smoke.y, time, smoke.seed);
  }
  drawEnemyPeekers(ctx, time);

  // 爆炸：每個位置輪流炸，週期 2.5 秒 (explosions take turns, 2.5 s cycle)
  for (let i = 0; i < BLAST_POINTS.length; i++) {
    const t = wrap(time / 2.5 + i / BLAST_POINTS.length, 1);
    if (t < 0.6) {
      drawExplosion(ctx, BLAST_POINTS[i].x, BLAST_POINTS[i].y, t / 0.6);
    }
  }

  // 敵人的紅色曳光彈：從沙包往我方射，但打太高 (enemy red tracers flying over our heads)
  for (let i = 0; i < ENEMY_PEEK_X.length; i++) {
    const t = wrap(time * 1.6 + i * 0.37, 1);
    const targetX = 200 + i * 160;
    drawTracer(ctx, ENEMY_PEEK_X[i] - 12, SANDBAG_TOP_Y - 2, targetX, 300, t, '#ff5a4a');
  }

  // 我方隊員 + 黃色曳光彈打向基地 (our squad firing yellow tracers at the base)
  for (let i = 0; i < SQUAD.length; i++) {
    const muzzle = drawGuerrilla(ctx, SQUAD[i], time);
    const t = wrap(time * 2.2 + i * 0.41, 1);
    const target = BLAST_POINTS[(i * 2) % BLAST_POINTS.length];
    drawTracer(ctx, muzzle.x, muzzle.y, target.x, target.y, t, '#ffe066');
    if (t < 0.12) {
      drawMuzzleFlash(ctx, muzzle.x, muzzle.y, 9 * SQUAD[i].scale, '#fff2a0');
    }
  }
}

// ===== 文字與介面 (text & UI) =====

/**
 * 卡通粗體字：先畫往下偏的深色外框當陰影，再畫外框，最後填色 (chunky cartoon text: shadow, outline, fill)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {string} text 文字
 * @param {number} x x
 * @param {number} y y（文字中線）
 * @param {number} size 字體大小
 * @param {string|CanvasGradient} fill 填色
 * @param {string} outline 外框顏色
 * @param {number} outlineWidth 外框粗細
 * @param {string} align 對齊：'left' | 'center' | 'right'
 */
function drawChunkyText(ctx, text, x, y, size, fill, outline, outlineWidth, align = 'center') {
  ctx.font = `${size}px ${TITLE_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = outlineWidth;
  ctx.strokeText(text, x, y + size * 0.08);   // 往下偏的外框 = 立體陰影 (offset outline = depth)
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * 大標題：白 → 黃 → 橘的漸層字，深色粗外框，下面一行小字標語 (big gradient title with a small tagline under it)
 */
function drawTitle(ctx, time) {
  const y = 128 + Math.sin(time * 2) * 2;
  const size = 58;
  const gradient = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, '#ffe14d');
  gradient.addColorStop(1, '#ff9d00');
  drawChunkyText(ctx, GAME_TITLE.toUpperCase(), W / 2, y, size, gradient, '#0e1f12', 11);
  drawChunkyText(ctx, GAME_TAGLINE, W / 2, y + 48, 15, '#e8f5d0', '#0e1f12', 4);
}

/**
 * 中間的開始按鈕，會輕輕放大縮小；其實點畫面任何地方都能開始 (pulsing start button; any click starts)
 */
function drawStartButton(ctx, time, touchMode) {
  const width = 220;
  const height = 58;
  const cx = W / 2;
  const cy = 262;
  const pulse = 1 + Math.sin(time * 4) * 0.03;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#1d4d17';
  roundRectPath(ctx, -width / 2, -height / 2 + 5, width, height, 14);
  ctx.fill();
  const green = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
  green.addColorStop(0, '#a6ec5c');
  green.addColorStop(1, '#3fa531');
  ctx.fillStyle = green;
  roundRectPath(ctx, -width / 2, -height / 2, width, height, 14);
  ctx.fill();
  ctx.strokeStyle = '#1d4d17';
  ctx.lineWidth = 4;
  ctx.stroke();
  drawChunkyText(ctx, 'PLAY', 0, 1, 32, '#ffffff', '#1d4d17', 7);
  ctx.restore();

  drawChunkyText(ctx, touchMode ? 'tap anywhere to start' : 'press Enter or click', W / 2, cy + 46, 13, '#cfe3c0', '#0e1f12', 3);
}

/**
 * 最下面一行：最高紀錄 + 操作方式，小小的就好 (one small line at the bottom: best record + controls)
 */
function drawFooter(ctx, bestStage, touchMode) {
  const best = bestStage > 0 ? `Best: Stage ${bestStage}` : 'No record yet';
  const controls = touchMode
    ? 'Left stick: move  ·  Right stick: aim & fire'
    : 'WASD move  ·  Mouse aim  ·  Click shoot  ·  R reload  ·  M mute';
  drawChunkyText(ctx, best, W / 2, H - 42, 15, '#ffd23f', '#0e1f12', 4);
  drawChunkyText(ctx, controls, W / 2, H - 18, 12, '#b9c9b0', '#0e1f12', 3);
}

// ===== 對外的兩個畫面 (the two exported screens) =====

/**
 * 開機畫面：戰場當背景，蓋一層暗色，中間一行閃爍提示。
 * 存在的原因：瀏覽器要玩家先操作一次才准出聲，所以先請玩家點一下，之後的歡迎畫面才有音樂
 * (splash: browsers only allow sound after a click, so we ask for one first)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} time 經過秒數，用來閃爍 (seconds, for blinking)
 * @param {boolean} touchMode 是否為觸控模式 (touch mode)
 */
export function drawSplash(ctx, time, touchMode) {
  drawBattlefield(ctx, time);
  ctx.fillStyle = 'rgba(5, 20, 40, 0.6)';
  ctx.fillRect(0, 0, W, H);

  if (time % MENU_BLINK_PERIOD < MENU_BLINK_PERIOD / 2) {
    drawChunkyText(ctx, touchMode ? 'TAP TO START' : 'PRESS ENTER OR CLICK', W / 2, H / 2 - 10, 40, '#ffffff', '#13305a', 9);
  }
  drawChunkyText(ctx, 'Turn your sound on!', W / 2, H / 2 + 38, 18, '#ffd23f', '#13305a', 5);
}

/**
 * 歡迎畫面（主選單），簡單版：戰場背景蓋一層暗色，中間只有標題和 PLAY 按鈕，最下面一行小字
 * (simple welcome screen: dimmed battlefield, just the title and a PLAY button, one small line at the bottom)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} bestStage 最高紀錄
 * @param {number} time 進入選單後經過的秒數，用來做動畫 (seconds on the menu, for animation)
 * @param {boolean} touchMode 是否為觸控模式，決定顯示哪一種操作說明 (show touch or keyboard help)
 */
export function drawMenu(ctx, bestStage, time, touchMode) {
  drawBattlefield(ctx, time);
  // 暗色漸層蓋在背景上，讓文字和按鈕跳出來 (dark gradient over the background so the UI stands out)
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(6, 16, 10, 0.35)');
  shade.addColorStop(0.5, 'rgba(6, 16, 10, 0.55)');
  shade.addColorStop(1, 'rgba(6, 16, 10, 0.8)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  drawTitle(ctx, time);
  drawStartButton(ctx, time, touchMode);
  drawFooter(ctx, bestStage, touchMode);
}
