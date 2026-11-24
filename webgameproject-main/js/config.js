// 遊戲所有數值都集中在這裡，方便調整 (all game settings in one place)

// ===== 遊戲資訊與存檔 (game info & save data) =====
export const GAME_TITLE = '2D Shooting Game';       // 主選單標題 (menu title)
export const GAME_SUBTITLE = 'MIS 3C NETWORK PROGRAMMING FINAL PROJECT'; // 主選單副標題 (menu subtitle)
// 歡迎畫面標題下的一行說明 (tagline under the title on the welcome screen)
export const GAME_TAGLINE = 'JUNGLE WAR: GUERRILLAS VS THE ARMY';
// 歡迎畫面與死亡畫面用的卡通粗體字 Lilita One（檔案在 assets/fonts/），載入前先用 Arial Black
// (chunky cartoon font for the title screens; bundled in assets/fonts/, Arial Black until it loads)
export const TITLE_FONT = '"Lilita One", "Arial Black", sans-serif';
// localStorage 的 key：同一個網域下的網站共用 localStorage，加上專案名稱避免撞名 (storage key, prefixed)
export const STORAGE_KEY_BEST_STAGE = 'webgameproject.bestStage';
// 是否看過開場過場動畫；看過就不再自動播放 (has the intro cutscene been seen)
export const STORAGE_KEY_INTRO_SEEN = 'webgameproject.introSeen';

// ===== 任務與過場動畫 (missions & cutscene) =====
// 一般關卡：清光營地後營地裡出現機密情報，拿到後撤離卡車會來接你 (normal stages: clear the camp, grab the intel, the truck comes)
// BOSS 關：打倒敵軍指揮官（BOSS）之後，才能救出被綁的人質 (boss stages: defeat the commander, then rescue hostages)
export const INTEL_RADIUS = 14;           // 情報資料夾的撿取半徑 (intel pickup radius)
export const HOSTAGE_COUNT = 3;           // BOSS 關有幾個人質 (hostages per boss stage)
export const HOSTAGE_RADIUS = 14;         // 碰到人質的範圍 (hostage touch radius)
export const HOSTAGE_FADE_TIME = 1.2;     // 救出後幾秒淡出（被直升機接走）(seconds to fade out after rescue)
export const HOSTAGE_WARN_COOLDOWN = 2;   // 「先打倒指揮官」提示最少隔幾秒 (min seconds between "defeat the commander first" hints)
export const CUTSCENE_TEXT_SPEED = 45;    // 過場對話每秒出現幾個字 (typewriter speed, characters per second)
export const CUTSCENE_FADE_TIME = 0.45;   // 換鏡頭時黑幕淡入淡出幾秒 (fade time between shots)

// ===== 畫面與地圖尺寸 (screen & map size) =====
export const TILE_SIZE = 32;                        // 每一格的邊長，單位 px (tile size)
// 「畫面」和「地圖」是兩種大小 (the screen and the map are different sizes)：
//   畫面 GAME_WIDTH × GAME_HEIGHT：一次看得到的範圍，固定 896×416（寬:高 約 2.15:1，接近手機橫向螢幕）
//   地圖 WORLD_WIDTH × WORLD_HEIGHT：整個關卡，比畫面大，鏡頭 (camera) 會跟著玩家移動
export const GAME_WIDTH = TILE_SIZE * 28;           // 畫面邏輯寬度 = 896 (screen width)
export const GAME_HEIGHT = TILE_SIZE * 13;          // 畫面邏輯高度 = 416 (screen height)
export const MAP_COLS = 42;                         // 地圖有幾欄 (columns)
export const MAP_ROWS = 20;                         // 地圖有幾列 (rows)
export const WORLD_WIDTH = TILE_SIZE * MAP_COLS;    // 地圖寬度 = 1344 (world width)
export const WORLD_HEIGHT = TILE_SIZE * MAP_ROWS;   // 地圖高度 = 640 (world height)

// ===== 鏡頭 (camera) =====
// 鏡頭每秒追上玩家的速度，越大跟得越緊；用「每幀追一部分距離」的方式，移動起來比較滑順 (follow speed)
export const CAMERA_FOLLOW_SPEED = 6;
// 鏡頭往瞄準方向多看一點，才看得到前面的敵人 (look ahead toward the aim direction, px)
export const CAMERA_LOOK_AHEAD = 70;
// 鏡頭拉近：1 = 不放大；1.3 = 東西放大 1.3 倍，一次只看得到大約 21×10 格，要走過去才看得到整張地圖
// (camera zoom: 1.3 = everything 1.3× bigger, you see about 21×10 tiles at once, so you have to explore)
export const CAMERA_ZOOM = 1.3;
// 鏡頭一次看得到的地圖範圍（地圖座標）(how much of the world is visible at once, in world pixels)
export const VIEW_WIDTH = GAME_WIDTH / CAMERA_ZOOM;
export const VIEW_HEIGHT = GAME_HEIGHT / CAMERA_ZOOM;
// 畫布實際像素 = 邏輯尺寸 × 這個倍率；倍率會依螢幕大小和 devicePixelRatio 自動算，這裡只設上限，避免手機太吃效能
// (render scale cap: canvas pixels = logical size × scale; capped to protect weak phones)
export const MAX_RENDER_SCALE = 3;

// ===== 地圖生成 (map generation) =====
// 地圖由這幾種「地形」組成：河流 + 橋、泥土小路、叢林樹叢、石頭堆、散落的箱子、陷阱、出口旁的敵軍營地
// (the map is built from: a river with bridges, a dirt trail, jungle groves, rock piles, crates, traps, an enemy camp)
export const RIVER_CHANCE = 0.75;         // 每關有河流的機率 (chance that a stage has a river)
export const RIVER_WIDTH = 2;             // 河寬幾格 (river width in tiles)
export const BRIDGE_COUNT = 2;            // 河上有幾座橋 (bridges across the river)
export const GROVE_COUNT = 13;            // 叢林樹叢有幾叢 (number of tree groves)
export const GROVE_RADIUS_MIN = 1.5;      // 樹叢半徑，單位格 (grove radius in tiles)
export const GROVE_RADIUS_MAX = 3;
export const GROVE_DENSITY = 0.75;        // 樹叢範圍內每一格長樹的機率 (chance of a tree per tile)
// 樹叢裡每一格是「草叢」的機率，其餘是棕櫚樹 (share of grove tiles that are bushes instead of palm trees)
// 草叢可以走進去躲起來，子彈也能穿過，但敵人看不穿 (bushes: walk in, bullets pass, enemies can't see through)
export const GROVE_BUSH_RATIO = 0.65;
export const BUSH_PATCH_COUNT = 7;        // 另外散落的小草叢數量 (extra small bush patches)
export const BUSH_PATCH_SIZE = 4;         // 每片最多幾格 (max tiles per patch)
export const ROCK_PILE_COUNT = 8;         // 石頭堆數量 (number of rock piles)
export const ROCK_PILE_SIZE = 3;          // 每堆最多幾顆 (max rocks per pile)
export const CRATE_COUNT = 12;            // 散落的箱子數量 (loose crates)
export const TRAP_COUNT = 6;              // 散落的陷阱數量 (loose traps)
export const TRAIL_TRAP_COUNT = 3;        // 放在小路上的陷阱 (traps hidden on the trail)
export const CAMP_RADIUS = 4;             // 出口旁敵軍營地的沙包牆，離出口幾格 (sandbag ring distance from the exit)
export const CAMP_CRATE_COUNT = 4;        // 營地裡的補給箱 (supply crates inside the camp)
// 營地的設施：每一關隨機出現，所以每個基地長得不一樣 (camp structures, randomized per stage)
export const TOWER_CHANCE = 0.5;          // 沙包牆的四個轉角，每個轉角蓋空瞭望塔的機率 (chance of an empty watchtower per wall corner)
export const TOWER_MAX = 2;               // 最多幾座瞭望塔 (max watchtowers)
export const WIRE_CHANCE = 0.7;           // 每個門外拉鐵絲網的機率 (chance of barbed wire outside each gate)
export const WIRE_LENGTH = 3;             // 鐵絲網從門口往外斜拉幾格，形成漏斗 (wire funnel length in tiles)
// 自動砲塔一定架在建築物的屋頂上（指揮碉堡或瞭望塔）(turrets are always mounted on a roof: the bunker or a watchtower)
export const TURRET_SLOTS = 2;            // 第一個 BOSS 之後，最多幾座砲塔 (max turrets after the first boss)
export const TURRET_MAX_BEFORE_BOSS = 1;  // 第一個 BOSS 之前，最多幾座（少於 2）(max turrets before the first boss fight)
export const TURRET_CHANCE = 0.5;         // 每個牆角蓋「砲塔瞭望塔」的機率 (chance per wall corner of a turret tower)
export const TURRET_MIN_STAGE = 2;        // 第幾關開始才有砲塔，第 1 關比較簡單 (turrets appear from this stage)
// 自動砲塔：不會動、會轉，血比一般敵人多、射得比較快 (gun turret: stationary, tougher, faster firing)
export const TURRET_RADIUS = 13;
export const TURRET_HP_MULTIPLIER = 1.8;          // 血量 = 一般敵人 × 這個倍數 (HP vs a normal enemy)
export const TURRET_FIRE_INTERVAL_MULTIPLIER = 0.55; // 開槍間隔 = 一般敵人 × 這個倍數（越小越快）(fire interval vs a normal enemy)
export const TURRET_SIGHT_RANGE = 420;            // 砲塔看得到多遠 (turret sight range, px)
export const TURRET_SCAN_SPEED = 0.8;             // 沒看到人時，砲塔來回掃視的轉速（弧度 / 秒）(idle scan speed)

// ===== 屍體搜身 (searching corpses) =====
// 敵人死後留下屍體，站在旁邊一下子就會自動搜身 (enemies leave corpses; stand next to one to search it)
export const CORPSE_SEARCH_RADIUS = 18;   // 多近才搜得到（再加上屍體半徑）(search distance, plus the body radius)
export const CORPSE_SEARCH_TIME = 0.8;    // 搜一具要幾秒 (seconds to search one corpse)
export const CORPSE_BANDAGE_CHANCE = 0.25; // 身上有繃帶的機率 (chance of finding a bandage)
export const CORPSE_BANDAGE_HEAL = 15;    // 繃帶回幾滴血 (HP from a bandage)
export const BOSS_CORPSE_AMMO_MULTIPLIER = 2; // BOSS 身上的彈藥是一般敵人的幾倍 (boss carries more ammo)

// ===== 敵人兵種 (enemy roles) =====
// 步槍兵（一般）、狙擊手、近戰兵；近戰兵每關最多 1 個 (riflemen, snipers, and at most one melee fighter per stage)
export const SNIPER_EVERY = 3;                  // 每 3 個敵人有 1 個狙擊手 (one sniper per this many enemies)
export const SNIPER_SIGHT_MULTIPLIER = 1.6;     // 看得比較遠 (sees farther)
export const SNIPER_PREFERRED_DISTANCE = 380;   // 喜歡保持的距離 (likes to stay this far away)
export const SNIPER_RETREAT_DISTANCE = 260;     // 比這個近就後退 (backs off when closer than this)
export const SNIPER_FIRE_INTERVAL_MULTIPLIER = 2.6; // 開槍很慢 (fires slowly)
export const SNIPER_DAMAGE_MULTIPLIER = 2.2;    // 但很痛 (but hits hard)
export const SNIPER_BULLET_SPEED_MULTIPLIER = 1.9;
export const SNIPER_BULLET_RANGE = 950;
export const SNIPER_SPREAD = 0.01;              // 很準 (very accurate)
export const SNIPER_AIM_TIME = 0.7;             // 開槍前紅色雷射瞄準線出現幾秒，給玩家閃避的時間 (red laser shows this long before a shot)
export const SNIPER_HP_MULTIPLIER = 0.8;
export const SNIPER_SPEED_MULTIPLIER = 0.8;
export const MELEE_SPEED_MULTIPLIER = 1.6;      // 近戰兵跑得快 (melee fighters are fast)
export const MELEE_HP_MULTIPLIER = 1.3;
export const MELEE_DAMAGE_MULTIPLIER = 1.6;     // 砍一刀 = 一般子彈傷害 × 這個倍數 (machete hit vs a bullet)
export const MELEE_REACH = 10;                  // 身體碰到之後再多幾 px 砍得到 (reach beyond touching, px)
export const MELEE_INTERVAL = 0.9;              // 每幾秒砍一刀 (seconds between hits)

// ===== 聽到槍聲 (reacting to gunfire) =====
// 玩家開槍時，營地裡的敵人會出來，朝槍聲的方向就定位 (guards come out and take positions toward the gunshot)
export const NOISE_RIFLE_DISTANCE = 230;        // 步槍兵站在離槍聲多遠的地方 (riflemen stop this far from the noise)
export const NOISE_SNIPER_DISTANCE = 380;       // 狙擊手站得比較遠 (snipers hold farther back)
export const NOISE_SPREAD = 90;                 // 左右散開多少，才不會排成一排 (sideways spread so they fan out)
export const NOISE_RESPONSE_COOLDOWN = 1.5;     // 同一個敵人多久才會重新找位置 (min seconds between repositioning)

// ===== 撤離卡車 (extraction truck) =====
// 任務完成後（一般關：偷到情報；BOSS 關：救出人質、撿起 BOSS 獎勵），皮卡車會開到營地正門外接你
// (once the mission is done, a pickup truck drives up outside the front gate to pick you up)
export const TRUCK_SPEED = 150;           // 開過來的速度 px/秒 (driving speed)
export const TRUCK_PARK_OFFSET = 3;       // 停在正門外幾格 (tiles outside the front gate)
export const TRUCK_LENGTH = 80;           // 車身長度 px（畫圖用）(truck length for drawing)
export const TRUCK_BOARD_RADIUS = 44;     // 離車多近才上得了車 (how close to stand to board)
export const TRUCK_BOARD_TIME = 1.0;      // 上車要幾秒（跟搜屍體一樣站著等）(seconds to board, like searching a corpse)
// 後斗的友軍機槍手 (the allied machine gunner on the truck bed)
export const TRUCK_GUN_RANGE = 380;       // 機槍射程 (range)
export const TRUCK_GUN_INTERVAL = 0.24;   // 開槍間隔（射速快，但很不準、很弱，用來壓制）(seconds between shots: fast, but weak and inaccurate)
export const TRUCK_GUN_DAMAGE = 2.8;      // 第 1 關的傷害 (damage at stage 1)
export const TRUCK_GUN_DAMAGE_GROWTH = 0.15; // 每關傷害成長 (damage growth per stage)
export const TRUCK_GUN_SPREAD = 0.31;     // 散布很大：近距離打得到，遠距離大多打偏 (wide spread: hits up close, mostly misses far away; radians)
export const TRUCK_GUNNER_SIZE = 60;      // 機槍手畫多大（像素）(gunner sprite size in pixels)
// 上車之後：引擎發動、卡車開走、畫面淡出，共幾秒 (after boarding: engine start, drive off, fade out; total seconds)
export const EXTRACT_TIME = 2.8;
export const EXTRACT_DEPART_DELAY = 1.1;  // 引擎發動之後才開始開走 (the truck starts rolling after the engine catches)
export const EXTRACT_FADE_TIME = 1.2;     // 最後幾秒淡出成黑畫面 (fade-out length at the end)
export const TRUCK_DEPART_ACCEL = 260;    // 開走時的加速度 (px/s², acceleration when driving off)
export const TRUCK_SPAWN_ROW_OFFSET = -2; // 關卡開始時卡車停在玩家出生點上方幾格 (truck parks this many rows from the spawn at stage start)
export const GUNNER_LINE_TIME = 3;        // 機槍手一句話顯示幾秒 (seconds a gunner line stays up)
export const GUNNER_GREETING_DELAY = 1.2; // 關卡開始後幾秒說「祝好運」(delay before the start-of-stage line)
export const GUNNER_CHATTER_TIME = 7;     // 伏擊時每隔幾秒喊一句 (seconds between shouts during an ambush)

// ===== 伏擊 (ambush wave) =====
// 拿到情報、走出營地後，有機率一波敵人從叢林邊緣衝過來 (after the mission, leaving the camp may trigger an ambush)
export const WAVE_CHANCE = 0.5;           // 發生伏擊的機率 (chance of an ambush)
// 伏擊兵的組成，依關卡而定：stage 是「從第幾關開始」(ambush squad by stage; each row applies from that stage on)
export const WAVE_SQUADS = [
  { stage: 1, melee: 3, rifleman: 0, sniper: 0 },
  { stage: 2, melee: 2, rifleman: 2, sniper: 0 },
  { stage: 4, melee: 3, rifleman: 1, sniper: 0 },
  { stage: 5, melee: 4, rifleman: 1, sniper: 1 },
];
export const WAVE_MIN_DISTANCE = 14;      // 伏擊兵出現的位置至少離玩家幾格 (spawn at least this many tiles away)
export const WAVE_REPATH_TIME = 1.5;      // 伏擊兵每幾秒重新找一次去玩家的路 (seconds between re-pathing to the player)

// ===== 巡邏兵 (patrols) =====
// 每一關有機率在營地外面多 1~2 個巡邏兵；聽到槍聲就會跑回營地支援 (patrols outside the camp run back when they hear gunfire)
export const PATROL_CHANCE = 0.25;        // 這一關有巡邏兵的機率 (chance a stage has patrols)
export const PATROL_MAX = 2;              // 最多幾個巡邏兵 (max patrol soldiers)
export const PATROL_POINTS = 3;           // 每條巡邏路線有幾個點 (waypoints per patrol route)
export const PATROL_SPEED_MULTIPLIER = 0.55; // 巡邏時走比較慢 (patrols walk slower)
export const GUNSHOT_HEARING_RANGE = 1600; // 多遠以內聽得到槍聲；1600 ≈ 整張地圖 (how far enemies hear gunshots; 1600 ≈ the whole map)
export const PLAYER_SPAWN_COL = 2;        // 玩家出生在第幾欄 (spawn column)
export const PLAYER_SPAWN_ROW = Math.floor(MAP_ROWS / 2); // 玩家出生在正中間那一列 = 10 (spawn row: middle)
export const SAFE_ZONE_RADIUS = 2;        // 出生點周圍幾格內不放障礙物 (safe zone in tiles)
export const MAP_GEN_MAX_ATTEMPTS = 100;  // 最多重新生成幾次 (max regeneration attempts)
// 敵軍營地的中心在地圖右邊，離邊緣 5 格，留空間給營地的沙包牆 (camp center on the right, room for the camp walls)
export const EXIT_COL = MAP_COLS - 5;     // 出口在第幾欄 = 37（列是隨機的）(exit column; row is random)
export const EXIT_SAFE_RADIUS = 1;        // 出口周圍幾格內不放障礙物 (safe zone around exit)

// ===== 草叢躲藏 (hiding in bushes) =====
// 玩家躲在草叢裡時，敵人要靠到這麼近才會發現 (enemies notice a hidden player only this close, px)
export const BUSH_REVEAL_DISTANCE = 48;
// 在草叢裡開槍會暴露位置幾秒 (firing from a bush gives you away for this many seconds)
export const BUSH_FIRE_REVEAL_TIME = 1.2;
// 玩家站在草叢附近時，草叢變半透明，玩家才看得到自己 (bush opacity when the player is inside)
export const BUSH_SEE_THROUGH_ALPHA = 0.45;

// ===== 視野 (field of view) =====
// 像 Project Zomboid：玩家面向的扇形是亮的，背後變暗 (bright cone in front, darker behind)
export const VISION_HALF_ANGLE = Math.PI / 3;  // 扇形半角 60°，所以視野總共 120° (half angle of the view cone)
export const VISION_SHADE_ALPHA = 0.65;        // 背後暗多少，0 = 不暗、1 = 全黑 (how dark behind)
export const VISION_NEAR_RADIUS = 56;          // 玩家身邊這個半徑內永遠看得到 (always-visible radius around the player)
// 視野外的敵人完全看不到；進出視野時用淡入淡出，這是每秒變化的速度 (enemies outside the cone are hidden; fade speed per second)
export const VISION_FADE_SPEED = 6;

// ===== 關卡流程 (stage flow) =====
export const MESSAGE_TIME = 1.5;          // 畫面中央提示文字顯示幾秒 (center message duration)
// 死亡後至少等幾秒才接受「重新開始」，避免還在狂點射擊時不小心直接重來 (restart input delay)
export const GAME_OVER_INPUT_DELAY = 1.0;

// ===== 碰撞 (collision) =====
// 撞牆後往外多推一點點，避免剛好貼在格線上被判定成重疊 (tiny push-out gap)
export const COLLISION_EPSILON = 0.001;
// 檢查視線時，沿著直線每隔幾 px 檢查一次 (line-of-sight sampling step)
export const LOS_STEP = 4;

// ===== 箱子與陷阱 (crates & traps) =====
export const CRATE_HP = 30;               // 箱子耐久度 (crate durability)
export const TRAP_DAMAGE = 10;            // 踩到陷阱扣多少血 (trap damage)
export const TRAP_COOLDOWN = 1.0;         // 站在陷阱上，每幾秒扣一次血 (seconds between trap hits)
export const TRAP_ENEMY_SPEED_MULTIPLIER = 0.5; // 敵人認得自己的陷阱，不會受傷，只是要放慢腳步跨過去 (enemies know their traps: no damage, just slower)
export const WIRE_SPEED_MULTIPLIER = 0.4;  // 鐵絲網走得過去，但速度剩 40%（慢 60%）(barbed wire: walkable at 40% speed, i.e. 60% slower)
export const ENEMY_REPATH_TIME = 0.5;       // 追人時多久重新找一次路 (seconds between re-paths while chasing)
export const ENEMY_STUCK_TIME = 0.5;        // 卡住多久就換條路走 (seconds without progress before re-routing)

// ===== Game loop =====
// 一幀最多算 0.1 秒，避免切換分頁回來時角色瞬間移動很遠 (max delta time per frame)
export const MAX_DELTA_TIME = 0.1;

// ===== 顏色 (colors) =====
export const CRATE_COLOR = '#8d6e63';
export const CRATE_EDGE_COLOR = '#5d4037';
export const ROCK_COLOR = '#90a4ae';
export const ROCK_HIGHLIGHT_COLOR = '#b0bec5';
export const TREE_COLOR = '#2e7d32';
export const TREE_HIGHLIGHT_COLOR = '#43a047';
export const TRAP_COLOR = '#4e342e';
export const TRAP_SPIKE_COLOR = '#e57373';
export const HIT_FLASH_COLOR = '#ffffff';                 // 受傷閃白 (hit flash)
export const HP_BAR_BG_COLOR = 'rgba(0, 0, 0, 0.6)';
export const HP_BAR_COLOR = '#66bb6a';
export const ARMOR_BAR_COLOR = '#90caf9';                  // 護甲條 (armor bar)
export const ITEM_BORDER_COLOR = '#ffffff';
export const ITEM_TEXT_COLOR = '#1b1b1b';
export const MEDKIT_COLOR = '#ef9a9a';
export const ARMOR_COLOR = '#90caf9';
export const ADRENALINE_COLOR = '#80deea';
export const POWER_AMMO_COLOR = '#ffcc80';
export const LIFE_ESSENCE_COLOR = '#f48fb1';
export const QUICK_GLOVES_COLOR = '#c5e1a5';
export const SPEED_BUFF_RING_COLOR = 'rgba(128, 222, 234, 0.8)';   // 加速中的外圈 (speed buff ring)
export const DAMAGE_BUFF_RING_COLOR = 'rgba(255, 204, 128, 0.8)';  // 強化彈藥中的外圈 (damage buff ring)
export const GAME_OVER_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.6)';
export const GAME_OVER_TEXT_COLOR = '#ffffff';
export const EXIT_CLOSED_COLOR = '#455a64';               // 出口關閉 (exit closed)
export const EXIT_OPEN_COLOR = '#66bb6a';                 // 出口開啟 (exit open)
export const EXIT_BORDER_COLOR = '#263238';
export const MESSAGE_BG_COLOR = 'rgba(0, 0, 0, 0.5)';
export const MESSAGE_TEXT_COLOR = '#ffffff';

// ===== 輔助道具 (items) =====
export const ITEM_RADIUS = 11;                 // 道具圓形半徑 (item radius)
export const MEDKIT_HEAL = 30;                 // 醫療包回復量 (medkit heal amount)
export const ARMOR_AMOUNT = 50;                // 護甲每次增加量 (armor per pickup)
export const MAX_ARMOR = 100;                  // 護甲上限 (armor cap)
export const BUFF_DURATION = 15;               // 暫時效果持續秒數 (buff duration in seconds)
export const ADRENALINE_SPEED_BONUS = 0.4;     // 腎上腺素：移動速度 +40% (speed bonus)
export const POWER_AMMO_DAMAGE_BONUS = 0.5;    // 強化彈藥：傷害 +50% (damage bonus)
export const LIFE_ESSENCE_MAX_HP = 10;         // 生命精華：最大 HP +10 (max HP bonus)
export const QUICK_GLOVES_RELOAD_BONUS = 0.15; // 快手套：換彈速度 +15% (reload speed bonus)

// ===== 武器 HUD（左下角）(weapon HUD, bottom-left) =====
export const HUD_MARGIN = 12;             // 離畫面邊緣幾 px (margin from screen edge)
export const HUD_SLOT_SIZE = 22;          // 武器格子大小 (weapon slot size)
export const HUD_SLOT_GAP = 4;            // 格子間距 (gap between slots)
export const HUD_BAR_WIDTH = 76;          // 換彈 / 預熱進度條寬度 (progress bar width)
export const HUD_BAR_HEIGHT = 6;
export const HUD_BG_COLOR = 'rgba(0, 0, 0, 0.55)';
export const HUD_TEXT_COLOR = '#ffffff';
export const HUD_SUBTEXT_COLOR = '#b0bec5';
export const HUD_SLOT_OWNED_COLOR = '#546e7a';      // 已取得的武器格 (owned slot)
export const HUD_SLOT_EMPTY_COLOR = '#263238';      // 未取得的武器格 (locked slot)
export const HUD_SLOT_SELECTED_COLOR = '#ffeb3b';   // 目前武器的外框 (selected slot border)
export const HUD_RELOAD_COLOR = '#90caf9';
export const HUD_SPIN_COLOR = '#ffab40';

// ===== 狀態 HUD（左上角血量、右上角關卡）(status HUD) =====
export const HUD_HP_BAR_WIDTH = 180;
export const HUD_HP_BAR_HEIGHT = 14;
export const HUD_HP_COLOR = '#66bb6a';
export const HUD_HP_LOW_COLOR = '#ef5350';          // 血量低時變紅 (low HP color)
export const HUD_HP_LOW_RATIO = 0.3;                // 血量低於 30% 算「低」(low HP threshold)
export const HUD_ARMOR_COLOR = '#90caf9';
export const HUD_ADRENALINE_COLOR = '#80deea';
export const HUD_POWER_AMMO_COLOR = '#ffcc80';
export const HUD_STAGE_PANEL_WIDTH = 150;
// 小地圖：每一格畫成幾 px，42×20 格 × 3 = 126×60 (minimap: px per tile)
export const MINIMAP_TILE_PX = 3;
// 小地圖放在右上角關卡資訊下面 (minimap sits under the stage panel, top-right)
export const MINIMAP_TOP = 78;
// 出口在畫面外時，指示箭頭離畫面邊緣幾 px (exit arrow distance from the screen edge)
export const EXIT_ARROW_MARGIN = 34;

// ===== 手機觸控操作 (touch controls) =====
export const TOUCH_STICK_RADIUS = 60;        // 搖桿最多能推多遠，單位 px (max knob distance)
export const TOUCH_KNOB_RADIUS = 24;         // 搖桿頭大小 (knob size)
export const TOUCH_DEADZONE = 0.2;           // 推不到 20% 當作沒推，避免手指輕微晃動 (dead zone ratio)
export const TOUCH_SLOT_PADDING = 8;
// 瞄準輔助（只有手機）：推的方向附近有敵人，就自動對準他 (aim assist, touch only)
export const AIM_ASSIST_ANGLE = 20 * Math.PI / 180; // 方向差 20° 以內才幫忙對準，換成弧度 (max angle, in radians)
export const AIM_ASSIST_RANGE = 450;                 // 多遠以內的敵人才算 (max distance in px)         // 武器欄的觸控範圍往外多 8px，比較好點 (extra hit area)
// 沒在推的時候，畫一個淡淡的搖桿提示在這裡 (hint position when the stick is idle)
export const TOUCH_LEFT_HINT_X = 160;
export const TOUCH_LEFT_HINT_Y = GAME_HEIGHT - 120;
export const TOUCH_RIGHT_HINT_X = GAME_WIDTH - 220;
export const TOUCH_RIGHT_HINT_Y = GAME_HEIGHT - 120;
// 右下角的按鈕：換彈、換槍 (buttons at the bottom-right)
export const RELOAD_BUTTON = { x: GAME_WIDTH - 60, y: GAME_HEIGHT - 60, radius: 36, label: 'RELOAD' };
export const SWITCH_BUTTON = { x: GAME_WIDTH - 60, y: GAME_HEIGHT - 150, radius: 30, label: 'SWAP' };
export const TOUCH_BASE_COLOR = 'rgba(255, 255, 255, 0.15)';
export const TOUCH_BASE_BORDER_COLOR = 'rgba(255, 255, 255, 0.35)';
export const TOUCH_KNOB_COLOR = 'rgba(255, 255, 255, 0.45)';
export const TOUCH_HINT_COLOR = 'rgba(255, 255, 255, 0.08)';
export const TOUCH_BUTTON_COLOR = 'rgba(0, 0, 0, 0.45)';
export const TOUCH_BUTTON_TEXT_COLOR = 'rgba(255, 255, 255, 0.85)';

// ===== 主選單與死亡畫面 (menu & game over) =====
export const MENU_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.7)';
export const MENU_TITLE_COLOR = '#ffeb3b';
export const MENU_TEXT_COLOR = '#ffffff';
export const MENU_SUBTEXT_COLOR = '#b0bec5';
export const NEW_RECORD_COLOR = '#ffd54f';
// 開始提示的閃爍週期，單位秒 (blink period of the "press to start" hint)
export const MENU_BLINK_PERIOD = 1.0;

// ===== 美術圖片 (sprites) =====
// 角色圖片的顯示大小 = 角色半徑 × 這個倍數。例如玩家半徑 12 → 圖片畫成 43×43 (sprite size = radius × scale)
// 圖片比身體大，是為了留空間給槍；碰撞範圍不受圖片大小影響 (bigger than the body to fit the gun)
export const CHARACTER_SPRITE_SCALE = 3.6;
export const HIT_FLASH_ALPHA = 0.6;       // 有圖片時，受傷閃白的透明度 (flash opacity over sprites)

// ===== 受傷效果與血條 (hit effect & HP bar) =====
export const HIT_FLASH_TIME = 0.1;        // 受傷閃白幾秒 (flash duration)
export const HP_BAR_WIDTH = 28;
export const HP_BAR_HEIGHT = 4;
export const HP_BAR_OFFSET = 8;           // 血條在身體上方幾 px (gap above body)

// ===== 玩家 (player) =====
export const PLAYER_RADIUS = 12;          // 玩家圓形半徑，單位 px (radius)
export const PLAYER_SPEED = 160;          // 移動速度，單位 px/秒 (pixels per second)
export const PLAYER_COLOR = '#4fc3f7';
export const PLAYER_MAX_HP = 150;         // 玩家最大血量 (max HP)
export const STAGE_HEAL = 25;             // 每進入新的一關回復多少 HP (heal on entering a new stage)
export const GUN_LENGTH = 20;             // 槍管長度，從圓心算起，單位 px (barrel length)
export const GUN_WIDTH = 6;               // 槍管粗細 (barrel width)
export const GUN_COLOR = '#cfd8dc';

// ===== 武器 (weapons) =====
// 8 把槍的資料表，順序就是取得順序：手槍是第 1 把，第 N 個 BOSS 掉第 N+1 把 (weapon table, in unlock order)
// 欄位說明 (fields):
//   damage 每發傷害；fireInterval 開槍間隔秒數；magazineSize 彈匣容量；reloadTime 換彈秒數
//   bulletSpeed 子彈速度 px/秒；range 射程 px；spread 散布角度（弧度）；pellets 一次射出幾顆
//   startReserve 取得時的備彈；maxReserve 備彈上限；infiniteReserve 備彈是否無限
//   pierce 是否貫穿敵人與箱子；explosionRadius 爆炸半徑 px（0 = 不爆炸）
//   firingMoveMultiplier 開火時的移動速度倍率（1 = 不減速）；spinUpTime 開火前要空轉幾秒（0 = 不用）
//   bulletRadius、bulletColor 子彈外觀
export const WEAPONS = [
  {
    id: 'pistol', name: 'Pistol',
    damage: 10, fireInterval: 0.3, magazineSize: 12, reloadTime: 1.0,
    bulletSpeed: 500, range: 700, spread: 0.02, pellets: 1,
    startReserve: 0, maxReserve: 0, infiniteReserve: true,
    pierce: false, explosionRadius: 0, firingMoveMultiplier: 1, spinUpTime: 0,
    bulletRadius: 3, bulletColor: '#ffeb3b',
  },
  {
    id: 'shotgun', name: 'Shotgun',
    damage: 8, fireInterval: 0.8, magazineSize: 6, reloadTime: 1.6,
    bulletSpeed: 450, range: 260, spread: 0.35, pellets: 6,
    startReserve: 18, maxReserve: 36, infiniteReserve: false,
    pierce: false, explosionRadius: 0, firingMoveMultiplier: 1, spinUpTime: 0,
    bulletRadius: 3, bulletColor: '#ffe082',
  },
  {
    id: 'smg', name: 'SMG',
    damage: 6, fireInterval: 0.08, magazineSize: 30, reloadTime: 1.4,
    bulletSpeed: 520, range: 550, spread: 0.15, pellets: 1,
    startReserve: 90, maxReserve: 180, infiniteReserve: false,
    pierce: false, explosionRadius: 0, firingMoveMultiplier: 1, spinUpTime: 0,
    bulletRadius: 2, bulletColor: '#fff59d',
  },
  {
    id: 'rifle', name: 'Assault Rifle',
    damage: 12, fireInterval: 0.12, magazineSize: 30, reloadTime: 1.6,
    bulletSpeed: 600, range: 750, spread: 0.05, pellets: 1,
    startReserve: 90, maxReserve: 180, infiniteReserve: false,
    pierce: false, explosionRadius: 0, firingMoveMultiplier: 1, spinUpTime: 0,
    bulletRadius: 3, bulletColor: '#ffd54f',
  },
  {
    id: 'sniper', name: 'Sniper Rifle',
    damage: 60, fireInterval: 1.2, magazineSize: 5, reloadTime: 2.2,
    bulletSpeed: 1100, range: 1000, spread: 0, pellets: 1,
    startReserve: 15, maxReserve: 30, infiniteReserve: false,
    pierce: true, explosionRadius: 0, firingMoveMultiplier: 1, spinUpTime: 0,
    bulletRadius: 3, bulletColor: '#ffffff',
  },
  {
    id: 'grenade', name: 'Grenade Launcher',
    damage: 40, fireInterval: 0.9, magazineSize: 4, reloadTime: 2.0,
    bulletSpeed: 350, range: 400, spread: 0.02, pellets: 1,
    startReserve: 12, maxReserve: 24, infiniteReserve: false,
    pierce: false, explosionRadius: 70, firingMoveMultiplier: 1, spinUpTime: 0,
    bulletRadius: 5, bulletColor: '#9ccc65',
  },
  {
    id: 'lmg', name: 'LMG',
    damage: 14, fireInterval: 0.1, magazineSize: 100, reloadTime: 3.5,
    bulletSpeed: 600, range: 750, spread: 0.08, pellets: 1,
    startReserve: 200, maxReserve: 400, infiniteReserve: false,
    pierce: false, explosionRadius: 0, firingMoveMultiplier: 0.5, spinUpTime: 0,
    bulletRadius: 3, bulletColor: '#ffca28',
  },
  {
    id: 'gatling', name: 'Gatling',
    damage: 10, fireInterval: 0.04, magazineSize: 200, reloadTime: 4.0,
    bulletSpeed: 650, range: 700, spread: 0.12, pellets: 1,
    startReserve: 400, maxReserve: 800, infiniteReserve: false,
    pierce: false, explosionRadius: 0, firingMoveMultiplier: 1, spinUpTime: 1.0,
    bulletRadius: 2, bulletColor: '#ffab40',
  },
];

// ===== 子彈與爆炸 (bullets & explosions) =====
// 子彈每次最多前進幾 px 就檢查一次碰撞，避免高速子彈「穿過」牆或敵人 (sub-step size, prevents tunneling)
export const BULLET_STEP_SIZE = 8;
// ===== 打擊感 (game feel) =====
export const SCREEN_SHAKE_DURATION = 0.2;    // 畫面震動幾秒 (shake duration)
export const SCREEN_SHAKE_STRENGTH = 5;      // 最多偏移幾 px (max shake offset)
export const KNOCKBACK_DISTANCE = 6;         // 敵人中彈被推開幾 px，BOSS 不會被推 (knockback; bosses are immune)
// 被推開後隔多久才能再被推；不然加特林一秒 25 發會把敵人一路推走 (knockback cooldown, stops fast guns pinning enemies)
export const KNOCKBACK_COOLDOWN = 0.15;
export const DAMAGE_TEXT_DURATION = 0.6;     // 傷害數字顯示幾秒 (damage number lifetime)
export const DAMAGE_TEXT_RISE_SPEED = 40;    // 每秒往上飄幾 px (rise speed)
export const DAMAGE_TEXT_SPREAD = 14;        // 數字位置隨機偏移幾 px，霰彈同時打中好幾顆時才不會疊在一起 (random offset)
export const DAMAGE_TEXT_OFFSET_Y = 14;      // 數字出現在頭頂再往上幾 px，避開血條 (start above the HP bar)
export const DAMAGE_TEXT_COLOR = '#ffeb3b';         // 打中敵人的數字 (damage dealt)
export const PLAYER_DAMAGE_TEXT_COLOR = '#ff5252';  // 玩家受傷的數字 (damage taken)
export const DAMAGE_TEXT_OUTLINE_COLOR = '#212121';
export const PARTICLE_DURATION = 0.45;       // 碎片存在幾秒 (particle lifetime)
export const PARTICLE_SPEED = 160;           // 碎片噴出的速度 px/秒 (particle speed)
export const PARTICLE_RADIUS = 3;
export const PARTICLE_FRICTION = 0.05;       // 每秒速度剩下 5%，噴出去後很快停下 (velocity kept per second)
export const DEATH_PARTICLE_COUNT = 14;      // 敵人死掉噴幾顆 (particles on enemy death)
export const CRATE_PARTICLE_COUNT = 8;       // 箱子破掉噴幾顆 (particles on crate break)

export const EXPLOSION_DURATION = 0.3;    // 爆炸畫面持續幾秒 (explosion visual duration)
export const EXPLOSION_COLOR = 'rgba(255, 152, 0, 0.6)';

// ===== 彈藥掉落 (ammo drops) =====
export const ENEMY_AMMO_DROP_CHANCE = 0.4;  // 敵人死亡時掉彈藥的機率 (chance per enemy)
export const CRATE_AMMO_DROP_CHANCE = 0.3;  // 箱子被打破時掉彈藥的機率 (chance per crate)
export const AMMO_PICKUP_RATIO = 0.3;       // 撿到彈藥時，每把槍補「備彈上限 × 30%」(refill ratio)
export const AMMO_PICKUP_RADIUS = 9;
export const AMMO_PICKUP_COLOR = '#a1887f';
export const AMMO_PICKUP_TEXT_COLOR = '#ffffff';

// ===== 回血藥 (health potion) =====
// 箱子被打破時有機率掉回血藥；掉了回血藥就不再掉彈藥，免得兩個疊在一起 (potion OR ammo, not both)
export const CRATE_POTION_DROP_CHANCE = 0.18; // 箱子掉回血藥的機率 18% (chance per crate)
export const POTION_HEAL = 20;                 // 回血藥回復量，比醫療包的 30 少 (heal amount)
export const POTION_RADIUS = 8;
export const POTION_COLOR = '#e53935';
export const POTION_TEXT_COLOR = '#ffffff';

// ===== 敵人 (enemy) =====
// 以下是「第 1 關」的基礎數值，之後的關卡依「敵人強度成長」放大 (stage-1 base values)
export const ENEMY_BASE_COUNT = 2;        // 第 1 關的敵人數量 (enemies in stage 1)
export const ENEMY_RADIUS = 12;
export const ENEMY_SPEED = 90;            // 比玩家慢，玩家才逃得掉 (slower than player)
export const ENEMY_MAX_HP = 30;           // 手槍 3 發打死 (3 pistol shots)
export const ENEMY_COLOR = '#ef5350';
export const ENEMY_SIGHT_RANGE = 400;     // 看得到多遠 (sight range in px)
export const ENEMY_PREFERRED_DISTANCE = 220; // 比這遠就靠近玩家 (approach if farther)
export const ENEMY_RETREAT_DISTANCE = 120;   // 比這近就後退 (back off if closer)
export const ENEMY_FIRE_INTERVAL = 0.9;   // 開槍間隔秒數 (seconds between shots)
export const ENEMY_REACTION_TIME = 0.5;   // 剛看到玩家時，等幾秒才開第一槍 (delay before first shot)
export const ENEMY_BULLET_SPEED = 300;    // 比玩家子彈慢，玩家才躲得掉 (dodgeable)
export const ENEMY_BULLET_DAMAGE = 8;
export const ENEMY_BULLET_RANGE = 600;    // 敵人子彈射程 (range)
export const ENEMY_BULLET_RADIUS = 3;
export const ENEMY_BULLET_COLOR = '#ff7043';
export const ENEMY_BULLET_SPREAD = 0.15;  // 子彈隨機偏移的最大角度，單位弧度，約 ±8.6° (max spread)
export const ENEMY_MIN_SPAWN_DISTANCE = 10; // 敵人至少離玩家出生點幾格 (min tiles from player spawn)

// ===== 敵人強度成長 (enemy scaling per stage) =====
// 第 N 關的倍率 = 1 + 成長率 × (N - 1)，例如血量成長 0.15，第 5 關就是 1.6 倍 (linear growth)
export const ENEMY_COUNT_MAX = 8;               // 敵人數量上限 (max enemies)
export const ENEMY_COUNT_STAGES_PER_EXTRA = 2;  // 每過幾關多 1 個敵人 (stages per extra enemy)
export const ENEMY_HP_GROWTH = 0.15;            // 每關血量 +15% (HP growth per stage)
export const ENEMY_DAMAGE_GROWTH = 0.05;        // 每關子彈傷害 +5% (damage growth per stage)
export const ENEMY_FIRE_RATE_GROWTH = 0.03;     // 每關開槍間隔 -3% (fire interval shrink per stage)
export const ENEMY_MIN_FIRE_INTERVAL_RATIO = 0.5; // 開槍間隔最多縮短到原本的 50% (fire interval floor)
// 血量上限 = 玩家最強武器的 DPS × 秒數，避免敵人變成打不死的 bullet sponge (HP cap by player DPS)
export const ENEMY_HP_CAP_SECONDS = 1.0;        // 一般敵人：最多要打 1 秒 (normal enemy)
export const BOSS_HP_CAP_SECONDS = 12;          // BOSS：最多要打 12 秒 (boss)

// ===== BOSS =====
export const BOSS_STAGE_INTERVAL = 5;     // 每幾關一次 BOSS (boss every N stages)
export const BOSS_MINION_COUNT = 2;       // BOSS 關另外帶幾個小兵 (minions in a boss stage)
export const BOSS_RADIUS = 15;            // 比一般敵人大，但小於半格，才能穿過一格寬的通道 (fits 1-tile gaps)
export const BOSS_SPEED = 70;
export const BOSS_MAX_HP = 300;           // 第 1 關基準血量，實際依關卡成長 (base HP)
export const BOSS_COLOR = '#ab47bc';
export const BOSS_FIRE_INTERVAL = 1.4;
export const BOSS_BULLET_DAMAGE = 10;
export const BOSS_BULLET_SPEED = 260;
export const BOSS_BULLET_COUNT = 5;       // 一次射幾顆，排成扇形 (bullets per fan)
export const BOSS_FAN_SPREAD = 0.5;       // 扇形半角，單位弧度，約 ±29° (fan half-angle)
export const BOSS_BULLET_RADIUS = 4;
export const BOSS_BULLET_COLOR = '#ce93d8';
export const BOSS_HP_BAR_WIDTH = 44;
export const BOSS_SUPPLY_AMMO_RATIO = 1.0; // 集滿武器後，BOSS 補給箱補「備彈上限 × 100%」(supply refill ratio)

// ===== BOSS 獎勵（武器或補給箱）(boss reward) =====
export const REWARD_RADIUS = 14;
export const REWARD_COLOR = '#ffd54f';
export const REWARD_BORDER_COLOR = '#ff8f00';
export const REWARD_TEXT_COLOR = '#3e2723';

// ===== 音效與音樂 (audio) =====
// 所有聲音都由 js/audio.js 用 Web Audio API 即時合成，不需要音檔 (all sounds are synthesized, no audio files)
export const AUDIO_MASTER_VOLUME = 0.8;   // 總音量 0 ~ 1 (master volume)
export const AUDIO_SFX_VOLUME = 1.0;      // 音效音量 (sound effects volume)
export const AUDIO_GUN_VOLUME = 0.5;      // 槍聲音量，比其他音效小聲，連射才不會太吵 (gunshot volume, quieter than other sfx)
export const AUDIO_AMBIENCE_VOLUME = 0.7;  // 叢林環境音（蟲鳴、鳥叫、風聲）音量 (jungle ambience volume)
export const AUDIO_MUSIC_VOLUME = 0.3;    // 背景音樂音量，刻意很小聲，才不會蓋過槍聲 (music volume, kept quiet)
export const STORAGE_KEY_MUTED = 'webgameproject.muted'; // 記住玩家有沒有靜音 (remember mute setting)
export const MUTE_KEY_CODE = 'KeyM';      // 按 M 切換靜音 (press M to toggle mute)
export const MUSIC_TEMPO_MENU = 100;      // 主選單叢林戰爭主題曲的速度 BPM (menu theme tempo)
export const MUSIC_TEMPO_BOSS = 120;      // BOSS 關戰鼓的速度 BPM (boss drums tempo)
// 同一種音效最短間隔（秒），避免一幀同時打中很多敵人時聲音疊成一團爆音 (min seconds between the same sound)
export const SOUND_MIN_INTERVAL = {
  hit: 0.05,
  enemyShot: 0.07,
  bossShot: 0.15,
  enemyDeath: 0.06,
  crateBreak: 0.06,
  explosion: 0.08,
  empty: 0.3,
  gatlingSpin: 0.5,
  playerHurt: 0.1,
};
