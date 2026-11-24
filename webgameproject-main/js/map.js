import {
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  VIEW_WIDTH,
  VIEW_HEIGHT,
  RIVER_CHANCE,
  RIVER_WIDTH,
  BRIDGE_COUNT,
  GROVE_COUNT,
  GROVE_RADIUS_MIN,
  GROVE_RADIUS_MAX,
  GROVE_DENSITY,
  GROVE_BUSH_RATIO,
  BUSH_PATCH_COUNT,
  BUSH_PATCH_SIZE,
  BUSH_SEE_THROUGH_ALPHA,
  ROCK_PILE_COUNT,
  ROCK_PILE_SIZE,
  CRATE_COUNT,
  TRAP_COUNT,
  TRAIL_TRAP_COUNT,
  CAMP_CRATE_COUNT,
  TOWER_CHANCE,
  TOWER_MAX,
  WIRE_CHANCE,
  WIRE_LENGTH,
  TURRET_SLOTS,
  TURRET_MAX_BEFORE_BOSS,
  BOSS_STAGE_INTERVAL,
  TURRET_CHANCE,
  TURRET_MIN_STAGE,
  WAVE_MIN_DISTANCE,
  PLAYER_SPAWN_COL,
  PLAYER_SPAWN_ROW,
  SAFE_ZONE_RADIUS,
  MAP_GEN_MAX_ATTEMPTS,
  EXIT_SAFE_RADIUS,
  LOS_STEP,
  CRATE_HP,
  ENEMY_MIN_SPAWN_DISTANCE,
  CRATE_COLOR,
  CRATE_EDGE_COLOR,
  ROCK_COLOR,
  ROCK_HIGHLIGHT_COLOR,
  TREE_COLOR,
  TREE_HIGHLIGHT_COLOR,
  TRAP_COLOR,
  TRAP_SPIKE_COLOR,
} from './config.js';
import { getImage } from './assets.js';

// 每一種 tile 的特性 (tile properties)
// blocksMovement：會不會擋住移動；blocksBullet：會不會擋住子彈；blocksSight：敵人看不看得穿
const TILE_PROPS = {
  empty: { blocksMovement: false, blocksBullet: false, blocksSight: false },
  crate: { blocksMovement: true, blocksBullet: true, blocksSight: true },
  rock: { blocksMovement: true, blocksBullet: true, blocksSight: true },
  tree: { blocksMovement: true, blocksBullet: false, blocksSight: false },   // 棕櫚樹：樹幹擋路，樹葉在頭上，看得到下面 (palm: trunk blocks, you can see under it)
  bush: { blocksMovement: false, blocksBullet: false, blocksSight: true },   // 草叢：可以走進去躲，敵人看不穿 (bush: walk in and hide)
  trap: { blocksMovement: false, blocksBullet: false, blocksSight: false },
  water: { blocksMovement: true, blocksBullet: false, blocksSight: false },  // 河水：走不過去，但子彈可以飛過 (river: can't walk, bullets pass)
  sandbag: { blocksMovement: true, blocksBullet: true, blocksSight: true },  // 沙包牆：當掩體，打不壞 (sandbag wall: indestructible cover)
  tower: { blocksMovement: true, blocksBullet: false, blocksSight: false },  // 瞭望塔：木頭高台，柱子擋路，但子彈和視線都過得去 (open wooden tower: posts block walking, not bullets or sight)
  wire: { blocksMovement: false, blocksBullet: false, blocksSight: false },  // 鐵絲網：走得過去但會變很慢，看得到、打得過去 (barbed wire: walkable but slow)
  bunker: { blocksMovement: true, blocksBullet: true, blocksSight: true },   // 指揮碉堡（2×2 格）(command bunker, 2x2 tiles)
  palisade: { blocksMovement: true, blocksBullet: true, blocksSight: true }, // 木樁圍牆（第二種營地）(log palisade wall, stockade camp)
  tent: { blocksMovement: true, blocksBullet: true, blocksSight: true },     // 軍用帳篷（2×2 格）(army tent, 2x2)
  hut: { blocksMovement: true, blocksBullet: true, blocksSight: true },      // 茅草屋（2×2 格）(thatched hut, 2x2)
  campfire: { blocksMovement: true, blocksBullet: false, blocksSight: false }, // 營火：走不過去，但不擋子彈和視線 (campfire: blocks walking only)
  // 架著砲塔的屋頂格：砲塔本身是敵人，所以這一格不擋子彈，子彈才打得到砲塔 (roof tile with a turret: bullets must reach the turret)
  bunkerTurret: { blocksMovement: true, blocksBullet: false, blocksSight: false },
  towerTurret: { blocksMovement: true, blocksBullet: false, blocksSight: false },
  towerSniper: { blocksMovement: true, blocksBullet: false, blocksSight: false }, // 塔頂站著狙擊手：子彈打得到他 (a sniper on top: bullets can reach him)
};

// 上、下、左、右四個方向，BFS 用 (4 directions for BFS)
const DIRECTIONS = [
  { dCol: 0, dRow: -1 },
  { dCol: 0, dRow: 1 },
  { dCol: -1, dRow: 0 },
  { dCol: 1, dRow: 0 },
];

// 地表種類，只影響外觀，不影響碰撞 (ground type: looks only, no collision)
//   'grass'：草地　'path'：泥土小路　'bridge'：木橋　'camp'：營地的硬泥地

// 地圖外框加深的寬度，讓邊緣看起來像濃密的叢林 (dark jungle border width, px)
const EDGE_SHADE = 48;

/**
 * 產生 0 ~ max-1 的隨機整數 (random integer from 0 to max - 1)
 * @param {number} max 上限（不含）
 * @returns {number}
 */
function randomInt(max) {
  return Math.floor(Math.random() * max);
}

// ===== 三種敵軍營地 (three enemy camp layouts) =====
// 每一關隨機挑一種，而且不會跟上一關一樣，才不會一直看到同一個基地 (one per stage, never the same as the last stage)
//   fort      沙包堡壘：方形沙包牆，正門＋側門，中間一座水泥指揮碉堡 (sandbag fort: square wall, concrete bunker)
//   stockade  木樁營寨：扁長的木樁圍牆，裡面兩頂軍用帳篷和一堆營火 (log stockade: wide palisade, two tents, a campfire)
//   outpost   叢林前哨：沒有圍牆，外圍一段段鐵絲網，前排兩個沙包機槍巢，後面一間茅草屋和營火
//             (jungle outpost: no wall, broken barbed-wire perimeter, two sandbag gun nests up front, a thatched hut)
// halfW / halfH：營地從中心往左右 / 上下延伸幾格（含牆）(how far the camp extends from its center, walls included)
export const CAMP_LAYOUTS = {
  fort: { halfW: 4, halfH: 4, wall: 'sandbag', building: 'bunker', buildings: 1, campfire: false },
  stockade: { halfW: 5, halfH: 3, wall: 'palisade', building: 'tent', buildings: 2, campfire: true },
  outpost: { halfW: 4, halfH: 4, wall: null, building: 'hut', buildings: 1, campfire: true },
};

/**
 * 每一格固定的假隨機數，用來決定樹要轉幾度，每一幀才不會亂跳 (stable pseudo-random per tile)
 * @param {number} col 欄
 * @param {number} row 列
 * @returns {number} 0 ~ 1
 */
function tileHash(col, row) {
  const x = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// 遊戲地圖 (game map)
// 取名 GameMap 而不是 Map，因為 JS 已經內建一個叫 Map 的資料結構。
export class GameMap {
  /**
   * 建立地圖 (create the map)
   * @param {number} stage 第幾關，決定會不會出現砲塔 (stage number, decides turrets)
   */
  /**
   * @param {number} stage 第幾關
   * @param {string|null} avoidLayout 上一關的營地樣式，這關不要再用 (last stage's camp layout, to avoid repeating it)
   */
  constructor(stage = 1, avoidLayout = null) {
    this.stage = stage;
    // tiles[row][col]：先選列（y）再選欄（x）(2D array, row first)
    this.tiles = [];
    // ground[row][col]：地表外觀 (ground look per tile)
    this.ground = [];
    // crateHp[row][col]：每個箱子剩多少耐久度，跟 tiles 一樣大 (crate durability per tile)
    this.crateHp = [];

    // 營地中心的位置（以前是停機坪，現在是營地的中心點，營地、敵人、情報都繞著它放）
    // (camp center; the camp, enemies and intel are all placed around it)
    // 這一關的營地樣式 (this stage's camp layout)
    const layoutNames = Object.keys(CAMP_LAYOUTS).filter((name) => name !== avoidLayout);
    this.layoutName = layoutNames[randomInt(layoutNames.length)];
    this.layout = CAMP_LAYOUTS[this.layoutName];
    this.campHalfW = this.layout.halfW;
    this.campHalfH = this.layout.halfH;
    // 營地貼著地圖右邊：最右邊那排牆剛好是地圖最後一欄 (the camp hugs the right edge of the map)
    this.exitCol = MAP_COLS - 1 - this.campHalfW;
    this.exitRow = 0;

    // 河流：每一列河的最左邊那一格；沒有河時是 null (river: leftmost water column per row, null = no river)
    this.riverCols = null;
    this.bridgeRows = [];

    // 營地的設施 (camp structures)
    this.sideGateRow = 0;      // 側門在哪一列 (row of the side gate)
    this.turretSpots = [];     // 砲塔的位置（像素座標），game.js 會在這裡放砲塔敵人 (turret positions for game.js)
    this.buildings = [];       // 指揮碉堡的左上角格子，畫圖用 (top-left tile of each bunker, for drawing)
    this.wireAngles = {};      // 每段鐵絲網的方向，"col,row" → 角度 (direction of each wire tile)

    // 剛被打破的箱子位置，game.js 每幀讀取後清空 (crates broken this frame, read by game.js)
    this.brokenCrates = [];

    // 預先畫好的地面圖層（草地、小路、河、橋），第一次 draw 時才建立 (pre-rendered ground, built on first draw)
    this.groundLayer = null;
    this.groundLayerScale = 0;

    this.generate();
  }

  // ===== 生成 (generation) =====

  /**
   * 生成地圖，直到所有能走的格子都互相連通 (generate until fully connected)
   * 順序很重要：先決定河、營地、小路（這些地方不能放東西），最後才撒樹、石頭、箱子、陷阱。
   */
  generate() {
    for (let attempt = 1; attempt <= MAP_GEN_MAX_ATTEMPTS; attempt++) {
      this.fillEmpty();
      // 出口的列隨機選，上下各留空間給營地的沙包牆 (random exit row, leaving room for the camp walls)
      this.exitRow = this.campHalfH + randomInt(MAP_ROWS - this.campHalfH * 2);

      this.riverCols = null;
      this.bridgeRows = [];
      if (Math.random() < RIVER_CHANCE) {
        this.carveRiver();
      }
      this.buildCamp();
      this.carveTrail();
      this.placeCampStructures();
      this.placeCampCrates();
      this.placeGroves();
      this.placeRockPiles();
      this.placeBushPatches();
      this.placeRandom('crate', CRATE_COUNT);
      this.placeRandom('trap', TRAP_COUNT);
      this.placeTrailTraps();

      if (this.sealUnreachablePockets()) {
        return; // 成功 (success)
      }
    }

    // 理論上幾乎不會發生；真的失敗就給一張空地圖，至少遊戲能玩 (fallback)
    console.warn('Map generation failed, using an empty map (地圖生成失敗，改用空地圖)');
    this.fillEmpty();
    this.riverCols = null;
    this.bridgeRows = [];
  }

  /**
   * 把整張地圖清成空地、地表全部是草地 (fill the whole map with empty grass)
   */
  fillEmpty() {
    this.tiles = [];
    this.ground = [];
    this.crateHp = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      this.tiles.push(new Array(MAP_COLS).fill('empty'));
      this.ground.push(new Array(MAP_COLS).fill('grass'));
      this.crateHp.push(new Array(MAP_COLS).fill(0));
    }
  }

  /**
   * 挖一條從上到下、彎彎曲曲的河，再搭幾座橋 (carve a winding river, then add bridges)
   * 河每往下一列，有機率往左或往右偏一格；河寬 2 格，所以偏一格時上下兩列還是連在一起，不會漏洞。
   */
  carveRiver() {
    const minCol = Math.floor(MAP_COLS * 0.3);
    const maxCol = Math.floor(MAP_COLS * 0.62);
    let col = minCol + randomInt(maxCol - minCol);
    this.riverCols = [];

    for (let row = 0; row < MAP_ROWS; row++) {
      if (row > 0 && Math.random() < 0.35) {
        col += Math.random() < 0.5 ? -1 : 1;
        col = Math.max(minCol, Math.min(maxCol, col));
      }
      this.riverCols.push(col);
      for (let w = 0; w < RIVER_WIDTH; w++) {
        this.tiles[row][col + w] = 'water';
      }
    }

    // 橋：隨機選幾列，彼此至少隔 5 列，橋上的河水換成可以走的空地 (bridges at least 5 rows apart)
    let tries = 0;
    while (this.bridgeRows.length < BRIDGE_COUNT && tries < 50) {
      tries++;
      const row = 2 + randomInt(MAP_ROWS - 4);
      const tooClose = this.bridgeRows.some((other) => Math.abs(other - row) < 5);
      if (tooClose) continue;
      this.bridgeRows.push(row);
      for (let w = 0; w < RIVER_WIDTH; w++) {
        this.tiles[row][this.riverCols[row] + w] = 'empty';
        this.ground[row][this.riverCols[row] + w] = 'bridge';
      }
    }
  }

  /**
   * 敵軍營地的地面和圍牆：一圈牆（沙包或木樁），左邊留正門，上或下再隨機開一個側門；前哨沒有圍牆
   * (camp ground and walls: a ring of sandbags or logs with a front gate on the left and a side gate on top or bottom;
   *  the outpost has no wall)
   */
  buildCamp() {
    const halfW = this.campHalfW;
    const halfH = this.campHalfH;
    // 側門開在上面還是下面 (side gate on top or bottom)
    const sideGateRow = Math.random() < 0.5 ? this.exitRow - halfH : this.exitRow + halfH;
    this.sideGateRow = sideGateRow;

    for (let row = this.exitRow - halfH; row <= this.exitRow + halfH; row++) {
      for (let col = this.exitCol - halfW; col <= this.exitCol + halfW; col++) {
        if (!this.isInside(col, row)) continue;
        this.ground[row][col] = 'camp';
        if (this.layout.wall === null) continue;

        // 只有最外圈才是牆 (only the outer ring is wall)
        const onRing = Math.abs(col - this.exitCol) === halfW || Math.abs(row - this.exitRow) === halfH;
        if (!onRing) continue;

        const isFrontGate = col === this.exitCol - halfW && row === this.exitRow;
        const isSideGate = col === this.exitCol && row === sideGateRow;
        if (isFrontGate || isSideGate) continue;

        this.tiles[row][col] = this.layout.wall;
      }
    }
  }

  /**
   * 泥土小路：從玩家出生點出發，經過一座橋（有河的話），走到營地門口再進到營地中心 (dirt trail to the camp center)
   */
  carveTrail() {
    const waypoints = [{ col: PLAYER_SPAWN_COL, row: PLAYER_SPAWN_ROW }];

    if (this.riverCols !== null && this.bridgeRows.length > 0) {
      const bridgeRow = this.bridgeRows[randomInt(this.bridgeRows.length)];
      const riverCol = this.riverCols[bridgeRow];
      waypoints.push({ col: riverCol - 1, row: bridgeRow });
      waypoints.push({ col: riverCol + RIVER_WIDTH, row: bridgeRow });
    }
    waypoints.push({ col: this.frontGateCol - 1, row: this.exitRow });
    waypoints.push({ col: this.exitCol, row: this.exitRow });

    for (let i = 0; i < waypoints.length - 1; i++) {
      this.carveTrailSegment(waypoints[i], waypoints[i + 1]);
    }
  }

  /**
   * 從 A 走到 B，一次走一格，大多往「還差比較多」的方向走，偶爾換方向，路才會彎彎的 (wobbly walk from A to B)
   * 小路只改「地表外觀」，不會改 tiles，所以不會擋路 (only changes ground looks)
   * @param {{col: number, row: number}} from 起點
   * @param {{col: number, row: number}} to 終點
   */
  carveTrailSegment(from, to) {
    let col = from.col;
    let row = from.row;
    this.markTrail(col, row);

    while (col !== to.col || row !== to.row) {
      const dCol = to.col - col;
      const dRow = to.row - row;
      // 70% 走差距比較大的方向，30% 走另一個方向（如果那個方向還需要走）(mostly along the bigger gap)
      const preferCol = Math.abs(dCol) >= Math.abs(dRow);
      const moveCol = dRow === 0 || (dCol !== 0 && (Math.random() < 0.7 ? preferCol : !preferCol));
      if (moveCol) {
        col += Math.sign(dCol);
      } else {
        row += Math.sign(dRow);
      }
      this.markTrail(col, row);
    }
  }

  /**
   * 把一格標成小路（橋和河水維持原樣）(mark a tile as trail, keeping bridges & water)
   */
  markTrail(col, row) {
    if (!this.isInside(col, row)) return;
    if (this.tiles[row][col] === 'water') return;
    if (this.ground[row][col] === 'bridge') return;
    this.ground[row][col] = 'path';
  }

  /**
   * 這格能不能放障礙物：空地、草地（不放在小路、橋、營地上）、不在安全區 (can an obstacle go here)
   * @returns {boolean}
   */
  canPlace(col, row) {
    if (!this.isInside(col, row)) return false;
    if (this.tiles[row][col] !== 'empty') return false;
    if (this.ground[row][col] !== 'grass') return false;
    return !this.isInSafeZone(col, row);
  }

  /**
   * 營地的設施：瞭望塔、砲塔底座、門外的鐵絲網，每一關隨機決定有哪些 (camp structures, randomized each stage)
   */
  placeCampStructures() {
    this.turretSpots = [];
    this.wireAngles = {};
    this.buildings = [];

    // ----- 主建築：碉堡 / 帳篷 / 茅草屋，都是 2×2，蓋在營地後半部（瞭望塔在前面）
    //       (main buildings: bunker / tents / hut, all 2x2, in the back half of the camp; the towers are up front)
    const buildingSpots = [];
    for (let row = this.exitRow - this.campHalfH + 1; row <= this.exitRow + this.campHalfH - 2; row++) {
      for (let col = this.exitCol - 1; col <= this.exitCol + this.campHalfW - 2; col++) {
        // 要蓋兩棟的話，一棟靠上牆、一棟靠下牆，中間留給營火和走道 (two buildings: one against the top wall, one against the bottom)
        const againstWall = row === this.exitRow - this.campHalfH + 1 || row === this.exitRow + this.campHalfH - 2;
        if (this.layout.buildings >= 2 && !againstWall) continue;
        buildingSpots.push({ col, row });
      }
    }
    while (buildingSpots.length > 0 && this.buildings.length < this.layout.buildings) {
      const spot = buildingSpots.splice(randomInt(buildingSpots.length), 1)[0];
      if (!this.canBuild(spot.col, spot.row, 2)) continue;
      // 兩棟之間至少留一格走道 (leave at least a one-tile lane between buildings)
      const tooClose = this.buildings.some((b) => Math.abs(b.col - spot.col) < 3 && Math.abs(b.row - spot.row) < 3);
      if (tooClose) continue;
      for (let dRow = 0; dRow < 2; dRow++) {
        for (let dCol = 0; dCol < 2; dCol++) {
          this.tiles[spot.row + dRow][spot.col + dCol] = this.layout.building;
        }
      }
      this.buildings.push({ col: spot.col, row: spot.row, type: this.layout.building });
    }

    // ----- 營火（營寨和前哨）：營地中間附近一格 (campfire near the middle, stockade and outpost) -----
    if (this.layout.campfire) {
      const fireSpots = [];
      for (let row = this.exitRow - 2; row <= this.exitRow + 2; row++) {
        for (let col = this.exitCol - 2; col <= this.exitCol + 2; col++) {
          if (this.isInside(col, row) && this.tiles[row][col] === 'empty' && this.ground[row][col] === 'camp' && !this.isInSafeZone(col, row)) {
            fireSpots.push({ col, row });
          }
        }
      }
      if (fireSpots.length > 0) {
        const fire = fireSpots[randomInt(fireSpots.length)];
        this.tiles[fire.row][fire.col] = 'campfire';
      }
    }

    // ----- 前哨：前排兩個 C 形沙包機槍巢（開口朝後），外圍一段一段的鐵絲網 (outpost: two C-shaped gun nests, broken wire perimeter) -----
    if (this.layoutName === 'outpost') {
      const nestCol = this.frontGateCol + 1;
      for (const side of [-1, 1]) {
        const nestRow = this.exitRow + side * 2;
        const bags = [[0, -1], [0, 0], [0, 1], [1, -1], [1, 1]];
        for (const [dCol, dRow] of bags) {
          const col = nestCol + dCol;
          const row = nestRow + dRow;
          if (!this.isInside(col, row) || this.tiles[row][col] !== 'empty' || this.ground[row][col] !== 'camp') continue;
          this.tiles[row][col] = 'sandbag';
        }
      }
      for (let row = this.exitRow - this.campHalfH; row <= this.exitRow + this.campHalfH; row++) {
        for (let col = this.exitCol - this.campHalfW; col <= this.exitCol + this.campHalfW; col++) {
          const onRing = Math.abs(col - this.exitCol) === this.campHalfW || Math.abs(row - this.exitRow) === this.campHalfH;
          if (!onRing || !this.isInside(col, row) || Math.random() < 0.35) continue;
          if (this.tiles[row][col] !== 'empty' || this.ground[row][col] !== 'camp') continue;
          if (col === this.frontGateCol && Math.abs(row - this.exitRow) <= 1) continue; // 正門口留空 (keep the front entrance open)
          this.tiles[row][col] = 'wire';
          const vertical = Math.abs(col - this.exitCol) === this.campHalfW;
          this.wireAngles[`${col},${row}`] = vertical ? Math.PI / 2 : 0;
        }
      }
    }

    // ----- 瞭望塔：獨立的木頭高台，蓋在營地「前面」（正門那一側，面向玩家），跟沙包牆隔一格，不會蓋在營地後面
    //       砲塔一定在最前面、最靠近正門的塔上；狙擊手也站在塔頂 (standalone wooden towers in FRONT of the camp, one tile
    //       away from the front wall, never behind it; turrets always take the front-most towers nearest the gate)
    const corners = this.getFrontTowerSpots();
    // 自動砲塔：第一個 BOSS 之前最多 1 座，之後最多 TURRET_SLOTS 座 (turrets: at most 1 before the first boss)
    if (this.stage >= TURRET_MIN_STAGE) {
      const maxTurrets = this.stage < BOSS_STAGE_INTERVAL ? TURRET_MAX_BEFORE_BOSS : TURRET_SLOTS;
      let turrets = 0;
      // 從最靠近正門的位置開始放 (start from the spots nearest the front gate)
      for (let i = 0; i < corners.length && turrets < maxTurrets; i++) {
        if (Math.random() >= TURRET_CHANCE) continue;
        const corner = corners.splice(i, 1)[0];
        i--;
        this.tiles[corner.row][corner.col] = 'towerTurret';
        this.turretSpots.push(this.tileCenter(corner.col, corner.row));
        turrets++;
      }
    }
    // 空的瞭望塔（之後狙擊手可能會上去）(empty towers; snipers may climb them later)
    let towers = 0;
    for (const corner of corners) {
      if (towers >= TOWER_MAX || Math.random() >= TOWER_CHANCE) continue;
      this.tiles[corner.row][corner.col] = 'tower';
      towers++;
    }

    // ----- 鐵絲網：從門口往外斜拉，像漏斗一樣把人逼進門口 (barbed wire funnels leading to each gate) -----
    // 正門在左邊，往左上和左下拉 (front gate on the left: wire goes up-left and down-left)
    const walled = this.layout.wall !== null;
    if (walled && Math.random() < WIRE_CHANCE) {
      const gateCol = this.frontGateCol;
      for (let k = 1; k <= WIRE_LENGTH; k++) {
        this.placeWire(gateCol - k, this.exitRow - k, -Math.PI * 0.75);
        this.placeWire(gateCol - k, this.exitRow + k, Math.PI * 0.75);
      }
    }
    // 側門在上面或下面，往外的兩個斜角拉 (side gate on top/bottom: wire goes out diagonally both ways)
    if (walled && Math.random() < WIRE_CHANCE) {
      const out = this.sideGateRow < this.exitRow ? -1 : 1;
      for (let k = 1; k <= WIRE_LENGTH; k++) {
        this.placeWire(this.exitCol - k, this.sideGateRow + out * k, out < 0 ? -Math.PI * 0.75 : Math.PI * 0.75);
        this.placeWire(this.exitCol + k, this.sideGateRow + out * k, out < 0 ? -Math.PI * 0.25 : Math.PI * 0.25);
      }
    }
  }

  /**
   * 這個 size×size 的範圍能不能蓋建築：全部是營地裡的空地、不在小路和出口安全區上 (can a size×size building go here)
   * @returns {boolean}
   */
  canBuild(col, row, size) {
    for (let dRow = 0; dRow < size; dRow++) {
      for (let dCol = 0; dCol < size; dCol++) {
        const c = col + dCol;
        const r = row + dRow;
        if (!this.isInside(c, r)) return false;
        if (this.tiles[r][c] !== 'empty' || this.ground[r][c] !== 'camp') return false;
        if (this.isInSafeZone(c, r)) return false;
      }
    }
    return true;
  }

  /**
   * 放一段鐵絲網；小路、橋、安全區、已經有東西的格子不放 (place one wire tile, keeping trails & safe zones clear)
   * @param {number} col 欄
   * @param {number} row 列
   * @param {number} angle 鐵絲網的方向（畫圖用）(direction, for drawing)
   */
  placeWire(col, row, angle) {
    if (!this.isInside(col, row)) return;
    if (this.tiles[row][col] !== 'empty') return;
    if (this.ground[row][col] === 'path' || this.ground[row][col] === 'bridge') return;
    if (this.isInSafeZone(col, row)) return;
    this.setTile(col, row, 'wire');
    this.wireAngles[`${col},${row}`] = angle;
  }

  /**
   * 營地裡的補給箱：放在沙包牆內側一圈，避開小路和出口 (supply crates inside the camp)
   */
  placeCampCrates() {
    const candidates = [];
    // 牆內側那一圈 (the ring just inside the wall)
    const innerW = this.campHalfW - 1;
    const innerH = this.campHalfH - 1;
    for (let row = this.exitRow - innerH; row <= this.exitRow + innerH; row++) {
      for (let col = this.exitCol - innerW; col <= this.exitCol + innerW; col++) {
        if (!this.isInside(col, row)) continue;
        const onInnerRing = Math.abs(col - this.exitCol) === innerW || Math.abs(row - this.exitRow) === innerH;
        if (!onInnerRing) continue;
        if (this.ground[row][col] !== 'camp') continue;      // 小路經過的格子不放 (keep the trail clear)
        if (this.tiles[row][col] !== 'empty') continue;
        candidates.push({ col, row });
      }
    }
    for (let i = 0; i < CAMP_CRATE_COUNT && candidates.length > 0; i++) {
      const index = randomInt(candidates.length);
      const tile = candidates.splice(index, 1)[0];
      this.setTile(tile.col, tile.row, 'crate');
    }
  }

  /**
   * 叢林樹叢：每叢一個圓形範圍，越靠中心越密；每一格可能是草叢或棕櫚樹 (jungle groves: bushes mixed with palm trees)
   */
  placeGroves() {
    for (let i = 0; i < GROVE_COUNT; i++) {
      const center = this.pickOpenSpot();
      if (center === null) continue;
      const radius = GROVE_RADIUS_MIN + Math.random() * (GROVE_RADIUS_MAX - GROVE_RADIUS_MIN);
      const reach = Math.ceil(radius);

      for (let row = center.row - reach; row <= center.row + reach; row++) {
        for (let col = center.col - reach; col <= center.col + reach; col++) {
          const distance = Math.hypot(col - center.col, row - center.row);
          if (distance > radius) continue;
          // 中心機率最高，邊緣大約剩一半 (probability fades toward the edge)
          const chance = GROVE_DENSITY * (1 - (distance / radius) * 0.5);
          if (Math.random() < chance && this.canPlace(col, row)) {
            this.setTile(col, row, Math.random() < GROVE_BUSH_RATIO ? 'bush' : 'tree');
          }
        }
      }
    }
  }

  /**
   * 石頭堆：每堆 1 ~ ROCK_PILE_SIZE 顆，擠在一起 (rock piles of 1~N rocks)
   */
  placeRockPiles() {
    for (let i = 0; i < ROCK_PILE_COUNT; i++) {
      const center = this.pickOpenSpot();
      if (center === null) continue;
      const count = 1 + randomInt(ROCK_PILE_SIZE);
      for (let k = 0; k < count; k++) {
        const col = center.col + randomInt(3) - 1;
        const row = center.row + randomInt(3) - 1;
        if (this.canPlace(col, row)) {
          this.setTile(col, row, 'rock');
        }
      }
    }
  }

  /**
   * 散落的小草叢：從一格開始，往旁邊隨機長出幾格 (small bush patches that grow from one tile)
   */
  placeBushPatches() {
    for (let i = 0; i < BUSH_PATCH_COUNT; i++) {
      const start = this.pickOpenSpot();
      if (start === null) continue;
      let col = start.col;
      let row = start.row;
      const size = 1 + randomInt(BUSH_PATCH_SIZE);
      for (let k = 0; k < size; k++) {
        if (this.canPlace(col, row)) this.setTile(col, row, 'bush');
        const dir = DIRECTIONS[randomInt(DIRECTIONS.length)];
        col += dir.dCol;
        row += dir.dRow;
      }
    }
  }

  /**
   * 隨機找一格可以放東西的位置，最多試 30 次 (find a random open tile, up to 30 tries)
   * @returns {{col: number, row: number}|null}
   */
  pickOpenSpot() {
    for (let tries = 0; tries < 30; tries++) {
      const col = randomInt(MAP_COLS);
      const row = randomInt(MAP_ROWS);
      if (this.canPlace(col, row)) return { col, row };
    }
    return null;
  }

  /**
   * 在隨機的空草地放指定數量的物件 (place objects on random open grass)
   * @param {string} type tile 種類，例如 'crate'
   * @param {number} count 要放幾個
   */
  placeRandom(type, count) {
    let placed = 0;
    let tries = 0;
    // tries 上限：避免空格不夠時變成無窮迴圈 (avoid infinite loop)
    while (placed < count && tries < count * 20) {
      tries++;
      const col = randomInt(MAP_COLS);
      const row = randomInt(MAP_ROWS);
      if (!this.canPlace(col, row)) continue;
      this.setTile(col, row, type);
      placed++;
    }
  }

  /**
   * 在小路上埋幾個陷阱：走捷徑的人要小心 (hide a few traps on the trail)
   */
  placeTrailTraps() {
    const candidates = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (this.ground[row][col] !== 'path') continue;
        if (this.tiles[row][col] !== 'empty') continue;
        if (this.isInSafeZone(col, row)) continue;
        candidates.push({ col, row });
      }
    }
    for (let i = 0; i < TRAIL_TRAP_COUNT && candidates.length > 0; i++) {
      const tile = candidates.splice(randomInt(candidates.length), 1)[0];
      this.setTile(tile.col, tile.row, 'trap');
    }
  }

  /**
   * 設定某一格的種類；箱子要順便設定耐久度 (set a tile; crates also get durability)
   */
  setTile(col, row, type) {
    this.tiles[row][col] = type;
    if (type === 'crate') {
      this.crateHp[row][col] = CRATE_HP;
    }
  }

  /**
   * 這格是否在安全區：玩家出生點附近或出口附近 (is this tile near the spawn or the exit)
   * @param {number} col 欄
   * @param {number} row 列
   * @returns {boolean}
   */
  isInSafeZone(col, row) {
    const nearSpawn =
      Math.abs(col - PLAYER_SPAWN_COL) <= SAFE_ZONE_RADIUS &&
      Math.abs(row - PLAYER_SPAWN_ROW) <= SAFE_ZONE_RADIUS;
    const nearExit =
      Math.abs(col - this.exitCol) <= EXIT_SAFE_RADIUS &&
      Math.abs(row - this.exitRow) <= EXIT_SAFE_RADIUS;
    return nearSpawn || nearExit;
  }

  /**
   * 這格是否在營地範圍（沙包牆以內，含牆）(is this tile inside the camp)
   * @returns {boolean}
   */
  isInCamp(col, row) {
    return (
      Math.abs(col - this.exitCol) <= this.campHalfW &&
      Math.abs(row - this.exitRow) <= this.campHalfH
    );
  }

  // ===== 營地中心 (camp center) =====



  /**
   * 營地中心的像素座標 (camp center in pixels)
   * @returns {{x: number, y: number}}
   */
  getCampCenter() {
    return {
      x: this.exitCol * TILE_SIZE + TILE_SIZE / 2,
      y: this.exitRow * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  /**
   * 正門（營地最左邊那一欄，面向玩家）在第幾欄 (column of the front gate: the camp's left edge, facing the player)
   * @returns {number}
   */
  get frontGateCol() {
    return this.exitCol - this.campHalfW;
  }

  // ===== BFS 連通性檢查 (connectivity check) =====

  /**
   * 用 BFS 從出生點往外走，找出哪些格子走得到 (BFS flood fill from the spawn)
   * @returns {boolean[][]} reached[row][col]：這格走不走得到
   */
  findReachableTiles() {
    // reached[row][col]：這格是否已經走過 (visited table)
    const reached = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      reached.push(new Array(MAP_COLS).fill(false));
    }

    // 從出生點開始 (start from spawn)
    const queue = [{ col: PLAYER_SPAWN_COL, row: PLAYER_SPAWN_ROW }];
    reached[PLAYER_SPAWN_ROW][PLAYER_SPAWN_COL] = true;

    while (queue.length > 0) {
      // 取出排最前面的格子 (take the first tile in line)
      const current = queue.shift();

      // 檢查上下左右四個鄰居 (check 4 neighbours)
      for (const dir of DIRECTIONS) {
        const col = current.col + dir.dCol;
        const row = current.row + dir.dRow;

        if (!this.isInside(col, row)) continue;          // 超出地圖
        if (reached[row][col]) continue;                  // 走過了
        if (this.blocksMovementAt(col, row)) continue;    // 走不過去

        reached[row][col] = true;
        queue.push({ col, row });
      }
    }
    return reached;
  }

  /**
   * 確認地圖可以玩：小路、橋、營地、出口都要走得到 (make sure the map is playable)
   * 樹叢很密的時候，偶爾會圍出一小塊走不進去的空地；與其整張重來，
   * 不如在那一小塊也種滿樹，看起來就是一片更密的叢林 (fill small sealed-off pockets with trees)
   * 但如果被圍住的是小路、橋、營地或出口，這張地圖就不能用，回傳 false 重新生成。
   * @returns {boolean} 地圖可以用回傳 true
   */
  sealUnreachablePockets() {
    const reached = this.findReachableTiles();

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (reached[row][col] || this.blocksMovementAt(col, row)) continue;

        // 走不到的空地：重要的地方被圍住就失敗，普通草地就種樹 (important tile cut off → fail; grass → tree)
        const important = this.ground[row][col] !== 'grass' || this.isInCamp(col, row);
        if (important) return false;
        this.setTile(col, row, 'tree');
      }
    }
    return true;
  }

  // ===== 查詢 (queries) =====

  /**
   * (col, row) 是否在地圖範圍內 (is inside the map)
   * @returns {boolean}
   */
  isInside(col, row) {
    return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS;
  }

  /**
   * 這格會不會擋住移動；地圖外面一律當作牆 (does this tile block movement)
   * @returns {boolean}
   */
  blocksMovementAt(col, row) {
    if (!this.isInside(col, row)) return true;
    return TILE_PROPS[this.tiles[row][col]].blocksMovement;
  }

  /**
   * 某個像素位置會不會擋住子彈；地圖外面一律擋住 (does this pixel block bullets)
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @returns {boolean}
   */
  blocksBulletAtPixel(x, y) {
    // 像素座標 ÷ 格子大小，無條件捨去 = 第幾格 (pixel → tile)
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (!this.isInside(col, row)) return true;
    return TILE_PROPS[this.tiles[row][col]].blocksBullet;
  }

  /**
   * 一個矩形範圍內有沒有任何擋路的格子 (does a box overlap any blocking tile)
   * @param {number} left 左邊界像素
   * @param {number} top 上邊界像素
   * @param {number} right 右邊界像素
   * @param {number} bottom 下邊界像素
   * @returns {boolean}
   */
  boxBlocksMovement(left, top, right, bottom) {
    const startCol = Math.floor(left / TILE_SIZE);
    const endCol = Math.floor(right / TILE_SIZE);
    const startRow = Math.floor(top / TILE_SIZE);
    const endRow = Math.floor(bottom / TILE_SIZE);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (this.blocksMovementAt(col, row)) return true;
      }
    }
    return false;
  }

  /**
   * 某個像素位置是不是陷阱 (is there a trap at this pixel)
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @returns {boolean}
   */
  isTrapAtPixel(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (!this.isInside(col, row)) return false;
    return this.tiles[row][col] === 'trap';
  }

  /**
   * 某個像素位置是不是鐵絲網 (is there barbed wire at this pixel)
   * @returns {boolean}
   */
  isWireAtPixel(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (!this.isInside(col, row)) return false;
    return this.tiles[row][col] === 'wire';
  }

  /**
   * 一個圓形（半徑 radius）能不能沿著直線從 A 走到 B，中間不會撞到東西 (can a body of this radius walk straight from A to B)
   * 每 8px 檢查一次身體的方框 (checks the body's box every 8 px along the line)
   * @returns {boolean}
   */
  isClearWalk(fromX, fromY, toX, toY, radius) {
    const distance = Math.hypot(toX - fromX, toY - fromY);
    const steps = Math.max(1, Math.ceil(distance / 8));
    const r = radius + 1;
    for (let i = 1; i <= steps; i++) {
      const x = fromX + ((toX - fromX) * i) / steps;
      const y = fromY + ((toY - fromY) * i) / steps;
      if (this.boxBlocksMovement(x - r, y - r, x + r, y + r)) return false;
    }
    return true;
  }

  /**
   * 某個像素位置是不是草叢 (is there a bush at this pixel)
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @returns {boolean}
   */
  isBushAtPixel(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (!this.isInside(col, row)) return false;
    return this.tiles[row][col] === 'bush';
  }

  /**
   * 某個像素位置是哪一種 tile；地圖外面回傳 'rock'（當作牆）(tile type at pixel)
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @returns {string}
   */
  getTileAtPixel(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (!this.isInside(col, row)) return 'rock';
    return this.tiles[row][col];
  }

  /**
   * 某個像素所在格子的代號，例如 "5,3"，用來記錄「打過哪些格子」(tile key, e.g. "5,3")
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @returns {string}
   */
  getTileKeyAtPixel(x, y) {
    return `${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`;
  }

  /**
   * 對某一格造成傷害；只有箱子會受傷，耐久度歸零就變成空地 (damage a crate)
   * 箱子被打破時，把位置記到 brokenCrates，讓 game.js 決定要不要掉彈藥。
   * @param {number} col 欄
   * @param {number} row 列
   * @param {number} damage 傷害量
   */
  damageTile(col, row, damage) {
    if (!this.isInside(col, row)) return;
    if (this.tiles[row][col] !== 'crate') return;

    this.crateHp[row][col] -= damage;
    if (this.crateHp[row][col] <= 0) {
      this.tiles[row][col] = 'empty'; // 箱子被打破 (crate destroyed)
      this.brokenCrates.push({
        x: col * TILE_SIZE + TILE_SIZE / 2,
        y: row * TILE_SIZE + TILE_SIZE / 2,
      });
    }
  }

  /**
   * 對某個像素位置的格子造成傷害 (damage the tile at a pixel)
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @param {number} damage 傷害量
   */
  damageTileAtPixel(x, y, damage) {
    this.damageTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE), damage);
  }

  /**
   * 爆炸：對範圍內所有箱子造成傷害（格子中心在半徑內才算）(damage crates in a radius)
   * @param {number} x 爆炸中心 x
   * @param {number} y 爆炸中心 y
   * @param {number} radius 爆炸半徑
   * @param {number} damage 傷害量
   */
  damageTilesInRadius(x, y, radius, damage) {
    // 只檢查爆炸範圍的外框方格，不用跑整張地圖 (only check the bounding box)
    const startCol = Math.floor((x - radius) / TILE_SIZE);
    const endCol = Math.floor((x + radius) / TILE_SIZE);
    const startRow = Math.floor((y - radius) / TILE_SIZE);
    const endRow = Math.floor((y + radius) / TILE_SIZE);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const centerX = col * TILE_SIZE + TILE_SIZE / 2;
        const centerY = row * TILE_SIZE + TILE_SIZE / 2;
        if (Math.hypot(centerX - x, centerY - y) <= radius) {
          this.damageTile(col, row, damage);
        }
      }
    }
  }

  /**
   * 兩點之間的視線有沒有被擋住（用「會不會擋子彈」判斷）(line of sight check)
   * 做法：沿著兩點連線，每隔 LOS_STEP px 檢查一次那個位置。
   * @param {number} x1 起點 x
   * @param {number} y1 起點 y
   * @param {number} x2 終點 x
   * @param {number} y2 終點 y
   * @returns {boolean} 沒被擋住回傳 true
   */
  hasLineOfSight(x1, y1, x2, y2) {
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(distance / LOS_STEP);

    for (let i = 1; i < steps; i++) {
      // t 從 0 到 1，代表走到連線的幾分之幾 (t = progress along the line)
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (this.blocksBulletAtPixel(x, y)) return false;
    }
    return true;
  }

  /**
   * 敵人的視線：跟 hasLineOfSight 一樣，但草叢也會擋住 (enemy sight line: like hasLineOfSight, but bushes block too)
   * 起點那一格的草叢不算，所以躲在草叢裡的敵人還是看得到外面 (the bush you stand in doesn't block your own view)
   * 終點在草叢裡的話會被擋住，所以玩家躲進草叢就看不到 (a target inside a bush is hidden)
   * @param {number} x1 起點 x（看的人）(viewer x)
   * @param {number} y1 起點 y
   * @param {number} x2 終點 x（被看的人）(target x)
   * @param {number} y2 終點 y
   * @returns {boolean} 看得到回傳 true
   */
  hasSightLine(x1, y1, x2, y2) {
    const startKey = this.getTileKeyAtPixel(x1, y1);
    const distance = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(distance / LOS_STEP);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const col = Math.floor(x / TILE_SIZE);
      const row = Math.floor(y / TILE_SIZE);
      if (!this.isInside(col, row)) return false;
      if (this.getTileKeyAtPixel(x, y) === startKey) continue; // 自己站的那一格不算 (skip the viewer's own tile)
      if (TILE_PROPS[this.tiles[row][col]].blocksSight) return false;
    }
    return true;
  }

  /**
   * 挑選敵人的出生位置：全部守在營地裡，而且盡量分散開來 (enemy spawn points: all inside the camp, spread out)
   * 做法叫「最遠點取樣」：每次挑「離已經挑好的點最遠」的格子，敵人就不會擠成一團。
   * (farthest-point sampling: each new spot is the one farthest from the spots already chosen)
   * 第一個位置在最靠近出口的地方，BOSS 關會把 BOSS 放在這裡守著營地中心 (the first spot is at the camp center, for the boss)
   * @param {number} count 要幾個位置
   * @returns {{x: number, y: number}[]} 像素座標陣列
   */
  getEnemySpawnPositions(count) {
    const candidates = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (!this.isInCamp(col, row)) continue;
        if (this.tiles[row][col] !== 'empty') continue;
        if (col === this.exitCol && row === this.exitRow) continue; // 不要生在出口上 (not on the exit)
        candidates.push({ col, row });
      }
    }

    const chosen = [];
    // 第一個：離出口最近的格子 (first: the tile closest to the exit)
    candidates.sort((a, b) =>
      Math.hypot(a.col - this.exitCol, a.row - this.exitRow) - Math.hypot(b.col - this.exitCol, b.row - this.exitRow));
    if (candidates.length > 0) chosen.push(candidates.shift());

    while (chosen.length < count && candidates.length > 0) {
      // 每個候選格子到「最近的已選位置」的距離，挑這個距離最大的（加一點隨機，不會每次都一樣）
      // (distance to the nearest chosen spot; pick the largest, with a bit of randomness)
      let bestIndex = 0;
      let bestScore = -1;
      for (let i = 0; i < candidates.length; i++) {
        let nearest = Infinity;
        for (const spot of chosen) {
          nearest = Math.min(nearest, Math.hypot(candidates[i].col - spot.col, candidates[i].row - spot.row));
        }
        const score = nearest + Math.random() * 0.8;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      chosen.push(candidates.splice(bestIndex, 1)[0]);
    }

    return chosen.map((tile) => this.tileCenter(tile.col, tile.row));
  }

  /**
   * 營地前面可以蓋瞭望塔的位置（還空著的才算），越前面、越靠近正門的排越前面
   * 正門在營地左邊（面向玩家），塔蓋在正門外 2 格那一排，跟沙包牆隔一格；避開門口的小路和鐵絲網漏斗
   * (free spots for watchtowers in front of the camp, nearest the front gate first. The front gate faces the player on
   *  the left; towers stand 2 tiles out, one tile clear of the wall, away from the trail and the wire funnel)
   * @returns {{col: number, row: number}[]}
   */
  getFrontTowerSpots() {
    const gateCol = this.frontGateCol;
    const spots = [];
    // 一對一對：上下兩邊對稱，先放靠近門口的那一對 (in pairs, top and bottom, the pair nearest the gate first)
    for (const dRow of [3, 5]) {
      const pair = [];
      for (const side of [-1, 1]) {
        const col = gateCol - 2;
        const row = this.exitRow + side * dRow;
        if (!this.isInside(col, row) || this.tiles[row][col] !== 'empty') continue;
        if (this.ground[row][col] !== 'grass' || this.isInSafeZone(col, row)) continue;
        pair.push({ col, row });
      }
      if (pair.length === 2 && Math.random() < 0.5) pair.reverse();
      spots.push(...pair);
    }
    return spots;
  }

  /**
   * 讓狙擊手上瞭望塔：挑還沒架砲塔的瞭望塔；不夠的話，在營地前面多蓋幾座
   * (put snipers up in watchtowers: use free towers; if there aren't enough, build more in front of the camp)
   * @param {number} count 要幾個狙擊手位置 (how many sniper posts)
   * @returns {{x: number, y: number}[]} 塔頂的位置（格子正中央）(tower-top positions)
   */
  claimSniperTowers(count) {
    const free = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (this.tiles[row][col] === 'tower') free.push({ col, row });
      }
    }
    // 瞭望塔不夠：在營地前面補蓋；蓋了會擋住出生點到營地的路就不蓋 (not enough: build more in front, unless it would cut off the camp)
    const spawn = this.getSpawnPosition();
    const gate = this.tileCenter(this.frontGateCol, this.exitRow);
    for (const spot of this.getFrontTowerSpots()) {
      if (free.length >= count) break;
      this.tiles[spot.row][spot.col] = 'tower';
      if (this.findPath(spawn.x, spawn.y, gate.x, gate.y).length === 0) {
        this.tiles[spot.row][spot.col] = 'empty';
        continue;
      }
      free.push(spot);
    }
    const posts = [];
    while (posts.length < count && free.length > 0) {
      const spot = free.splice(randomInt(free.length), 1)[0];
      this.tiles[spot.row][spot.col] = 'towerSniper';
      posts.push(this.tileCenter(spot.col, spot.row));
    }
    return posts;
  }

  /**
   * 伏擊兵的出生點：營地外、離玩家夠遠的空地，優先選地圖邊緣（從叢林深處衝出來）
   * (ambush spawn points: outside the camp, far from the player, preferring the map edges)
   * @param {number} count 要幾個
   * @param {number} playerX 玩家 x
   * @param {number} playerY 玩家 y
   * @returns {{x: number, y: number}[]}
   */
  getWaveSpawns(count, playerX, playerY) {
    const playerCol = Math.floor(playerX / TILE_SIZE);
    const playerRow = Math.floor(playerY / TILE_SIZE);
    const edge = [];
    const inner = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (this.tiles[row][col] !== 'empty' && this.tiles[row][col] !== 'bush') continue;
        if (this.isInCamp(col, row)) continue;
        if (Math.hypot(col - playerCol, row - playerRow) < WAVE_MIN_DISTANCE) continue;
        const onEdge = col <= 1 || row <= 1 || col >= MAP_COLS - 2 || row >= MAP_ROWS - 2;
        (onEdge ? edge : inner).push({ col, row });
      }
    }
    const spots = [];
    for (let i = 0; i < count; i++) {
      const pool = edge.length > 0 ? edge : inner;
      if (pool.length === 0) break;
      const tile = pool.splice(randomInt(pool.length), 1)[0];
      spots.push(this.tileCenter(tile.col, tile.row));
    }
    return spots;
  }

  /**
   * 巡邏路線：營地外面隨機幾個點，離玩家出生點夠遠 (a patrol route: random points outside the camp, away from the player)
   * @param {number} pointCount 幾個點 (number of waypoints)
   * @returns {{x: number, y: number}[]}
   */
  getPatrolRoute(pointCount) {
    const candidates = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (this.tiles[row][col] !== 'empty') continue;
        if (this.isInCamp(col, row)) continue;
        if (Math.hypot(col - PLAYER_SPAWN_COL, row - PLAYER_SPAWN_ROW) < ENEMY_MIN_SPAWN_DISTANCE) continue;
        candidates.push({ col, row });
      }
    }
    const route = [];
    for (let i = 0; i < pointCount && candidates.length > 0; i++) {
      const tile = candidates.splice(randomInt(candidates.length), 1)[0];
      route.push(this.tileCenter(tile.col, tile.row));
    }
    return route;
  }

  /**
   * 找路：用 BFS 從起點走到終點，回傳沿途每一格的中心點；走不到回傳空陣列 (BFS path-finding between two pixel positions)
   * BFS 一圈一圈往外找，第一次碰到終點時，那條路一定是最短的（以格子數計算）(BFS finds a shortest path in tiles)
   * @param {number} fromX 起點 x
   * @param {number} fromY 起點 y
   * @param {number} toX 終點 x
   * @param {number} toY 終點 y
   * @returns {{x: number, y: number}[]} 不含起點的路徑 (path without the start tile)
   */
  findPath(fromX, fromY, toX, toY) {
    const startCol = Math.floor(fromX / TILE_SIZE);
    const startRow = Math.floor(fromY / TILE_SIZE);
    const goalCol = Math.floor(toX / TILE_SIZE);
    const goalRow = Math.floor(toY / TILE_SIZE);
    if (!this.isInside(startCol, startRow) || this.blocksMovementAt(goalCol, goalRow)) return [];

    // cameFrom[row][col]：從哪一格走到這一格，最後倒著走回去就是路線 (where we came from, to rebuild the path)
    const cameFrom = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      cameFrom.push(new Array(MAP_COLS).fill(null));
    }
    const queue = [{ col: startCol, row: startRow }];
    cameFrom[startRow][startCol] = { col: startCol, row: startRow };

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.col === goalCol && current.row === goalRow) break;
      for (const dir of DIRECTIONS) {
        const col = current.col + dir.dCol;
        const row = current.row + dir.dRow;
        if (!this.isInside(col, row) || cameFrom[row][col] !== null) continue;
        if (this.blocksMovementAt(col, row)) continue;
        cameFrom[row][col] = current;
        queue.push({ col, row });
      }
    }
    if (cameFrom[goalRow][goalCol] === null) return [];

    // 從終點沿著 cameFrom 倒著走回起點，再反轉順序 (walk back from the goal, then reverse)
    const path = [];
    let col = goalCol;
    let row = goalRow;
    while (col !== startCol || row !== startRow) {
      path.push(this.tileCenter(col, row));
      const previous = cameFrom[row][col];
      col = previous.col;
      row = previous.row;
    }
    return path.reverse();
  }

  /**
   * 離某個點最近、可以走的格子（從那一格一圈一圈往外找）(the nearest walkable tile to a point, searching outward)
   * @param {number} x 像素 x
   * @param {number} y 像素 y
   * @returns {{x: number, y: number}|null}
   */
  nearestWalkable(x, y) {
    const col = Math.max(0, Math.min(MAP_COLS - 1, Math.floor(x / TILE_SIZE)));
    const row = Math.max(0, Math.min(MAP_ROWS - 1, Math.floor(y / TILE_SIZE)));
    for (let radius = 0; radius <= 6; radius++) {
      for (let dRow = -radius; dRow <= radius; dRow++) {
        for (let dCol = -radius; dCol <= radius; dCol++) {
          // 只看這一圈的外框 (only the outline of this ring)
          if (Math.max(Math.abs(dCol), Math.abs(dRow)) !== radius) continue;
          const c = col + dCol;
          const r = row + dRow;
          // 不要選在鐵絲網或陷阱上 (don't pick a wire or trap tile)
          if (this.isInside(c, r) && !this.blocksMovementAt(c, r) && this.tiles[r][c] !== 'wire' && this.tiles[r][c] !== 'trap') {
            return this.tileCenter(c, r);
          }
        }
      }
    }
    return null;
  }

  /**
   * 某一格中心的像素座標 (pixel center of a tile)
   * @returns {{x: number, y: number}}
   */
  tileCenter(col, row) {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }

  /**
   * 營地裡的空地，放情報和人質用；不放在出口上 (empty tiles inside the camp, for intel & hostages)
   * @param {number} count 要幾個位置
   * @returns {{x: number, y: number}[]} 像素座標陣列
   */
  getCampSpots(count) {
    const candidates = [];
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (!this.isInCamp(col, row)) continue;
        if (this.tiles[row][col] !== 'empty') continue;
        if (col === this.exitCol && row === this.exitRow) continue;
        candidates.push({ col, row });
      }
    }
    const spots = [];
    for (let i = 0; i < count && candidates.length > 0; i++) {
      const tile = candidates.splice(randomInt(candidates.length), 1)[0];
      spots.push({ x: tile.col * TILE_SIZE + TILE_SIZE / 2, y: tile.row * TILE_SIZE + TILE_SIZE / 2 });
    }
    return spots;
  }

  /**
   * 玩家出生點的像素座標（格子正中央）(spawn position in pixels)
   * @returns {{x: number, y: number}}
   */
  getSpawnPosition() {
    return {
      x: PLAYER_SPAWN_COL * TILE_SIZE + TILE_SIZE / 2,
      y: PLAYER_SPAWN_ROW * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  // ===== 繪製 (drawing) =====
  // 以下畫圖用的小數字（顏色、半徑、比例）只影響外觀，不影響遊戲平衡，所以直接寫在這裡。

  /**
   * 畫出鏡頭看得到的那一塊地圖 (draw the part of the map the camera can see)
   * 呼叫前，畫筆已經被 game.js 移到「世界座標」，所以這裡直接用地圖上的像素位置畫。
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {number} cameraX 鏡頭左上角 x (camera left)
   * @param {number} cameraY 鏡頭左上角 y (camera top)
   * @param {number} time 遊戲經過秒數，水波和停機坪燈號的動畫用 (seconds, for animations)
   */
  draw(ctx, cameraX, cameraY, time) {
    this.drawTime = time; // 營火的火焰動畫用 (for the campfire flames)
    this.drawGround(ctx, cameraX, cameraY);

    // 只畫畫面內的格子，左右上下多畫一格，樹冠超出格子才不會被切掉 (visible tiles only, +1 margin)
    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
    const endCol = Math.min(MAP_COLS - 1, Math.floor((cameraX + VIEW_WIDTH) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
    const endRow = Math.min(MAP_ROWS - 1, Math.floor((cameraY + VIEW_HEIGHT) / TILE_SIZE) + 1);

    this.drawWaterShimmer(ctx, startCol, endCol, startRow, endRow, time);
    this.drawBuildings(ctx);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const type = this.tiles[row][col];
        if (type === 'empty' || type === 'water' || type === 'bush') continue; // 草叢等角色畫完再畫 (bushes later)
        if (type === 'bunker' || type === 'bunkerTurret' || type === 'tent' || type === 'hut') continue; // 2×2 建築整棟一起畫 (2x2 buildings are drawn whole)
        this.drawTile(ctx, type, col, row);
      }
    }
  }

  /**
   * 畫指揮碉堡：一張圖蓋滿 2×2 格；砲塔是敵人，之後會畫在屋頂上 (draw each bunker as one 2x2 image; turrets are drawn on top later)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   */
  drawBuildings(ctx) {
    for (const building of this.buildings) {
      const image = getImage(building.type ?? 'bunker');
      const x = building.col * TILE_SIZE;
      const y = building.row * TILE_SIZE;
      if (image !== null) {
        ctx.drawImage(image, x - 4, y - 4, TILE_SIZE * 2 + 8, TILE_SIZE * 2 + 8);
      } else {
        ctx.fillStyle = '#9aa0a6';
        ctx.fillRect(x, y, TILE_SIZE * 2, TILE_SIZE * 2);
        ctx.strokeStyle = '#5d6268';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, TILE_SIZE * 2, TILE_SIZE * 2);
      }
    }
  }

  /**
   * 畫草叢：在角色「之後」畫，躲在裡面的人才會被蓋住 (draw bushes AFTER characters so they cover whoever hides inside)
   * 玩家在草叢附近時，那叢變半透明，玩家才看得到自己 (bushes near the player turn see-through)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {number} cameraX 鏡頭左上角 x
   * @param {number} cameraY 鏡頭左上角 y
   * @param {{x: number, y: number}} player 玩家位置
   */
  drawBushes(ctx, cameraX, cameraY, player) {
    const startCol = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
    const endCol = Math.min(MAP_COLS - 1, Math.floor((cameraX + VIEW_WIDTH) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
    const endRow = Math.min(MAP_ROWS - 1, Math.floor((cameraY + VIEW_HEIGHT) / TILE_SIZE) + 1);
    const image = getImage('bush');

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (this.tiles[row][col] !== 'bush') continue;
        const cx = col * TILE_SIZE + TILE_SIZE / 2;
        const cy = row * TILE_SIZE + TILE_SIZE / 2;
        const nearPlayer = Math.hypot(player.x - cx, player.y - cy) < TILE_SIZE;
        ctx.globalAlpha = nearPlayer ? BUSH_SEE_THROUGH_ALPHA : 1;
        if (image !== null) {
          drawImageRotated(ctx, image, cx, cy, TILE_SIZE * 1.35, tileHash(col, row) * Math.PI * 2);
        } else {
          drawBush(ctx, cx, cy);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * 畫一個障礙物格子：有美術圖片就畫圖片，沒有就用圖形 (draw one obstacle tile: sprite or shapes)
   * tile 的種類名稱（'rock'、'crate'…）剛好就是圖片名稱 (tile type = image name)
   */
  drawTile(ctx, type, col, row) {
    const x = col * TILE_SIZE;   // 格子左上角 (tile top-left)
    const y = row * TILE_SIZE;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;

    if (type === 'sandbag' || type === 'palisade') {
      this.drawSandbag(ctx, col, row, type);
      return;
    }
    if (type === 'campfire') {
      drawCampfire(ctx, cx, cy, this.drawTime ?? 0);
      return;
    }

    // 圖片名稱大多跟 tile 種類一樣；架了砲塔的瞭望塔還是用瞭望塔的圖 (image name = tile type; a turret tower uses the tower image)
    const image = getImage(type === 'towerTurret' || type === 'towerSniper' ? 'tower' : type);
    if (image !== null) {
      if (type === 'tree') {
        // 樹冠畫得比格子大一點，每棵轉不同角度，看起來才像茂密的叢林 (bigger, randomly rotated canopy)
        drawImageRotated(ctx, image, cx, cy, TILE_SIZE * 1.45, tileHash(col, row) * Math.PI * 2);
      } else if (type === 'rock') {
        drawImageRotated(ctx, image, cx, cy, TILE_SIZE * 1.12, Math.floor(tileHash(col, row) * 4) * Math.PI / 2);
      } else if (type === 'tower' || type === 'towerTurret' || type === 'towerSniper') {
        ctx.drawImage(image, cx - TILE_SIZE * 0.8, cy - TILE_SIZE * 0.8, TILE_SIZE * 1.6, TILE_SIZE * 1.6);
      } else if (type === 'wire') {
        // 鐵絲網順著漏斗的方向斜放 (wire follows the funnel direction)
        drawImageRotated(ctx, image, cx, cy, TILE_SIZE * 1.3, this.wireAngles[`${col},${row}`] ?? 0);
      } else {
        ctx.drawImage(image, x, y, TILE_SIZE, TILE_SIZE);
      }
    } else if (type === 'crate') {
      drawCrate(ctx, x, y);
    } else if (type === 'rock') {
      drawRock(ctx, x, y);
    } else if (type === 'tree') {
      drawTree(ctx, x, y);
    } else if (type === 'trap') {
      drawTrap(ctx, x, y);
    } else if (type === 'tower' || type === 'towerTurret' || type === 'towerSniper') {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(x - 4, y - 4, TILE_SIZE + 8, TILE_SIZE + 8);
    } else if (type === 'wire') {
      ctx.strokeStyle = '#aab2ba';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 8, TILE_SIZE - 8, TILE_SIZE - 16);
    }

    // 箱子被打到剩一半以下，畫上裂痕 (cracks on a damaged crate)
    if (type === 'crate' && this.crateHp[row][col] < CRATE_HP / 2) {
      ctx.strokeStyle = 'rgba(30, 20, 10, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 6);
      ctx.lineTo(x + 14, y + 15);
      ctx.lineTo(x + 11, y + 22);
      ctx.moveTo(x + 14, y + 15);
      ctx.lineTo(x + 22, y + 17);
      ctx.stroke();
    }
  }

  /**
   * 沙包牆：左右有鄰居就橫著排，不然直著排；有圖片的話直的就轉 90 度 (sandbags follow the wall direction)
   */
  drawSandbag(ctx, col, row, type = 'sandbag') {
    const cx = col * TILE_SIZE + TILE_SIZE / 2;
    const cy = row * TILE_SIZE + TILE_SIZE / 2;
    const isSandbag = (c, r) => this.isInside(c, r) && this.tiles[r][c] === type;
    const horizontal = isSandbag(col - 1, row) || isSandbag(col + 1, row);

    ctx.save();
    ctx.translate(cx, cy);
    if (!horizontal) ctx.rotate(Math.PI / 2);

    const image = getImage(type);
    if (image !== null) {
      ctx.drawImage(image, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
    } else {
      // 兩排沙包，上排錯開半個，像真的疊起來 (two staggered rows of bags)
      const bags = [[-8, 6], [8, 6], [-16, -5], [0, -5], [16, -5]];
      for (const [bx, by] of bags) {
        ctx.fillStyle = by > 0 ? '#bfa56e' : '#d6bf88';
        ctx.beginPath();
        ctx.ellipse(bx, by, 8.5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7d6640';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * 河面上往下游流動的亮光，讓河看起來在流 (moving light streaks so the river flows)
   */
  drawWaterShimmer(ctx, startCol, endCol, startRow, endRow, time) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (this.tiles[row][col] !== 'water') continue;
        // 每格一條小亮線，位置隨時間往下移，超過格子就從上面重來 (one streak per tile, flowing down)
        const offset = ((time * 18 + tileHash(col, row) * TILE_SIZE) % TILE_SIZE);
        const x = col * TILE_SIZE + 6 + tileHash(row, col) * (TILE_SIZE - 12);
        const y = row * TILE_SIZE + offset;
        ctx.moveTo(x, y);
        ctx.lineTo(x, Math.min(y + 6, row * TILE_SIZE + TILE_SIZE));
      }
    }
    ctx.stroke();
  }


  /**
   * 貼上地面圖層中鏡頭看得到的那一塊 (draw the visible part of the ground layer)
   */
  drawGround(ctx, cameraX, cameraY) {
    // 地面圖層的解析度跟著畫面倍率，但最多 2 倍，避免手機記憶體不夠 (layer resolution, capped at 2x)
    const scale = Math.min(2.6, Math.max(1, ctx.getTransform().a));
    if (this.groundLayer === null || Math.abs(scale - this.groundLayerScale) > 0.01) {
      this.groundLayer = this.buildGroundLayer(scale);
      this.groundLayerScale = scale;
    }

    // drawImage 的 9 個參數版本：從圖層「剪下」一塊（來源），貼到畫面上（目的地）(crop source → destination)
    const sx = Math.max(0, cameraX);
    const sy = Math.max(0, cameraY);
    const sw = Math.min(VIEW_WIDTH + 1, WORLD_WIDTH - sx);
    const sh = Math.min(VIEW_HEIGHT + 1, WORLD_HEIGHT - sy);
    ctx.drawImage(
      this.groundLayer,
      sx * scale, sy * scale, sw * scale, sh * scale,
      sx, sy, sw, sh
    );
  }

  /**
   * 建立整張地圖的地面圖層：草地、營地、河、小路、橋、花草裝飾、邊緣的陰影 (build the ground layer once per stage)
   * 地面不會變，所以只畫一次存起來，之後每幀直接貼，就不用每幀畫幾千個小圓 (drawn once, reused every frame)
   * @param {number} scale 解析度倍率
   * @returns {HTMLCanvasElement}
   */
  buildGroundLayer(scale) {
    const layer = document.createElement('canvas');
    layer.width = Math.round(WORLD_WIDTH * scale);
    layer.height = Math.round(WORLD_HEIGHT * scale);
    const g = layer.getContext('2d');
    g.scale(scale, scale);

    // ----- 草地底色 + 深淺不一的斑塊 (grass base + mottled patches) -----
    g.fillStyle = '#5b9a3e';
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const patchColors = ['#4f8d36', '#66a644', '#548f38', '#6cae4b'];
    g.globalAlpha = 0.25;
    for (let i = 0; i < 420; i++) {
      fillEllipse(g, Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT,
        10 + Math.random() * 30, 6 + Math.random() * 16, patchColors[i % patchColors.length]);
    }
    g.globalAlpha = 1;

    // ----- 一格一格畫各種地表（每格畫幾個重疊的圓，相鄰的格子連起來就很自然）(per-tile blobs merge into shapes) -----
    const T = TILE_SIZE;
    this.forEachTile((col, row, cx, cy) => {
      if (this.ground[row][col] === 'camp') fillCircle(g, cx, cy, T * 0.75, '#a98b5b');
    });
    // 河和小路：把相鄰的格子用粗線連起來，形狀才會是平滑的一整條，而不是一顆一顆的圓 (connect neighbours with thick strokes)
    const isRiver = (col, row) => this.isInside(col, row) &&
      (this.tiles[row][col] === 'water' || this.ground[row][col] === 'bridge');
    const isTrail = (col, row) => this.isInside(col, row) && this.ground[row][col] === 'path';
    this.strokeConnected(g, isRiver, T * 1.55, '#c4ab70');   // 河岸沙地 (sandy bank)
    this.strokeConnected(g, isRiver, T * 1.2, '#2c7ea6');    // 深水 (deep water)
    this.strokeConnected(g, isTrail, T * 1.05, '#8a6a3c');   // 小路邊緣 (trail edge)
    this.strokeConnected(g, isTrail, T * 0.8, '#b9935c');    // 小路 (trail)

    // ----- 木橋：橫跨河面的木板 + 上下兩條扶手 (wooden bridges: planks + rails) -----
    for (const row of this.bridgeRows) {
      const left = (this.riverCols[row] - 0.35) * T;
      const width = (RIVER_WIDTH + 0.7) * T;
      const top = row * T + 3;
      const height = T - 6;
      g.fillStyle = '#9a6a38';
      g.fillRect(left, top, width, height);
      g.strokeStyle = '#6b4220';
      g.lineWidth = 1.5;
      for (let x = left + 6; x < left + width; x += 7) {
        g.beginPath();
        g.moveTo(x, top);
        g.lineTo(x, top + height);
        g.stroke();
      }
      g.fillStyle = '#5a3818';
      g.fillRect(left - 2, top - 2, width + 4, 4);
      g.fillRect(left - 2, top + height - 2, width + 4, 4);
    }

    // ----- 草地上的小裝飾：草叢、蕨類、花、落葉、小石子 (grass details: tufts, ferns, flowers, leaves, pebbles) -----
    this.forEachTile((col, row, cx, cy) => {
      if (this.ground[row][col] !== 'grass' || this.tiles[row][col] === 'water') return;
      const roll = Math.random();
      const x = cx + (Math.random() - 0.5) * 20;
      const y = cy + (Math.random() - 0.5) * 20;
      if (roll < 0.12) drawFern(g, x, y, 7 + Math.random() * 5);
      else if (roll < 0.2) drawFlowers(g, x, y);
      else if (roll < 0.26) drawPebbles(g, x, y);
      else if (roll < 0.3) fillEllipse(g, x, y, 9, 5, 'rgba(90, 70, 40, 0.45)'); // 泥巴 (mud)
      drawGrassTuft(g, cx + (Math.random() - 0.5) * 24, cy + (Math.random() - 0.5) * 24);
    });

    // ----- 地圖邊緣加深，像四周被濃密的叢林包圍 (darken the edges: dense jungle all around) -----
    shadeEdge(g, 0, 0, EDGE_SHADE, 0, 0, 0, EDGE_SHADE, WORLD_HEIGHT);
    shadeEdge(g, WORLD_WIDTH, 0, WORLD_WIDTH - EDGE_SHADE, 0, WORLD_WIDTH - EDGE_SHADE, 0, EDGE_SHADE, WORLD_HEIGHT);
    shadeEdge(g, 0, 0, 0, EDGE_SHADE, 0, 0, WORLD_WIDTH, EDGE_SHADE);
    shadeEdge(g, 0, WORLD_HEIGHT, 0, WORLD_HEIGHT - EDGE_SHADE, 0, WORLD_HEIGHT - EDGE_SHADE, WORLD_WIDTH, EDGE_SHADE);
    return layer;
  }

  /**
   * 把符合條件的格子畫成一條條粗線：每格畫一個圓，再往右、往下的鄰居各連一條線 (draw matching tiles as thick connected strokes)
   * 只連右邊和下面就夠了，因為左邊和上面的鄰居會從它們自己那格連過來 (right & down are enough; neighbours cover the rest)
   * @param {CanvasRenderingContext2D} g 畫筆
   * @param {function(number, number): boolean} matches 這格要不要畫 (does this tile belong to the shape)
   * @param {number} width 線的粗細 (stroke width)
   * @param {string} color 顏色
   */
  strokeConnected(g, matches, width, color) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    this.forEachTile((col, row, cx, cy) => {
      if (!matches(col, row)) return;
      // 一個點（長度 0 的線 + 圓頭）= 一個圓，單獨一格也畫得出來 (a zero-length round-capped line = a dot)
      g.moveTo(cx, cy);
      g.lineTo(cx + 0.01, cy);
      if (matches(col + 1, row)) {
        g.moveTo(cx, cy);
        g.lineTo(cx + TILE_SIZE, cy);
      }
      if (matches(col, row + 1)) {
        g.moveTo(cx, cy);
        g.lineTo(cx, cy + TILE_SIZE);
      }
    });
    g.stroke();
  }

  /**
   * 對每一格呼叫一次 callback，順便給格子中心的像素座標 (call back for every tile with its center)
   * @param {function(number, number, number, number)} callback (col, row, centerX, centerY)
   */
  forEachTile(callback) {
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        callback(col, row, col * TILE_SIZE + TILE_SIZE / 2, row * TILE_SIZE + TILE_SIZE / 2);
      }
    }
  }
}

// ----- 小工具 (drawing helpers) -----

/**
 * 以中心點畫一張旋轉過的圖 (draw an image rotated around its center)
 */
function drawImageRotated(ctx, image, cx, cy, size, angle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function fillCircle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function fillEllipse(g, x, y, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/**
 * 一小撮草：幾條往上的短線 (a grass tuft: a few short strokes)
 */
function drawGrassTuft(g, x, y) {
  g.strokeStyle = 'rgba(40, 95, 35, 0.6)';
  g.lineWidth = 1.2;
  g.beginPath();
  for (let i = -1; i <= 1; i++) {
    g.moveTo(x + i * 2, y);
    g.lineTo(x + i * 3.5, y - 5 - Math.abs(i));
  }
  g.stroke();
}

/**
 * 蕨類：從中心往外放射的幾片長葉子 (fern: leaves radiating from the center)
 */
function drawFern(g, x, y, size) {
  const start = Math.random() * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    const angle = start + (i / 6) * Math.PI * 2;
    g.fillStyle = i % 2 === 0 ? '#3c8a34' : '#47993c';
    g.beginPath();
    g.ellipse(x + Math.cos(angle) * size * 0.55, y + Math.sin(angle) * size * 0.55,
      size * 0.6, size * 0.2, angle, 0, Math.PI * 2);
    g.fill();
  }
}

/**
 * 一小叢花 (a little cluster of flowers)
 */
function drawFlowers(g, x, y) {
  const colors = ['#ff6b6b', '#ffd93d', '#ffffff', '#ff9ff3'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  for (let i = 0; i < 3; i++) {
    const fx = x + (Math.random() - 0.5) * 10;
    const fy = y + (Math.random() - 0.5) * 10;
    fillCircle(g, fx, fy, 2.2, color);
    fillCircle(g, fx, fy, 0.9, '#f5b800');
  }
}

/**
 * 幾顆小石子 (a few pebbles)
 */
function drawPebbles(g, x, y) {
  for (let i = 0; i < 3; i++) {
    fillEllipse(g, x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 8, 2.5, 1.8, '#9a9a8a');
  }
}

/**
 * 地圖邊緣的陰影：從邊緣的深綠漸層到透明 (edge shade: dark green fading inward)
 * @param {CanvasRenderingContext2D} g 畫筆
 * @param {number} x0 漸層起點 x（最暗）(gradient start, darkest)
 * @param {number} y0 漸層起點 y
 * @param {number} x1 漸層終點 x（透明）(gradient end, transparent)
 * @param {number} y1 漸層終點 y
 * @param {number} rx 要填的矩形 x (rectangle to fill)
 * @param {number} ry 矩形 y
 * @param {number} rw 矩形寬
 * @param {number} rh 矩形高
 */
function shadeEdge(g, x0, y0, x1, y1, rx, ry, rw, rh) {
  const gradient = g.createLinearGradient(x0, y0, x1, y1);
  gradient.addColorStop(0, 'rgba(12, 45, 18, 0.65)');
  gradient.addColorStop(1, 'rgba(12, 45, 18, 0)');
  g.fillStyle = gradient;
  g.fillRect(rx, ry, rw, rh);
}

// ----- 沒有圖片時，各種 tile 的後備畫法 (fallback tile shapes when no image) -----

// 箱子：咖啡色方塊加上 X 形木條 (crate)
function drawCrate(ctx, x, y) {
  const inset = 2;
  const size = TILE_SIZE - inset * 2;
  ctx.fillStyle = CRATE_COLOR;
  ctx.fillRect(x + inset, y + inset, size, size);

  ctx.strokeStyle = CRATE_EDGE_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + inset, y + inset, size, size);
  ctx.beginPath();
  ctx.moveTo(x + inset, y + inset);
  ctx.lineTo(x + inset + size, y + inset + size);
  ctx.moveTo(x + inset + size, y + inset);
  ctx.lineTo(x + inset, y + inset + size);
  ctx.stroke();
}

// 石頭：灰色大圓加上淺色亮點 (rock)
function drawRock(ctx, x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  ctx.fillStyle = ROCK_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE_SIZE * 0.46, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ROCK_HIGHLIGHT_COLOR;
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 4, TILE_SIZE * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

// 樹木：從上往下看的樹冠，深綠圓加淺綠圓 (tree, top-down canopy)
function drawTree(ctx, x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  ctx.fillStyle = TREE_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE_SIZE * 0.48, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = TREE_HIGHLIGHT_COLOR;
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 3, TILE_SIZE * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

// 草叢：幾個亮綠色的圓疊在一起 (bush: a few overlapping bright green circles)
function drawBush(ctx, cx, cy) {
  for (const [dx, dy, r] of [[-7, -4, 12], [7, -5, 11], [0, 7, 12], [0, 0, 11]]) {
    ctx.fillStyle = r === 11 && dx === 0 ? '#6cc85c' : '#3fa547';
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 陷阱：深色底板上四根紅色尖刺 (trap with spikes)
function drawTrap(ctx, x, y) {
  const inset = 4;
  ctx.fillStyle = TRAP_COLOR;
  ctx.fillRect(x + inset, y + inset, TILE_SIZE - inset * 2, TILE_SIZE - inset * 2);

  ctx.fillStyle = TRAP_SPIKE_COLOR;
  const half = TILE_SIZE / 2;
  // 四個小三角形，分別在格子的四個象限 (one spike per quadrant)
  for (const [ox, oy] of [[0, 0], [half, 0], [0, half], [half, half]]) {
    const sx = x + ox;
    const sy = y + oy;
    ctx.beginPath();
    ctx.moveTo(sx + half / 2, sy + 4);        // 尖端 (tip)
    ctx.lineTo(sx + half - 4, sy + half - 4); // 右下 (bottom-right)
    ctx.lineTo(sx + 4, sy + half - 4);        // 左下 (bottom-left)
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * 營火：一圈石頭、交叉的木柴，上面的火焰會跳動，外面一圈暖光 (campfire: stone ring, crossed logs, flickering flames, warm glow)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} time 秒數（火焰動畫）
 */
function drawCampfire(ctx, cx, cy, time) {
  // 暖光 (warm glow)
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30);
  glow.addColorStop(0, `rgba(255, 170, 60, ${0.35 + Math.sin(time * 9) * 0.05})`);
  glow.addColorStop(1, 'rgba(255, 170, 60, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();
  // 石頭圍一圈 (ring of stones)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? '#8d8d86' : '#76766f';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 4, 3.4, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3c3c36';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 交叉的木柴 (crossed logs)
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#5a3a1c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 5);
  ctx.lineTo(cx + 8, cy + 5);
  ctx.moveTo(cx - 8, cy + 5);
  ctx.lineTo(cx + 8, cy - 5);
  ctx.stroke();
  // 火焰：三層，大小跟著時間跳 (flames: three layers that flicker)
  const flick = (k) => 1 + Math.sin(time * (11 + k * 3) + k) * 0.15;
  const layers = [['#ff6a1a', 8], ['#ffb02e', 5.5], ['#fff1a8', 3]];
  for (let k = 0; k < layers.length; k++) {
    const [color, r] = layers[k];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r * flick(k), 0, Math.PI * 2);
    ctx.fill();
  }
}
