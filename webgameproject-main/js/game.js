import {
  ENEMY_BASE_COUNT,
  ENEMY_COUNT_MAX,
  ENEMY_COUNT_STAGES_PER_EXTRA,
  BOSS_STAGE_INTERVAL,
  BOSS_MINION_COUNT,
  MESSAGE_TIME,
  GAME_OVER_INPUT_DELAY,
  STORAGE_KEY_BEST_STAGE,
  BULLET_STEP_SIZE,
  STAGE_HEAL,
  AIM_ASSIST_ANGLE,
  AIM_ASSIST_RANGE,
  SCREEN_SHAKE_DURATION,
  SCREEN_SHAKE_STRENGTH,
  KNOCKBACK_DISTANCE,
  KNOCKBACK_COOLDOWN,
  DAMAGE_TEXT_SPREAD,
  DAMAGE_TEXT_OFFSET_Y,
  DAMAGE_TEXT_COLOR,
  PLAYER_DAMAGE_TEXT_COLOR,
  DEATH_PARTICLE_COUNT,
  CRATE_PARTICLE_COUNT,
  CRATE_COLOR,
  CRATE_AMMO_DROP_CHANCE,
  AMMO_PICKUP_RATIO,
  CRATE_POTION_DROP_CHANCE,
  POTION_HEAL,
  GAME_WIDTH,
  GAME_HEIGHT,
  CAMERA_ZOOM,
  VIEW_WIDTH,
  VIEW_HEIGHT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  CAMERA_FOLLOW_SPEED,
  CAMERA_LOOK_AHEAD,
  VISION_HALF_ANGLE,
  VISION_NEAR_RADIUS,
  VISION_FADE_SPEED,
  HOSTAGE_COUNT,
  HOSTAGE_WARN_COOLDOWN,
  STORAGE_KEY_INTRO_SEEN,
  PATROL_CHANCE,
  PATROL_MAX,
  PATROL_POINTS,
  GUNSHOT_HEARING_RANGE,
  CORPSE_BANDAGE_CHANCE,
  CORPSE_BANDAGE_HEAL,
  BOSS_CORPSE_AMMO_MULTIPLIER,
  SNIPER_EVERY,
  TILE_SIZE,
  TRUCK_PARK_OFFSET,
  TRUCK_SPAWN_ROW_OFFSET,
  GUNNER_GREETING_DELAY,
  GUNNER_CHATTER_TIME,
  PLAYER_SPAWN_COL,
  PLAYER_SPAWN_ROW,
  WAVE_CHANCE,
  WAVE_SQUADS,
  WAVE_REPATH_TIME,
  EXTRACT_TIME,
  EXTRACT_DEPART_DELAY,
  EXTRACT_FADE_TIME,
} from './config.js';
import { input, updateInput, isTouchMode, getTouchControls } from './input.js';
import { GameMap } from './map.js';
import { Player } from './player.js';
import { Enemy, Boss, Turret, createEnemyStats, createBossStats } from './enemy.js';
import { Corpse } from './corpse.js';
import { Truck } from './truck.js';
import { Explosion } from './bullet.js';
import { playSound, setMusicMode } from './audio.js';
import { FloatingText, createBurst } from './effects.js';
import { createRandomItem, applyItem, AmmoPickup, HealthPotion, BossReward } from './items.js';
import { Intel, Hostage } from './mission.js';
import { Cutscene } from './cutscene.js';
import {
  drawWeaponHud,
  drawStatusHud,
  drawStageHud,
  drawCenterMessage,
  drawGameOverScreen,
  drawTouchControls,
  drawMinimap,
  drawTargetArrow,
  drawVisionShade,
} from './ui.js';
import { drawMenu, drawSplash } from './titleScreen.js';

// ===== 最高紀錄存檔：localStorage (best record in localStorage) =====
// localStorage 是瀏覽器提供的小型儲存空間，關掉網頁再打開資料還在，但只能存字串。
// 無痕模式或瀏覽器封鎖儲存時可能會出錯，所以用 try / catch 包起來，失敗就當作沒有紀錄。

/**
 * 讀取最高紀錄 (load best stage)
 * @returns {number} 最高關卡，沒有紀錄回傳 0
 */
function loadBestStage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_BEST_STAGE); // 沒存過會得到 null (null if never saved)
    const value = Number(saved);                                // 字串轉數字，null 會變 0 (string → number)
    return Number.isFinite(value) ? value : 0;                  // 不是正常數字就當 0 (guard against junk)
  } catch (error) {
    return 0;
  }
}

/**
 * 儲存最高紀錄 (save best stage)
 * @param {number} stage 關卡數
 */
function saveBestStage(stage) {
  try {
    localStorage.setItem(STORAGE_KEY_BEST_STAGE, String(stage)); // 只能存字串 (strings only)
  } catch (error) {
    // 存不了就算了，遊戲照樣能玩 (ignore: the game still works without saving)
  }
}

/**
 * 是否看過開場過場動畫 (has the intro been seen)
 * @returns {boolean}
 */
function loadIntroSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY_INTRO_SEEN) === '1';
  } catch (error) {
    return false;
  }
}

/**
 * 記下「看過開場動畫了」(remember that the intro was seen)
 */
function saveIntroSeen() {
  try {
    localStorage.setItem(STORAGE_KEY_INTRO_SEEN, '1');
  } catch (error) {
    // 存不了就算了，頂多下次再播一次 (ignore: worst case it plays again)
  }
}

/**
 * 兩個圓有沒有重疊：圓心距離 < 兩個半徑相加 (circle-circle collision)
 * @param {{x: number, y: number, radius: number}} a
 * @param {{x: number, y: number, radius: number}} b
 * @returns {boolean}
 */
function circlesOverlap(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
}

/**
 * 從陣列裡隨機挑一個 (pick a random element)
 * @param {Array} list
 * @returns {*}
 */
function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// ===== 卡車機槍手的台詞 (truck gunner lines) =====
const GUNNER_GREETING_LINES = [
  'Good luck out there, brother!',
  'Stay low, stay quiet. I got your back.',
  "I'll keep the engine warm. Go get 'em!",
  "Grab that intel and let's go home.",
  'Give them hell!',
];
const GUNNER_BOSS_LINES = [
  "That's a commander's camp. Be careful in there!",
  "Our people are in there. Bring them home!",
];
const GUNNER_AMBUSH_LINES = [
  'Watch out, ambush!',
  "Ambush! They're coming out of the trees!",
  'Contact! Get down!',
];
const GUNNER_COMBAT_LINES = [
  "Keep 'em off the truck!",
  'More coming from the treeline!',
  "Keep moving, I've got you covered!",
  'Reloading! Cover me!',
];

// 遊戲本體：管理目前狀態、第幾關，以及地圖、玩家、敵人、子彈 (game state & stage flow)
//
// 遊戲狀態 state 有三種：
//   'splash' ：開機畫面，只有一行「按下開始」，按了之後才有聲音
//   'menu'   ：歡迎畫面 / 主選單
//   'cutscene'：開場過場動畫（第一次開始遊戲時，或在選單按 I）(intro cutscene)
//   'playing'：遊戲中
//   'dead'   ：玩家死亡，等待重新開始或回主選單
//
//   menu ──Enter──→ playing ──死亡──→ dead ──Enter──→ playing
//     ↑                                 │
//     └──────────────Esc────────────────┘
export class Game {
  constructor() {
    this.bestStage = loadBestStage();
    // 畫面震動：剩下幾秒，以及這一幀的偏移量 (screen shake: time left and this frame's offset)
    this.shakeTimer = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    // 鏡頭：畫面左上角在地圖上的位置。地圖比畫面大，鏡頭跟著玩家走 (camera: top-left of the view in world coordinates)
    this.camera = { x: 0, y: 0 };
    // 遊戲開始後經過的秒數，地圖動畫（水波、停機坪燈）用 (total seconds, for map animations)
    this.elapsed = 0;
    this.lastDt = 0;
    this.briefingPending = false; // 死過一次，下一局要先重播指揮官簡報 (a death means the next run starts with the briefing)
    this.cutscene = null;     // 播放中的過場動畫 (the cutscene being played)
    this.goToMenu();
    // 一開始先進「開機畫面」，等玩家第一次按 Enter / 點擊（瀏覽器規定要操作後才能出聲），才進有音樂的歡迎畫面
    // (start on the splash screen; browsers only allow sound after a user gesture)
    this.state = 'splash';
    setMusicMode('off');
  }

  // ===== 流程控制 (flow control) =====

  /**
   * 回到主選單：先準備好一局當作背景，但不開始更新 (go to the main menu)
   */
  goToMenu() {
    this.state = 'menu';
    this.prepareRun();
    this.menuTimer = 0;      // 在選單停留幾秒，閃爍提示用 (seconds on the menu)
    this.messageTimer = 0;   // 選單上不顯示「第 1 關」(no stage banner on the menu)
  }

  /**
   * 開始新的一局並進入遊戲 (start a new run and play)
   */
  startNewRun() {
    this.state = 'playing';
    this.prepareRun();
    playSound('uiConfirm');
  }

  /**
   * 播放開場過場動畫；地圖先準備好，動畫結束就直接開始第 1 關 (play the intro, then start stage 1)
   */
  startCutscene() {
    this.briefingPending = false;
    this.state = 'cutscene';
    this.prepareRun();
    this.cutscene = new Cutscene();
    setMusicMode('play'); // 背景是夜晚叢林的環境音 (night-time jungle ambience behind the briefing)
    playSound('uiConfirm');
  }

  /**
   * 過場動畫的更新：播完（或跳過）就記下看過了，正式開始遊戲 (update the cutscene; when done, start playing)
   * @param {number} dt 經過秒數
   */
  updateCutscene(dt) {
    this.cutscene.update(dt, input);
    if (!this.cutscene.done) return;

    saveIntroSeen();
    this.cutscene = null;
    this.state = 'playing';
    this.updateBestStage();
    this.announceStage();
    setMusicMode(this.isBossStage() ? 'boss' : 'play');
    playSound('stageStart');
  }

  /**
   * 準備一局：從第 1 關開始，玩家重新建立（血量、武器、道具全部重置）(prepare a fresh run)
   * 主選單和開新局都會用到，差別只在 state。
   */
  prepareRun() {
    this.stage = 1;
    this.player = null;     // 設成 null，loadStage 才會建立新玩家 (force a fresh player)
    this.deadTimer = 0;     // 死亡後經過幾秒 (seconds since death)
    // 記下開局時的紀錄，死亡時比較，才知道這局有沒有破紀錄 (record before this run)
    this.recordAtRunStart = this.bestStage;
    this.loadStage();
  }

  /**
   * 目前關卡超過最高紀錄就更新並存檔 (update and save the best record)
   * 每進一關就檢查，所以就算玩到一半直接關掉網頁，紀錄也不會不見。
   */
  updateBestStage() {
    if (this.state !== 'playing') return; // 主選單的背景地圖不算 (menu background doesn't count)
    if (this.stage > this.bestStage) {
      this.bestStage = this.stage;
      saveBestStage(this.bestStage);
    }
  }

  /**
   * 這局是否破了紀錄 (did this run beat the old record)
   * @returns {boolean}
   */
  isNewRecord() {
    return this.stage > this.recordAtRunStart;
  }

  /**
   * 載入目前這一關：新地圖、新敵人、清空子彈 (load the current stage)
   * 玩家會保留血量，只是移到新地圖的出生點。
   */
  loadStage() {
    // 營地樣式每關換一種，不會跟上一關一樣 (a different camp layout than last stage)
    this.map = new GameMap(this.stage, this.map ? this.map.layoutName : null);
    const spawn = this.map.getSpawnPosition();

    if (this.player === null) {
      // 新的一局：建立新玩家 (new run: create a new player)
      this.player = new Player(spawn.x, spawn.y);
    } else {
      // 下一關：同一個玩家搬到新出生點，回一點血 (next stage: keep the player, heal a bit)
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + STAGE_HEAL);
    }

    this.spawnEnemies();
    // 新的一關：鏡頭直接跳到玩家身上，不要從上一關的位置慢慢滑過來 (snap the camera on a new stage)
    this.updateCamera(0, true);

    this.bullets = [];
    this.explosions = [];     // 畫面上的爆炸特效 (explosion visuals)
    this.effects = [];        // 傷害數字、碎片等打擊感特效 (damage numbers, particles)
    this.ammoPickups = [];    // 地上的彈藥 (ammo on the ground)
    this.potions = [];        // 地上的回血藥 (health potions on the ground)
    this.corpses = [];        // 敵人的屍體，可以搜身 (enemy corpses you can search)

    // 這一關的道具：null 代表地上沒有道具 (item on the ground, null = none)
    this.item = null;
    // 敵人是否已經全滅過（道具只掉一次）(has the stage been cleared)
    this.stageCleared = false;
    // 最後一個倒下的敵人位置，道具會掉在這裡 (where the last enemy died)
    this.lastEnemyDeathX = 0;
    this.lastEnemyDeathY = 0;
    // BOSS 掉落的獎勵：null 代表沒有 (boss reward on the ground, null = none)
    this.bossReward = null;

    // ----- 任務物件 (mission objects) -----
    // 一般關卡：營地清光之後，營地裡會出現一份機密情報；BOSS 關：營地裡綁著幾個人質
    // (normal stages: intel appears in the camp once it's cleared; boss stages: hostages)
    this.intel = null;                          // 地上的情報，還沒出現或已經拿走是 null (intel on the ground)
    this.intelTaken = this.isBossStage();       // BOSS 關沒有情報，當作已經拿到 (boss stages have no intel)
    this.intelSpot = this.isBossStage() ? null : (this.map.getCampSpots(1)[0] ?? null); // 情報會出現的位置 (where it will appear)
    this.hostages = [];
    this.hostageWarnTimer = 0;  // 「先打倒指揮官」提示的冷卻 (cooldown for the "defeat the commander first" hint)
    if (this.isBossStage()) {
      for (const spot of this.map.getCampSpots(HOSTAGE_COUNT)) {
        this.hostages.push(new Hostage(spot.x, spot.y));
      }
    }

    // ----- 卡車、撤離與伏擊 (truck, extraction & ambush) -----
    // 卡車把玩家載到出生點，一開始就停在旁邊；任務完成才開到營地門口接人
    // (the truck dropped you off and waits at the spawn; it drives to the camp gate once the mission is done)
    const truckSpot = this.map.nearestWalkable(
      (PLAYER_SPAWN_COL + 0.5) * TILE_SIZE,
      (PLAYER_SPAWN_ROW + TRUCK_SPAWN_ROW_OFFSET + 0.5) * TILE_SIZE,
    ) ?? this.map.getSpawnPosition();
    this.truck = new Truck(truckSpot, this.stage);
    this.truckCalled = false;   // 任務完成、叫車了嗎 (has the extraction been called)
    this.dropOffSoundPending = true; // 這關第一幀播「卡車熄火、關車門」(play the drop-off sound on the first frame)
    this.greetingTimer = GUNNER_GREETING_DELAY; // 倒數到 0 機槍手說「祝好運」(countdown to the greeting)
    this.chatterTimer = 0;      // 伏擊時喊話的倒數 (countdown to the next ambush shout)
    this.waveRolled = false;    // 這關已經擲過「會不會伏擊」了嗎 (has the ambush roll happened)
    this.waveActive = false;    // 伏擊兵還在嗎 (is an ambush in progress)
    this.waveRepathTimer = 0;

    this.updateBestStage();
    this.announceStage();

    // 背景音樂依場景切換：選單、一般關、BOSS 關各一種 (music per scene)
    // 選單的背景地圖也會走到這裡，所以要先看 state (the menu background also calls loadStage)
    if (this.state === 'menu') {
      setMusicMode('menu');
    } else if (this.isBossStage()) {
      setMusicMode('boss');
      playSound('bossAlert');
    } else {
      setMusicMode('play');
      playSound('stageStart');
    }
  }

  /**
   * 在畫面中央顯示這一關的任務 (show this stage's mission in the center)
   */
  announceStage() {
    if (this.isBossStage()) {
      this.showMessage(`STAGE ${this.stage} - BOSS: Free the hostages!`);
    } else {
      this.showMessage(`STAGE ${this.stage}: Clear the base, get the intel`);
    }
  }

  /**
   * BOSS（敵軍指揮官）是否還活著 (is the boss still alive)
   * @returns {boolean}
   */
  isBossAlive() {
    return this.enemies.some((enemy) => enemy instanceof Boss);
  }

  /**
   * 還有幾個人質沒救出 (how many hostages still need rescuing)
   * @returns {number}
   */
  getHostagesLeft() {
    return this.hostages.filter((hostage) => !hostage.rescued).length;
  }

  /**
   * 這一關是不是 BOSS 關：關卡數能被 5 整除 (is this a boss stage)
   * @returns {boolean}
   */
  isBossStage() {
    return this.stage % BOSS_STAGE_INTERVAL === 0;
  }

  /**
   * 這是第幾個 BOSS：第 5 關是第 1 個、第 10 關是第 2 個 (which boss is this, 1-based)
   * @returns {number}
   */
  getBossNumber() {
    return this.stage / BOSS_STAGE_INTERVAL;
  }

  /**
   * 一般關卡的敵人數量：每過幾關多 1 個，有上限 (enemy count for a normal stage)
   * 例如第 1~2 關 2 個、第 3~4 關 3 個……最多 8 個。
   * @returns {number}
   */
  getEnemyCount() {
    const extra = Math.floor((this.stage - 1) / ENEMY_COUNT_STAGES_PER_EXTRA);
    return Math.min(ENEMY_COUNT_MAX, ENEMY_BASE_COUNT + extra);
  }

  /**
   * 依目前關卡產生敵人；BOSS 關是 1 個 BOSS 加幾個小兵 (spawn enemies for this stage)
   */
  spawnEnemies() {
    // 敵人的數值依「關卡」和「玩家最強武器」決定 (stats depend on stage and player's best weapon)
    const bestDps = this.player.getBestDps();
    const enemyStats = createEnemyStats(this.stage, bestDps);

    this.enemies = [];

    let positions;
    if (this.isBossStage()) {
      // 第一個位置（最靠近營地中心）給 BOSS，其他給小兵 (first position, at the camp center, for the boss)
      positions = this.map.getEnemySpawnPositions(1 + BOSS_MINION_COUNT);
      if (positions.length > 0) {
        const bossPos = positions.shift();
        this.enemies.push(new Boss(bossPos.x, bossPos.y, createBossStats(this.stage, bestDps)));
      }
    } else {
      positions = this.map.getEnemySpawnPositions(this.getEnemyCount());
    }

    // 分配兵種：最靠近正門（最左邊）的是近戰兵；狙擊手全部站在瞭望塔上；其他是步槍兵
    // (roles: the one nearest the front gate is the melee fighter; snipers all stand in watchtowers; the rest are riflemen)
    positions.sort((a, b) => a.x - b.x);
    const meleeCount = positions.length >= 2 ? 1 : 0;           // 近戰兵最多 1 個 (at most one melee fighter)
    const sniperPosts = this.map.claimSniperTowers(Math.floor(positions.length / SNIPER_EVERY));
    // 最深處的幾個位置讓給塔上的狙擊手 (the deepest spots go to the snipers, who move up into the towers)
    const groundCount = positions.length - sniperPosts.length;
    for (let i = 0; i < groundCount; i++) {
      const role = i < meleeCount ? 'melee' : 'rifleman';
      this.enemies.push(new Enemy(positions[i].x, positions[i].y, enemyStats, role));
    }
    for (const post of sniperPosts) {
      const sniper = new Enemy(post.x, post.y, enemyStats, 'sniper');
      sniper.perched = true;
      this.enemies.push(sniper);
    }

    // 營地裡蓋了砲塔的地方，放上自動砲塔 (gun turrets on the turret pads the map built)
    for (const spot of this.map.turretSpots) {
      this.enemies.push(new Turret(spot.x, spot.y, enemyStats));
    }

    // 有機率在營地外面多 1~2 個巡邏兵 (sometimes 1~2 extra soldiers patrol outside the camp)
    if (Math.random() < PATROL_CHANCE) {
      const count = 1 + Math.floor(Math.random() * PATROL_MAX);
      for (let i = 0; i < count; i++) {
        const route = this.map.getPatrolRoute(PATROL_POINTS);
        if (route.length === 0) continue;
        const patrol = new Enemy(route[0].x, route[0].y, enemyStats);
        patrol.startPatrol(route);
        this.enemies.push(patrol);
      }
    }
  }

  /**
   * 在畫面中央顯示一段提示文字，幾秒後消失 (show a center message for a while)
   * @param {string} text 要顯示的文字
   */
  showMessage(text) {
    this.messageText = text;
    this.messageTimer = MESSAGE_TIME;
  }

  // ===== 每幀更新 (update) =====

  /**
   * 依目前狀態更新遊戲 (update according to current state)
   * @param {number} dt 經過秒數
   */
  update(dt) {
    updateInput(this.player, this.camera);
    this.elapsed += dt;
    this.lastDt = dt; // 給不想多傳參數的函式用 (for helpers that need dt)
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.updateShake(dt);
    this.updateEffects(dt);

    if (this.state === 'splash') {
      this.updateSplash(dt);
    } else if (this.state === 'menu') {
      this.updateMenu(dt);
    } else if (this.state === 'cutscene') {
      this.updateCutscene(dt);
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else if (this.state === 'extracting') {
      this.updateExtracting(dt);
    } else if (this.state === 'dead') {
      this.updateDead(dt);
    }
  }

  /**
   * 開機畫面的更新：按 Enter 或點擊就進入歡迎畫面，音樂從這一刻開始 (update on the splash screen)
   * @param {number} dt 經過秒數
   */
  updateSplash(dt) {
    this.menuTimer += dt;
    if (input.confirm) {
      this.state = 'menu';
      this.menuTimer = 0;
      setMusicMode('menu');
      playSound('uiConfirm');
    }
  }

  /**
   * 主選單的更新：按 Enter 或點擊就開始新的一局 (update on the menu)
   * @param {number} dt 經過秒數
   */
  updateMenu(dt) {
    this.menuTimer += dt;
    // 第一次玩先看開場動畫；按 I 可以重看 (first time: show the intro; I replays it)
    if (input.replayIntro) {
      this.startCutscene();
    } else if (input.confirm) {
      // 第一次玩、或剛死掉回到主選單：先播簡報 (first time, or back here after dying: play the briefing)
      if (loadIntroSeen() && !this.briefingPending) {
        this.startNewRun();
      } else {
        this.startCutscene();
      }
    }
  }

  /**
   * 遊戲中的更新：每一幀依序處理移動、戰鬥、掉落、撿東西、關卡進度 (update while playing)
   * @param {number} dt 經過秒數
   */
  updatePlaying(dt) {
    // 先記下血量 + 護甲，更新完再比較，就知道這一幀有沒有受傷（子彈、陷阱都算）(detect damage taken this frame)
    const healthBefore = this.player.hp + this.player.armor;

    // 手機射擊時才做瞄準輔助；電腦用滑鼠，本來就瞄得準 (aim assist only for touch)
    if (isTouchMode() && input.isShooting) {
      this.applyAimAssist();
    }
    this.player.update(dt, input, this.bullets, this.map);
    if (this.player.firedThisFrame) {
      this.alertEnemies();
    }
    this.updateCamera(dt, false);
    this.updateEnemyVisibility(dt);
    // 站在草叢裡、而且最近沒開槍 = 躲起來了 (in a bush and not recently firing = hidden)
    this.player.isHidden = this.map.isBushAtPixel(this.player.x, this.player.y) && this.player.revealTimer === 0;
    for (const enemy of this.enemies) {
      enemy.update(dt, this.player, this.bullets, this.map);
    }
    this.updateBullets(dt);
    for (const explosion of this.explosions) {
      explosion.update(dt);
    }

    const healthLost = healthBefore - (this.player.hp + this.player.armor);
    if (healthLost > 0) {
      playSound('playerHurt');
      this.startShake();
      this.addDamageText(this.player, healthLost, PLAYER_DAMAGE_TEXT_COLOR);
    }

    this.handleEnemyDeaths();
    this.handleBrokenCrates();
    this.handleCorpses(dt);
    this.handlePickups();
    this.removeFinishedObjects();

    // 玩家死亡就切到死亡畫面，這一幀後面都不用做了 (player died: switch state and stop here)
    if (this.player.isDead()) {
      this.state = 'dead';
      this.deadTimer = 0;
      this.briefingPending = true; // 下一局開始前要重播簡報 (replay the briefing before the next run)
      this.messageTimer = 0; // 收掉提示文字，免得跟 GAME OVER 疊在一起 (hide message)
      setMusicMode('off');   // 死亡時音樂停止，只留哀鳴 (stop the music on death)
      playSound('gameOver');
      return;
    }

    this.checkStageProgress();
  }

  /**
   * 處理這一幀死掉的敵人：記下位置、可能掉彈藥、噴碎片，BOSS 掉獎勵 (handle enemies that died this frame)
   * 要在 removeFinishedObjects() 之前呼叫，不然死掉的敵人已經被移除了。
   */
  handleEnemyDeaths() {
    for (const enemy of this.enemies) {
      if (!enemy.isDead()) continue;

      // 塔上的狙擊手中彈後摔到塔下，屍體和道具才撿得到 (a sniper shot off a tower falls to the ground, so his body and drops are reachable)
      if (enemy.perched) {
        const ground = this.map.nearestWalkable(enemy.x, enemy.y);
        if (ground !== null) {
          enemy.x = ground.x;
          enemy.y = ground.y;
        }
      }

      // 清關道具會掉在最後一個倒下的敵人位置 (the stage item drops where the last enemy died)
      this.lastEnemyDeathX = enemy.x;
      this.lastEnemyDeathY = enemy.y;
      this.effects.push(...createBurst(enemy.x, enemy.y, enemy.color, DEATH_PARTICLE_COUNT));

      // 砲塔被打爆：爆炸，不留屍體；士兵倒下：留下可以搜身的屍體 (turrets blow up; soldiers leave a searchable corpse)
      if (enemy instanceof Turret) {
        this.explosions.push(new Explosion(enemy.x, enemy.y, enemy.radius * 2.5));
        this.startShake();
        playSound('explosion');
        continue;
      }
      this.corpses.push(new Corpse(enemy, enemy instanceof Boss));

      if (enemy instanceof Boss) {
        this.bossReward = new BossReward(enemy.x, enemy.y, this.getBossNumber());
        playSound('bossDeath');
      } else {
        playSound('enemyDeath');
      }
    }
  }

  /**
   * 處理這一幀被打破的箱子：先抽回血藥，沒抽中才抽彈藥 (handle crates broken this frame)
   */
  handleBrokenCrates() {
    for (const crate of this.map.brokenCrates) {
      this.effects.push(...createBurst(crate.x, crate.y, CRATE_COLOR, CRATE_PARTICLE_COUNT));
      playSound('crateBreak');
      if (Math.random() < CRATE_POTION_DROP_CHANCE) {
        this.potions.push(new HealthPotion(crate.x, crate.y));
      } else {
        this.tryDropAmmo(crate.x, crate.y, CRATE_AMMO_DROP_CHANCE);
      }
    }
    // 讀完就清空，下一幀才不會重複處理 (clear so they're handled only once)
    this.map.brokenCrates = [];
  }

  /**
   * 搜身：站在屍體旁邊，搜完就拿到彈藥，有時還有繃帶 (search corpses for ammo and sometimes a bandage)
   * @param {number} dt 經過秒數
   */
  handleCorpses(dt) {
    for (const corpse of this.corpses) {
      if (!corpse.update(dt, this.player)) continue;

      const found = [];
      if (this.player.needsAmmo()) {
        const multiplier = corpse.isBoss ? BOSS_CORPSE_AMMO_MULTIPLIER : 1;
        this.player.addAmmoToAll(AMMO_PICKUP_RATIO * multiplier);
        found.push('ammo');
      }
      if (Math.random() < CORPSE_BANDAGE_CHANCE && this.player.hp < this.player.maxHp) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + CORPSE_BANDAGE_HEAL);
        found.push(`a bandage (+${CORPSE_BANDAGE_HEAL} HP)`);
      }

      if (found.length > 0) {
        playSound('pickupAmmo');
        this.addFloatingLabel(corpse, `Found ${found.join(' and ')}!`, '#ffd740');
      } else {
        playSound('empty');
        this.addFloatingLabel(corpse, 'Nothing useful', '#b0bec5');
      }
    }
  }

  /**
   * 在某個東西上方飄一行字 (a floating label above something)
   */
  addFloatingLabel(target, text, color) {
    this.effects.push(new FloatingText(target.x, target.y - target.radius - 18, text, color));
  }

  /**
   * 玩家開槍時，聽得到的敵人都會反應 (every enemy within earshot reacts when the player fires)
   *   營地外的巡邏兵：跑回營地 (patrols outside the camp run back to it)
   *   營地裡的敵人：出來朝槍聲的方向就定位 (guards come out and take positions toward the gunfire)
   *   砲塔不會動，正在打的敵人也不用理槍聲 (turrets can't move; enemies already fighting ignore it)
   */
  alertEnemies() {
    const base = this.map.getCampCenter();
    for (const enemy of this.enemies) {
      if (enemy instanceof Turret) continue;
      if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > GUNSHOT_HEARING_RANGE) continue;
      if (enemy.mode === 'patrol') {
        enemy.hearGunshot(this.map, base.x, base.y);
      } else if (enemy.mode !== 'return' && !enemy.seesPlayer && enemy.lastSeenX === null) {
        enemy.respondToNoise(this.map, this.player.x, this.player.y);
      }
    }
  }

  /**
   * 撿地上的彈藥和回血藥 (pick up ammo and potions)
   */
  handlePickups() {
    for (const ammo of this.ammoPickups) {
      if (circlesOverlap(this.player, ammo)) {
        this.player.addAmmoToAll(AMMO_PICKUP_RATIO);
        ammo.pickedUp = true;
        playSound('pickupAmmo');
      }
    }

    // 血沒滿才撿，滿血時留在地上，之後受傷再回來撿 (only pick up potions when hurt)
    for (const potion of this.potions) {
      if (circlesOverlap(this.player, potion) && this.player.hp < this.player.maxHp) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + POTION_HEAL);
        potion.pickedUp = true;
        playSound('pickupHeal');
        this.showMessage(`Health potion: +${POTION_HEAL} HP`);
      }
    }
  }

  /**
   * 把死掉的子彈、敵人、結束的爆炸、撿走的東西從陣列移除 (remove finished objects)
   */
  removeFinishedObjects() {
    this.bullets = this.bullets.filter((bullet) => bullet.alive);
    this.enemies = this.enemies.filter((enemy) => !enemy.isDead());
    this.explosions = this.explosions.filter((explosion) => !explosion.isDone());
    this.ammoPickups = this.ammoPickups.filter((ammo) => !ammo.pickedUp);
    this.potions = this.potions.filter((potion) => !potion.pickedUp);
  }

  /**
   * 關卡進度 (stage progress)：
   *   清光營地 → 掉道具，一般關出現情報 → 拿情報（BOSS 關：救人質、撿 BOSS 獎勵）
   *   → 撤離卡車開過來 → 走出營地時可能被伏擊 → 伏擊清光 → 站到卡車旁上車 → 下一關
   * (clear the camp → intel / hostages → truck drives in → maybe an ambush → board the truck → next stage)
   */
  checkStageProgress() {
    const dt = this.lastDt;

    // ----- 營地清光：掉道具；一般關出現情報 (camp cleared: drop an item; intel appears on normal stages) -----
    if (this.enemies.length === 0 && !this.stageCleared) {
      this.stageCleared = true;
      playSound('stageClear');
      this.item = createRandomItem(this.lastEnemyDeathX, this.lastEnemyDeathY);
      if (this.intelSpot !== null) {
        this.intel = new Intel(this.intelSpot.x, this.intelSpot.y);
        this.showMessage('Base cleared! Grab the intel');
      } else {
        this.showMessage('All enemies down!');
      }
    }

    // ----- 拿情報 (grab the intel) -----
    if (this.intel !== null && circlesOverlap(this.player, this.intel)) {
      this.intel = null;
      this.intelTaken = true;
      playSound('pickupIntel');
    }

    // ----- 救人質：BOSS 還活著就不行，只提示 (rescue hostages, only after the boss is down) -----
    this.hostageWarnTimer = Math.max(0, this.hostageWarnTimer - dt);
    for (const hostage of this.hostages) {
      hostage.update(dt);
      if (hostage.rescued || !circlesOverlap(this.player, hostage)) continue;

      if (this.isBossAlive()) {
        if (this.hostageWarnTimer === 0) {
          this.showMessage('Defeat the enemy commander first!');
          this.hostageWarnTimer = HOSTAGE_WARN_COOLDOWN;
        }
      } else {
        hostage.rescue();
        playSound('hostageRescued');
        const rescued = this.hostages.length - this.getHostagesLeft();
        this.showMessage(`Hostage rescued! (${rescued}/${this.hostages.length})`);
      }
    }

    if (this.item !== null && circlesOverlap(this.player, this.item)) {
      applyItem(this.item.type, this.player);
      playSound('pickupItem');
      this.showMessage(this.item.getPickupText());
      this.item = null;
    }

    if (this.bossReward !== null && circlesOverlap(this.player, this.bossReward)) {
      this.showMessage(this.bossReward.apply(this.player));
      this.bossReward = null;
      playSound('pickupWeapon');
    }

    // ----- 任務完成 → 叫撤離卡車 (mission done → call the truck) -----
    // BOSS 獎勵也要撿才叫車，避免玩家不小心錯過新武器 (the boss reward must be picked up too, so nobody misses a weapon)
    const missionDone = this.stageCleared && this.intelTaken && this.getHostagesLeft() === 0 && this.bossReward === null;
    if (missionDone && !this.truckCalled) {
      this.callTruck();
    }

    // ----- 機槍手說話 (gunner chatter) -----
    this.updateGunnerChatter(dt);

    if (this.waveActive) {
      this.updateWave(dt);
    }

    // ----- 卡車：機槍手幫忙開火；任務完成、敵人清光才能上車 (the gunner helps; board once the mission is done and no enemies are left) -----
    // 第一次上車時擲一次伏擊：被伏擊就吹哨、敵人衝出來，打完要再上車一次 (the first boarding rolls for an ambush:
    // if it happens, a war whistle blows and enemies charge out; clear them and board again)
    if (this.truck.update(dt, this.enemies, this.bullets, this.map, this.player, this.canBoardTruck())) {
      if (!this.waveRolled) {
        this.waveRolled = true;
        if (Math.random() < WAVE_CHANCE && this.spawnWave()) {
          this.truck.boardProgress = 0;
          return;
        }
      }
      this.startExtraction();
    }
  }

  /**
   * 上車了：引擎發動、卡車開走、畫面淡出，然後進入下一關 (boarded: engine starts, the truck drives off, fade out, next stage)
   */
  startExtraction() {
    this.state = 'extracting';
    this.extractTimer = EXTRACT_TIME;
    this.truck.speech = '';
    playSound('engineStart');
  }

  /**
   * 撤離中：卡車開走，鏡頭跟著卡車；時間到就進下一關 (extracting: the truck drives off with the camera following)
   * @param {number} dt 經過秒數
   */
  updateExtracting(dt) {
    this.extractTimer -= dt;
    // 引擎發動那段先不動，發動之後才開走 (wait for the engine to start before rolling)
    if (this.extractTimer < EXTRACT_TIME - EXTRACT_DEPART_DELAY) {
      const camp = this.map.getCampCenter();
      this.truck.depart(dt, Math.atan2(this.truck.y - camp.y, this.truck.x - camp.x));
    }
    this.player.x = this.truck.x;   // 玩家坐在車上：鏡頭跟著卡車 (the player rides along: the camera follows the truck)
    this.player.y = this.truck.y;
    this.updateCamera(dt, false);
    if (this.extractTimer <= 0) {
      this.stage++;
      this.loadStage();
      this.state = 'playing';
    }
  }

  /**
   * 現在可以上車嗎：已經叫車，而且沒有敵人 (can the player board: extraction called and no enemies left)
   * @returns {boolean}
   */
  canBoardTruck() {
    return this.truckCalled && this.enemies.length === 0;
  }

  /**
   * 機槍手的台詞：開場祝好運、伏擊時每隔幾秒喊一句 (gunner lines: good luck at the start, shouts during an ambush)
   * @param {number} dt 經過秒數
   */
  updateGunnerChatter(dt) {
    // 剛下車：卡車熄火、關車門 (just dropped off: the engine shuts down and a door slams)
    if (this.dropOffSoundPending) {
      this.dropOffSoundPending = false;
      playSound('engineStop');
    }
    if (this.greetingTimer > 0) {
      this.greetingTimer -= dt;
      if (this.greetingTimer <= 0) {
        this.truck.say(pickRandom(this.isBossStage() ? GUNNER_BOSS_LINES : GUNNER_GREETING_LINES));
      }
    }
    if (this.waveActive) {
      this.chatterTimer -= dt;
      if (this.chatterTimer <= 0) {
        this.chatterTimer = GUNNER_CHATTER_TIME;
        this.truck.say(pickRandom(GUNNER_COMBAT_LINES));
      }
    }
  }

  /**
   * 叫撤離卡車：停在營地正門外幾格，從更遠的地方沿路開過來 (call the truck: park outside the front gate, drive in from farther out)
   */
  callTruck() {
    this.truckCalled = true;
    const gateX = (this.map.frontGateCol - TRUCK_PARK_OFFSET) * TILE_SIZE + TILE_SIZE / 2;
    const gateY = this.map.exitRow * TILE_SIZE + TILE_SIZE / 2;
    const park = this.map.nearestWalkable(gateX, gateY);
    // 找不到路就留在出生點等你走回去 (no route: it just waits at the spawn)
    const driving = park !== null && this.truck.driveTo(this.map, park);
    playSound('truckHorn');
    this.truck.say(driving ? "On my way! Hang tight, brother!" : "I'm right here, come get in!");
    this.showMessage(this.isBossStage() ? 'Hostages safe! The truck is on its way' : 'Intel secured! The truck is on its way');
  }

  /**
   * 這一關的伏擊兵種清單：照 WAVE_SQUADS 找「這關適用」的那一行 (the ambush squad for this stage, from WAVE_SQUADS)
   * @returns {string[]} 例如 ['melee', 'melee', 'rifleman']
   */
  getWaveRoles() {
    let squad = WAVE_SQUADS[0];
    for (const row of WAVE_SQUADS) {
      if (this.stage >= row.stage) squad = row;
    }
    const roles = [];
    for (const role of ['melee', 'rifleman', 'sniper']) {
      for (let i = 0; i < squad[role]; i++) roles.push(role);
    }
    return roles;
  }

  /**
   * 伏擊：一聲戰爭哨音，一波敵人從叢林邊緣衝出來追玩家；兵種依關卡而定 (ambush: a war whistle, then a wave charges out of the jungle)
   * @returns {boolean} 有沒有真的出現敵人 (whether any enemies actually spawned)
   */
  spawnWave() {
    const roles = this.getWaveRoles();
    const stats = createEnemyStats(this.stage, this.player.getBestDps());
    const spots = this.map.getWaveSpawns(roles.length, this.player.x, this.player.y);
    for (let i = 0; i < spots.length; i++) {
      const enemy = new Enemy(spots[i].x, spots[i].y, stats, roles[i]);
      enemy.isWave = true;
      enemy.chase(this.map, this.player.x, this.player.y);
      this.enemies.push(enemy);
    }
    if (spots.length === 0) return false;
    this.waveActive = true;
    this.waveRepathTimer = WAVE_REPATH_TIME;
    this.chatterTimer = GUNNER_CHATTER_TIME;
    this.truck.say(pickRandom(GUNNER_AMBUSH_LINES));
    playSound('ambushWhistle');
    this.showMessage('Ambush! Defend the truck!');
    return true;
  }

  /**
   * 伏擊進行中：每隔一段時間，還沒看到玩家的伏擊兵重新找路追過去；全部倒下就結束 (re-path the hunters; end when all are down)
   * @param {number} dt 經過秒數
   */
  updateWave(dt) {
    if (this.enemies.length === 0) {
      this.waveActive = false;
      this.truck.say("Clear! Let's get outta here!");
      this.showMessage('Ambush cleared! Get in the truck');
      return;
    }
    this.waveRepathTimer -= dt;
    if (this.waveRepathTimer > 0) return;
    this.waveRepathTimer = WAVE_REPATH_TIME;
    for (const enemy of this.enemies) {
      if (enemy.isWave && !enemy.seesPlayer && enemy.lastSeenX === null) {
        enemy.chase(this.map, this.player.x, this.player.y);
      }
    }
  }

  /**
   * 死亡畫面的更新：等一下下，然後按 Enter 或點擊就重新開始 (update on game over)
   * @param {number} dt 經過秒數
   */
  updateDead(dt) {
    this.deadTimer += dt;
    if (this.deadTimer < GAME_OVER_INPUT_DELAY) return; // 還在等待時間內 (still in the delay)

    // 死掉重來：每次都重播指揮官的任務簡報 (restarting after a death always replays the commander's briefing)
    if (input.confirm) {
      this.startCutscene();
    } else if (input.back) {
      this.goToMenu();
    }
  }

  /**
   * 右上角要顯示的目前目標 (current objective text)
   * @returns {string}
   */
  getObjectiveText() {
    if (this.isBossAlive()) {
      return 'Defeat the enemy commander!';
    }
    if (!this.stageCleared) {
      return `Clear the base (enemies: ${this.enemies.length})`;
    }
    if (this.intel !== null) {
      return 'Grab the intel!';
    }
    const hostagesLeft = this.getHostagesLeft();
    if (hostagesLeft > 0) {
      return `Free the hostages (${this.hostages.length - hostagesLeft}/${this.hostages.length})`;
    }
    if (this.bossReward !== null) {
      return 'Grab the boss reward';
    }
    if (this.waveActive) {
      return `Ambush! Defend the truck (enemies: ${this.enemies.length})`;
    }
    if (this.truckCalled && !this.truck.arrived) {
      return 'Extraction truck incoming...';
    }
    return 'Get in the truck!';
  }

  // ===== 視野 (field of view) =====

  /**
   * 這個點在不在玩家的視野裡：在身邊的小圓內，或在面向的扇形內 (is this point inside the player's view)
   * 扇形邊緣是柔和的漸層，所以判斷時多給一點角度 (a little extra angle for the soft edge)
   * @param {number} x 地圖座標 x
   * @param {number} y 地圖座標 y
   * @param {number} radius 物體半徑，身體碰到小圓就算看得到 (object radius)
   * @returns {boolean}
   */
  isInPlayerView(x, y, radius) {
    const dx = x - this.player.x;
    const dy = y - this.player.y;
    if (Math.hypot(dx, dy) <= VISION_NEAR_RADIUS + radius) return true;

    // 兩個角度相減後轉回 -π ~ π，才不會出現 350° 這種繞遠路的差 (wrap the angle difference)
    const raw = Math.atan2(dy, dx) - this.player.aimAngle;
    const diff = Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw)));
    return diff <= VISION_HALF_ANGLE + 0.12;
  }

  /**
   * 視野內的敵人慢慢浮現，視野外的慢慢消失 (enemies fade in inside the view cone, fade out behind)
   * @param {number} dt 經過秒數
   */
  updateEnemyVisibility(dt) {
    const step = VISION_FADE_SPEED * dt;
    for (const enemy of this.enemies) {
      const target = this.isInPlayerView(enemy.x, enemy.y, enemy.radius) ? 1 : 0;
      if (enemy.viewAlpha < target) {
        enemy.viewAlpha = Math.min(target, enemy.viewAlpha + step);
      } else {
        enemy.viewAlpha = Math.max(target, enemy.viewAlpha - step);
      }
    }
  }

  // ===== 鏡頭 (camera) =====

  /**
   * 鏡頭跟著玩家：目標是「玩家在畫面正中央，再往瞄準方向多看一點」(follow the player, looking ahead)
   * 每幀只追上一部分距離，所以鏡頭會滑順地跟過去，不會一頓一頓的 (move part of the way each frame = smooth)
   * 鏡頭不能超出地圖邊界，不然會看到地圖外面的黑色 (clamp so we never show outside the map)
   * @param {number} dt 經過秒數
   * @param {boolean} snap true = 直接跳到目標位置（換關卡時用）(jump straight to the target)
   */
  updateCamera(dt, snap) {
    // 鏡頭拉近了，所以用「看得到的地圖範圍」VIEW_WIDTH × VIEW_HEIGHT 來算 (zoomed in: use the visible world size)
    const targetX = this.player.x + Math.cos(this.player.aimAngle) * CAMERA_LOOK_AHEAD - VIEW_WIDTH / 2;
    const targetY = this.player.y + Math.sin(this.player.aimAngle) * CAMERA_LOOK_AHEAD - VIEW_HEIGHT / 2;
    const clampedX = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, targetX));
    const clampedY = Math.max(0, Math.min(WORLD_HEIGHT - VIEW_HEIGHT, targetY));

    if (snap) {
      this.camera.x = clampedX;
      this.camera.y = clampedY;
      return;
    }
    // 追上「距離 × 速度 × dt」，最多一次追滿 (close a fraction of the gap each frame, never overshoot)
    const follow = Math.min(1, CAMERA_FOLLOW_SPEED * dt);
    this.camera.x += (clampedX - this.camera.x) * follow;
    this.camera.y += (clampedY - this.camera.y) * follow;
  }

  // ===== 子彈、爆炸、彈藥 (bullets, explosions, ammo) =====

  /**
   * 移動所有子彈；每顆子彈把這一幀切成好幾小段，每段都檢查碰撞 (move bullets with sub-steps)
   * 為什麼要切？狙擊槍子彈一幀可能飛 100px 以上，一次飛完會直接「跳過」中間的牆或敵人。
   * 切成每段最多 BULLET_STEP_SIZE（8px），就不會漏掉。
   * @param {number} dt 經過秒數
   */
  updateBullets(dt) {
    for (const bullet of this.bullets) {
      const distance = bullet.speed * dt;
      const steps = Math.max(1, Math.ceil(distance / BULLET_STEP_SIZE));
      const stepDt = dt / steps;

      for (let i = 0; i < steps && bullet.alive; i++) {
        bullet.update(stepDt, this.map);
        if (bullet.alive) {
          this.checkBulletHit(bullet);
        }
      }

      // 爆炸彈不管是撞牆、打中敵人還是飛到射程盡頭，消失的那一刻都會爆炸 (explode on death)
      if (!bullet.alive && bullet.isExplosive()) {
        this.explode(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage);
      }
    }
  }

  /**
   * 檢查一顆子彈有沒有打中角色 (check one bullet against characters)
   * 玩家的子彈只打敵人，敵人的子彈只打玩家，不會打到自己人。
   * @param {Bullet} bullet 子彈
   */
  checkBulletHit(bullet) {
    if (bullet.owner === 'enemy') {
      if (circlesOverlap(bullet, this.player)) {
        this.player.takeDamage(bullet.damage);
        bullet.alive = false;
      }
      return;
    }

    for (const enemy of this.enemies) {
      if (enemy.isDead()) continue;
      if (bullet.hitEnemies.has(enemy)) continue; // 貫穿彈已經打過這個敵人 (already hit)
      if (!circlesOverlap(bullet, enemy)) continue;

      if (bullet.isExplosive()) {
        // 榴彈打中敵人：不直接扣血，消失後由爆炸造成範圍傷害 (grenade: damage comes from the explosion)
        bullet.alive = false;
        return;
      }

      // 被打退的方向 = 子彈飛行的方向 (knock back along the bullet's direction)
      this.hitEnemy(enemy, bullet.damage, Math.atan2(bullet.vy, bullet.vx));

      if (bullet.pierce) {
        bullet.hitEnemies.add(enemy); // 記下來，繼續往前飛 (remember, keep flying)
      } else {
        bullet.alive = false;
        return; // 一顆子彈只打中一個敵人 (one bullet, one hit)
      }
    }
  }

  /**
   * 在某個位置爆炸：範圍內的敵人和箱子都受到傷害，並產生爆炸特效 (explode)
   * 玩家不會被自己的爆炸炸到，比較好玩。(the player is immune to own explosions)
   * @param {number} x 中心 x
   * @param {number} y 中心 y
   * @param {number} radius 半徑
   * @param {number} damage 傷害
   */
  explode(x, y, radius, damage) {
    for (const enemy of this.enemies) {
      // 敵人身體任何一部分在爆炸範圍內就算：距離 < 爆炸半徑 + 敵人半徑 (any part inside the blast)
      if (Math.hypot(enemy.x - x, enemy.y - y) < radius + enemy.radius) {
        // 從爆炸中心往外推 (knock away from the blast center)
        this.hitEnemy(enemy, damage, Math.atan2(enemy.y - y, enemy.x - x));
      }
    }
    this.map.damageTilesInRadius(x, y, radius, damage);
    this.explosions.push(new Explosion(x, y, radius));
    this.startShake();
    playSound('explosion');
  }

  // ===== 打擊感 (game feel) =====

  /**
   * 敵人中彈：扣血、跳出傷害數字、往後退一點 (enemy got hit: damage, number, knockback)
   * @param {Enemy} enemy 被打中的敵人
   * @param {number} damage 傷害
   * @param {number} angle 被推開的方向，弧度 (knockback direction in radians)
   */
  hitEnemy(enemy, damage, angle) {
    enemy.takeDamage(damage);
    this.addDamageText(enemy, damage, DAMAGE_TEXT_COLOR);
    // 這一下打死了就讓死亡音效負責，不要兩個聲音疊在一起 (a killing blow gets the death sound instead)
    if (!enemy.isDead()) {
      playSound('hit');
    }

    // BOSS 很重，不會被推開；剛被推過的也先不推 (bosses are too heavy; respect the cooldown)
    if (enemy instanceof Boss || enemy instanceof Turret) return; // 太重或固定在地上，推不動 (too heavy / bolted down)
    if (enemy.knockbackCooldown > 0) return;
    enemy.knockbackCooldown = KNOCKBACK_COOLDOWN;
    // 用角色本來的 moveX / moveY，推進牆裡也會被擋住 (reuse wall collision)
    enemy.moveX(Math.cos(angle) * KNOCKBACK_DISTANCE, this.map);
    enemy.moveY(Math.sin(angle) * KNOCKBACK_DISTANCE, this.map);
  }

  /**
   * 在角色頭上加一個飄起來的傷害數字 (add a floating damage number above a character)
   * @param {Character} character 角色
   * @param {number} amount 傷害量
   * @param {string} color 顏色
   */
  addDamageText(character, amount, color) {
    // 隨機偏一點（左右偏多、上下偏少），霰彈一次打中好幾顆時數字才不會疊在一起 (random offset)
    const offsetX = (Math.random() * 2 - 1) * DAMAGE_TEXT_SPREAD;
    const offsetY = (Math.random() * 2 - 1) * DAMAGE_TEXT_SPREAD / 2;
    const x = character.x + offsetX;
    const y = character.y - character.radius - DAMAGE_TEXT_OFFSET_Y + offsetY;
    this.effects.push(new FloatingText(x, y, String(Math.round(amount)), color));
  }

  /**
   * 開始畫面震動 (start screen shake)
   */
  startShake() {
    this.shakeTimer = SCREEN_SHAKE_DURATION;
  }

  /**
   * 更新畫面震動：每幀隨機偏移，越接近結束晃得越小 (random offset that fades out)
   * @param {number} dt 經過秒數
   */
  updateShake(dt) {
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    // 剩下的時間比例 1 → 0，乘上去讓震動慢慢變小 (strength fades with remaining time)
    const strength = SCREEN_SHAKE_STRENGTH * (this.shakeTimer / SCREEN_SHAKE_DURATION);
    this.shakeX = (Math.random() * 2 - 1) * strength;
    this.shakeY = (Math.random() * 2 - 1) * strength;
  }

  /**
   * 更新所有特效，移除結束的 (update effects and remove finished ones)
   * @param {number} dt 經過秒數
   */
  updateEffects(dt) {
    for (const effect of this.effects) {
      effect.update(dt);
    }
    this.effects = this.effects.filter((effect) => !effect.isDone());
  }

  /**
   * 瞄準輔助：在玩家推的方向附近找一個看得到的敵人，把瞄準角度改成對準他 (aim assist)
   * 條件：距離在 AIM_ASSIST_RANGE 內、角度差在 AIM_ASSIST_ANGLE 內、中間沒被擋住。
   * 有好幾個符合時，選角度差最小的，也就是最接近玩家想瞄的那個。
   */
  applyAimAssist() {
    let bestEnemy = null;
    let bestDiff = AIM_ASSIST_ANGLE;

    for (const enemy of this.enemies) {
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      if (Math.hypot(dx, dy) > AIM_ASSIST_RANGE) continue;

      // 兩個角度相減後再用 atan2(sin, cos) 轉回 -π ~ π，才不會出現 350° 這種繞遠路的差 (wrap angle difference)
      const enemyAngle = Math.atan2(dy, dx);
      const raw = enemyAngle - input.aimAngle;
      const diff = Math.abs(Math.atan2(Math.sin(raw), Math.cos(raw)));
      if (diff > bestDiff) continue;

      if (!this.map.hasLineOfSight(this.player.x, this.player.y, enemy.x, enemy.y)) continue;

      bestEnemy = enemy;
      bestDiff = diff;
    }

    if (bestEnemy !== null) {
      input.aimAngle = Math.atan2(bestEnemy.y - this.player.y, bestEnemy.x - this.player.x);
    }
  }

  /**
   * 依機率在某個位置掉落彈藥；玩家沒有需要彈藥的槍就不掉 (maybe drop ammo)
   * @param {number} x 位置 x
   * @param {number} y 位置 y
   * @param {number} chance 機率 0 ~ 1
   */
  tryDropAmmo(x, y, chance) {
    if (!this.player.needsAmmo()) return;
    if (Math.random() < chance) {
      this.ammoPickups.push(new AmmoPickup(x, y));
    }
  }

  // ===== 繪製 (drawing) =====

  /**
   * 畫出地圖、子彈、角色，以及提示文字或死亡畫面 (draw everything)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   */
  draw(ctx) {
    // 開機畫面和歡迎畫面會蓋滿整個畫面，不用畫遊戲世界 (title screens cover everything; skip the world)
    if (this.state === 'splash') {
      drawSplash(ctx, this.menuTimer, isTouchMode());
      return;
    }
    if (this.state === 'menu') {
      drawMenu(ctx, this.bestStage, this.menuTimer, isTouchMode());
      return;
    }
    if (this.state === 'cutscene') {
      this.cutscene.draw(ctx, isTouchMode());
      return;
    }

    // 把鏡頭位置對齊到實際像素，畫面移動時圖案才不會一閃一閃 (snap the camera to physical pixels to avoid shimmer)
    const pixelScale = ctx.getTransform().a;
    const worldScale = pixelScale * CAMERA_ZOOM;
    const cameraX = Math.round(this.camera.x * worldScale) / worldScale;
    const cameraY = Math.round(this.camera.y * worldScale) / worldScale;

    // 整個遊戲世界往「鏡頭的反方向」移，玩家才會出現在畫面中間；再加上畫面震動 (move the world opposite the camera, plus shake)
    // HUD 在 restore 之後才畫，所以不會跟著動 (HUD is drawn after restore, so it stays put)
    ctx.save();
    // 順序：先震動（畫面像素）→ 再放大 → 再移到鏡頭位置 (shake in screen pixels, then zoom, then move to the camera)
    ctx.translate(this.shakeX, this.shakeY);
    ctx.scale(CAMERA_ZOOM, CAMERA_ZOOM);
    ctx.translate(-cameraX, -cameraY);

    this.map.draw(ctx, cameraX, cameraY, this.elapsed);

    for (const corpse of this.corpses) {
      corpse.draw(ctx, this.elapsed);
    }
    this.truck.draw(ctx, this.elapsed, this.state === 'playing' && this.canBoardTruck());
    for (const ammo of this.ammoPickups) {
      ammo.draw(ctx);
    }
    for (const potion of this.potions) {
      potion.draw(ctx);
    }
    if (this.item !== null) {
      this.item.draw(ctx);
    }
    if (this.intel !== null) {
      this.intel.draw(ctx, this.elapsed);
    }
    for (const hostage of this.hostages) {
      hostage.draw(ctx, this.elapsed);
    }
    if (this.bossReward !== null) {
      this.bossReward.draw(ctx);
    }

    for (const bullet of this.bullets) {
      bullet.draw(ctx);
    }
    // 敵人只在玩家視野裡才看得到，用 viewAlpha 淡入淡出 (enemies only show inside the view cone)
    for (const enemy of this.enemies) {
      if (enemy.viewAlpha <= 0) continue;
      ctx.globalAlpha = enemy.viewAlpha;
      enemy.draw(ctx);
      ctx.globalAlpha = 1;
    }
    if (this.state !== 'extracting') {
      this.player.draw(ctx);  // 撤離中玩家在車上，不畫 (riding in the truck while extracting)
    }
    // 草叢畫在角色上面，躲在裡面的人才會被蓋住 (bushes on top of characters so they hide them)
    this.map.drawBushes(ctx, cameraX, cameraY, this.player);

    for (const explosion of this.explosions) {
      explosion.draw(ctx);
    }
    for (const effect of this.effects) {
      effect.draw(ctx);
    }
    ctx.restore(); // 取消鏡頭和震動的偏移，接下來畫 HUD (undo camera & shake before the HUD)

    // 視野：面向的扇形是亮的，背後變暗；玩家在畫面上的位置 = 地圖座標 − 鏡頭 + 震動 (view cone; player's screen position)
    if (this.state === 'playing') {
      drawVisionShade(
        ctx,
        (this.player.x - cameraX) * CAMERA_ZOOM + this.shakeX,
        (this.player.y - cameraY) * CAMERA_ZOOM + this.shakeY,
        this.player.aimAngle
      );
    }

    // 機槍手的對話框畫在陰影上面，不會被視野擋住 (the gunner's speech bubble sits above the vision shade)
    if (this.state === 'playing') {
      this.truck.drawSpeech(ctx, { x: cameraX, y: cameraY });
    }

    // 撤離中：不畫 HUD，畫面慢慢變黑，中間寫下一關 (extracting: no HUD, fade to black with the next stage)
    if (this.state === 'extracting') {
      const fade = Math.min(1, Math.max(0, 1 - (this.extractTimer - 0.2) / EXTRACT_FADE_TIME));
      ctx.fillStyle = `rgba(4, 10, 6, ${fade})`;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      if (fade > 0.5) {
        ctx.globalAlpha = (fade - 0.5) * 2;
        drawCenterMessage(ctx, `Heading to stage ${this.stage + 1}...`);
        ctx.globalAlpha = 1;
      }
      return;
    }

    // ----- 最上層的介面 (UI layer) -----
    drawStatusHud(ctx, this.player);
    drawStageHud(ctx, this.stage, this.isBossStage(), this.getObjectiveText(), this.bestStage);
    drawWeaponHud(ctx, this.player);
    // 小地圖也只顯示看得到的敵人，不然背後的敵人一看小地圖就知道了 (minimap only shows enemies you can see)
    const visibleEnemies = this.enemies.filter((enemy) => enemy.viewAlpha > 0.5);
    // 任務目標也標在小地圖上：情報金色、人質淺藍 (mission markers: gold intel, cyan hostages)
    const markers = [];
    if (this.intel !== null) markers.push({ x: this.intel.x, y: this.intel.y, color: '#ffd740' });
    for (const hostage of this.hostages) {
      if (!hostage.rescued) markers.push({ x: hostage.x, y: hostage.y, color: '#4dd0e1' });
    }
    markers.push({ x: this.truck.x, y: this.truck.y, color: '#b2ff59' });
    drawMinimap(ctx, this.map, this.player, visibleEnemies, this.camera, markers);
    // 卡車停好、可以上車，但不在畫面內：畫面邊緣出現指向卡車的箭頭 (edge arrow to the truck when it's off-screen)
    if (this.truck.arrived && this.canBoardTruck()) {
      drawTargetArrow(ctx, this.truck, this.camera, this.elapsed);
    }

    // 觸控模式而且在遊戲中，才畫虛擬搖桿和按鈕 (touch controls only while playing on touch)
    if (isTouchMode() && this.state === 'playing') {
      drawTouchControls(ctx, getTouchControls());
    }

    if (this.messageTimer > 0) {
      drawCenterMessage(ctx, this.messageText);
    }
    if (this.state === 'dead') {
      drawGameOverScreen(
        ctx,
        this.stage,
        this.bestStage,
        this.isNewRecord(),
        this.deadTimer >= GAME_OVER_INPUT_DELAY,
        isTouchMode()
      );
    }
  }
}
