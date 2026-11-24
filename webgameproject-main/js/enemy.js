import {
  ENEMY_RADIUS,
  ENEMY_SPEED,
  ENEMY_MAX_HP,
  ENEMY_COLOR,
  ENEMY_SIGHT_RANGE,
  ENEMY_PREFERRED_DISTANCE,
  ENEMY_RETREAT_DISTANCE,
  ENEMY_FIRE_INTERVAL,
  ENEMY_REACTION_TIME,
  ENEMY_BULLET_SPEED,
  ENEMY_BULLET_DAMAGE,
  ENEMY_BULLET_SPREAD,
  ENEMY_BULLET_RANGE,
  ENEMY_BULLET_RADIUS,
  ENEMY_BULLET_COLOR,
  ENEMY_HP_GROWTH,
  ENEMY_DAMAGE_GROWTH,
  ENEMY_FIRE_RATE_GROWTH,
  ENEMY_MIN_FIRE_INTERVAL_RATIO,
  ENEMY_HP_CAP_SECONDS,
  BOSS_HP_CAP_SECONDS,
  BOSS_RADIUS,
  BOSS_SPEED,
  BOSS_MAX_HP,
  BOSS_COLOR,
  BOSS_FIRE_INTERVAL,
  BOSS_BULLET_DAMAGE,
  BOSS_BULLET_SPEED,
  BOSS_BULLET_COUNT,
  BOSS_FAN_SPREAD,
  BOSS_BULLET_RADIUS,
  BOSS_BULLET_COLOR,
  BOSS_HP_BAR_WIDTH,
  HP_BAR_OFFSET,
  HP_BAR_HEIGHT,
  BUSH_REVEAL_DISTANCE,
  TURRET_RADIUS,
  TURRET_HP_MULTIPLIER,
  TURRET_FIRE_INTERVAL_MULTIPLIER,
  TURRET_SIGHT_RANGE,
  TURRET_SCAN_SPEED,
  PATROL_SPEED_MULTIPLIER,
  SNIPER_SIGHT_MULTIPLIER,
  SNIPER_PREFERRED_DISTANCE,
  SNIPER_RETREAT_DISTANCE,
  SNIPER_FIRE_INTERVAL_MULTIPLIER,
  SNIPER_DAMAGE_MULTIPLIER,
  SNIPER_BULLET_SPEED_MULTIPLIER,
  SNIPER_BULLET_RANGE,
  SNIPER_SPREAD,
  SNIPER_AIM_TIME,
  SNIPER_HP_MULTIPLIER,
  SNIPER_SPEED_MULTIPLIER,
  MELEE_SPEED_MULTIPLIER,
  MELEE_HP_MULTIPLIER,
  MELEE_DAMAGE_MULTIPLIER,
  MELEE_REACH,
  MELEE_INTERVAL,
  NOISE_RIFLE_DISTANCE,
  NOISE_SNIPER_DISTANCE,
  NOISE_SPREAD,
  NOISE_RESPONSE_COOLDOWN,
  TRAP_ENEMY_SPEED_MULTIPLIER,
  ENEMY_REPATH_TIME,
  ENEMY_STUCK_TIME,
  TILE_SIZE,
} from './config.js';
import { Character } from './character.js';
import { playSound } from './audio.js';

// ===== 依關卡計算敵人數值 (stats per stage) =====

/**
 * 第 stage 關的成長倍率：1 + 成長率 × (關卡 - 1) (growth multiplier)
 * 例如成長率 0.15：第 1 關 1.0 倍、第 2 關 1.15 倍、第 5 關 1.6 倍。
 * @param {number} growth 每關成長率
 * @param {number} stage 第幾關
 * @returns {number}
 */
function growthMultiplier(growth, stage) {
  return 1 + growth * (stage - 1);
}

/**
 * 依關卡算出「血量、傷害、射速」這三個會成長的數值 (scaled HP, damage, fire interval)
 * 血量 = min(依關卡成長的血量, 玩家最強 DPS × 允許秒數)，避免敵人變成打不死的 bullet sponge。
 * @param {number} stage 第幾關
 * @param {number} playerBestDps 玩家最強武器的 DPS
 * @param {number} baseHp 第 1 關血量
 * @param {number} baseDamage 第 1 關子彈傷害
 * @param {number} baseFireInterval 第 1 關開槍間隔
 * @param {number} hpCapSeconds 血量上限的秒數
 * @returns {{maxHp: number, bulletDamage: number, fireInterval: number}}
 */
function scaleStats(stage, playerBestDps, baseHp, baseDamage, baseFireInterval, hpCapSeconds) {
  const grownHp = baseHp * growthMultiplier(ENEMY_HP_GROWTH, stage);
  const hpCap = playerBestDps * hpCapSeconds;

  // 開槍間隔越來越短，但有下限 (fire interval shrinks, with a floor)
  const fireRatio = Math.max(
    ENEMY_MIN_FIRE_INTERVAL_RATIO,
    1 - ENEMY_FIRE_RATE_GROWTH * (stage - 1)
  );

  return {
    maxHp: Math.round(Math.min(grownHp, hpCap)),
    bulletDamage: Math.round(baseDamage * growthMultiplier(ENEMY_DAMAGE_GROWTH, stage)),
    fireInterval: baseFireInterval * fireRatio,
  };
}

/**
 * 一般敵人在第 stage 關的完整數值 (normal enemy stats for a stage)
 * @param {number} stage 第幾關
 * @param {number} playerBestDps 玩家最強武器的 DPS
 * @returns {object}
 */
export function createEnemyStats(stage, playerBestDps) {
  const scaled = scaleStats(
    stage, playerBestDps, ENEMY_MAX_HP, ENEMY_BULLET_DAMAGE, ENEMY_FIRE_INTERVAL, ENEMY_HP_CAP_SECONDS
  );
  return {
    radius: ENEMY_RADIUS,
    speed: ENEMY_SPEED,
    color: ENEMY_COLOR,
    maxHp: scaled.maxHp,
    fireInterval: scaled.fireInterval,
    bulletDamage: scaled.bulletDamage,
    bulletSpeed: ENEMY_BULLET_SPEED,
    bulletRadius: ENEMY_BULLET_RADIUS,
    bulletColor: ENEMY_BULLET_COLOR,
    hpBarWidth: undefined, // 用預設寬度 (use default width)
    imageName: 'enemy',    // 美術圖片名稱 (sprite name)
  };
}

/**
 * BOSS 在第 stage 關的完整數值 (boss stats for a stage)
 * @param {number} stage 第幾關
 * @param {number} playerBestDps 玩家最強武器的 DPS
 * @returns {object}
 */
export function createBossStats(stage, playerBestDps) {
  const scaled = scaleStats(
    stage, playerBestDps, BOSS_MAX_HP, BOSS_BULLET_DAMAGE, BOSS_FIRE_INTERVAL, BOSS_HP_CAP_SECONDS
  );
  return {
    radius: BOSS_RADIUS,
    speed: BOSS_SPEED,
    color: BOSS_COLOR,
    maxHp: scaled.maxHp,
    fireInterval: scaled.fireInterval,
    bulletDamage: scaled.bulletDamage,
    bulletSpeed: BOSS_BULLET_SPEED,
    bulletRadius: BOSS_BULLET_RADIUS,
    bulletColor: BOSS_BULLET_COLOR,
    hpBarWidth: BOSS_HP_BAR_WIDTH,
    imageName: 'boss',
  };
}

// ===== 一般敵人 (normal enemy) =====

// 一般敵人：繼承 Character，加上自己的 AI (enemy with simple AI)
export class Enemy extends Character {
  /**
   * 建立敵人 (create enemy)
   * @param {number} x 起始 x
   * @param {number} y 起始 y
   * @param {object} stats 數值，由 createEnemyStats / createBossStats 產生 (stats object)
   * @param {string} role 兵種：'rifleman' 步槍兵、'sniper' 狙擊手、'melee' 近戰兵 (role)
   */
  constructor(x, y, stats, role = 'rifleman') {
    super(x, y, stats.radius, stats.speed, stats.maxHp, stats.color);

    if (stats.hpBarWidth !== undefined) {
      this.hpBarWidth = stats.hpBarWidth;
    }
    this.imageName = stats.imageName;
    this.fireInterval = stats.fireInterval;

    // 這個敵人射出的子彈數值 (bullet stats for this enemy)
    this.bulletStats = {
      speed: stats.bulletSpeed,
      damage: stats.bulletDamage,
      range: ENEMY_BULLET_RANGE,
      pierce: false,
      explosionRadius: 0,
      radius: stats.bulletRadius,
      color: stats.bulletColor,
    };

    // 上一幀是否看得到玩家 (could see the player last frame)
    this.seesPlayer = false;

    // 行為模式 (behaviour mode)：
    //   'guard' ：守在原地，看到玩家才行動（預設）(stand guard until the player shows up)
    //   'patrol'：在營地外沿著路線巡邏 (walk a patrol route outside the camp)
    //   'return'：聽到槍聲，跑回營地支援 (heard gunfire, running back to the camp)
    //   'alert' ：聽到槍聲，走到槍聲附近的位置就定位 (heard gunfire, moving into position toward it)
    this.mode = 'guard';
    this.patrolRoute = [];   // 巡邏路線上的幾個點 (patrol waypoints)
    this.patrolIndex = 0;    // 現在要走去第幾個點 (current waypoint)
    this.path = [];          // BFS 找到的路線，一格一格走 (tile-by-tile path from BFS)

    // 在玩家畫面上的透明度：在玩家視野內 → 1，在背後 → 0，由 game.js 每幀慢慢調整 (visibility to the player, faded by game.js)
    this.viewAlpha = 0;

    // 最後一次看到玩家的位置；null 代表從來沒看到過 (last known player position)
    this.lastSeenX = null;
    this.lastSeenY = null;

    // 聽到的槍聲位置，就定位後會面向那裡 (where the gunfire came from; they face it once in position)
    this.noiseX = 0;
    this.noiseY = 0;
    this.noiseCooldown = 0;

    // ----- 兵種 (role) -----
    this.role = role;
    this.sightRange = ENEMY_SIGHT_RANGE;
    this.preferredDistance = ENEMY_PREFERRED_DISTANCE;
    this.retreatDistance = ENEMY_RETREAT_DISTANCE;
    this.bulletSpread = ENEMY_BULLET_SPREAD;
    this.aiming = false;       // 狙擊手正在瞄準（畫紅色雷射）(sniper is aiming: draw the laser)
    this.perched = false;      // 站在瞭望塔上：不會移動，只會轉身瞄準 (up in a watchtower: never moves, only turns and aims)
    this.hurtByTraps = false;  // 敵人認得自己的陷阱：不會受傷，只是走比較慢 (enemies know their traps: no damage, just slower)
    // 追人用的路線（跟巡邏 / 就定位的 path 分開）(route used while chasing, separate from patrol paths)
    this.chasePath = [];
    this.chaseRepathTimer = 0;
    this.chaseGoal = null;       // 這條路線要去的格子 (the tile this route leads to)
    this.forcePathTimer = 0;     // 剛卡住過：這段時間一律照路線走，不走直線 (recently stuck: follow the route, don't go straight)
    // 卡住偵測 (stuck detection)
    this.progressX = x;
    this.progressY = y;
    this.progressTimer = 0;
    this.stuck = false;
    this.meleeDamage = 0;
    this.meleeCooldown = 0;
    this.applyRole(stats);
  }

  /**
   * 依兵種調整數值和外觀 (adjust stats and looks for the role)
   * @param {object} stats 原本的數值 (base stats)
   */
  applyRole(stats) {
    if (this.role === 'sniper') {
      // 狙擊手：看得遠、站得遠、很準、很痛，但開槍慢、血少、走得慢 (far sight, long range, accurate, slow, fragile)
      this.imageName = 'enemy_sniper';
      this.speed *= SNIPER_SPEED_MULTIPLIER;
      this.maxHp = Math.round(this.maxHp * SNIPER_HP_MULTIPLIER);
      this.hp = this.maxHp;
      this.fireInterval *= SNIPER_FIRE_INTERVAL_MULTIPLIER;
      this.sightRange *= SNIPER_SIGHT_MULTIPLIER;
      this.preferredDistance = SNIPER_PREFERRED_DISTANCE;
      this.retreatDistance = SNIPER_RETREAT_DISTANCE;
      this.bulletSpread = SNIPER_SPREAD;
      this.bulletStats.damage = Math.round(stats.bulletDamage * SNIPER_DAMAGE_MULTIPLIER);
      this.bulletStats.speed = stats.bulletSpeed * SNIPER_BULLET_SPEED_MULTIPLIER;
      this.bulletStats.range = SNIPER_BULLET_RANGE;
    } else if (this.role === 'melee') {
      // 近戰兵：沒有槍，跑得快、血比較多，衝過來用砍刀砍 (no gun: fast, tougher, charges in with a machete)
      this.imageName = 'enemy_melee';
      this.speed *= MELEE_SPEED_MULTIPLIER;
      this.maxHp = Math.round(this.maxHp * MELEE_HP_MULTIPLIER);
      this.hp = this.maxHp;
      this.meleeDamage = Math.round(stats.bulletDamage * MELEE_DAMAGE_MULTIPLIER);
      this.preferredDistance = 0;
    }
  }

  /**
   * 每一幀的 AI 判斷 (AI decision every frame)
   *
   * 規則：
   * 1. 看得到玩家：太遠就靠近、太近就後退、距離剛好就站著，並朝玩家開槍。
   * 2. 看不到玩家，但之前看過：走到最後看到玩家的位置去找。
   * 3. 從沒看過玩家：站著不動。
   *
   * @param {number} dt 經過秒數
   * @param {Player} player 玩家
   * @param {Bullet[]} bullets 子彈陣列
   * @param {GameMap} map 地圖
   */
  update(dt, player, bullets, map) {
    this.updateStatus(dt, map);
    this.noiseCooldown = Math.max(0, this.noiseCooldown - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);

    const canSee = this.canSeePlayer(player, map, this.sightRange);
    this.aiming = false;

    if (canSee) {
      // 發現玩家就進入戰鬥，不再巡邏或趕路 (spotting the player ends patrolling / returning)
      this.mode = 'guard';
      this.path = [];
      // 剛看到玩家的瞬間，給玩家一點反應時間 (reaction delay when first spotting)
      if (!this.seesPlayer) {
        this.shootCooldown = Math.max(this.shootCooldown, ENEMY_REACTION_TIME);
      }

      this.lastSeenX = player.x;
      this.lastSeenY = player.y;
      this.aimAngle = Math.atan2(dy, dx);

      // 朝玩家的單位方向 (unit direction toward player)
      const dirX = dx / distance;
      const dirY = dy / distance;

      if (this.role === 'melee') {
        this.updateMelee(player, distance, dirX, dirY, dt, map);
      } else {
        if (distance > this.preferredDistance) {
          this.moveToward(player.x, player.y, dt, map); // 太遠：靠近，會繞過障礙物 (approach, routing around obstacles)
        } else if (distance < this.retreatDistance) {
          this.move(-dirX, -dirY, dt, map);     // 太近：後退 (back off)
        }

        // 狙擊手快開槍前會亮紅色雷射，提醒玩家快躲 (snipers show a red laser right before firing)
        this.aiming = this.role === 'sniper' && this.shootCooldown <= SNIPER_AIM_TIME;
        if (this.shootCooldown === 0) {
          this.shootAtPlayer(bullets);
          this.shootCooldown = this.fireInterval;
        }
      }
    } else if (this.lastSeenX !== null) {
      // 看不到，但記得玩家最後在哪裡：走過去找 (go to last known position)
      const tx = this.lastSeenX - this.x;
      const ty = this.lastSeenY - this.y;
      const targetDistance = Math.hypot(tx, ty);

      if (targetDistance > this.radius) {
        this.aimAngle = Math.atan2(ty, tx);
        // 繞過樹和石頭走過去；根本到不了就放棄 (route around trees and rocks; give up if unreachable)
        if (!this.moveToward(this.lastSeenX, this.lastSeenY, dt, map)) {
          this.lastSeenX = null;
          this.lastSeenY = null;
        }
      } else {
        // 走到了還是沒看到，就放棄 (reached it, give up)
        this.lastSeenX = null;
        this.lastSeenY = null;
      }
    } else if (this.mode === 'patrol') {
      // 巡邏：走到一個點，就找路去下一個點 (patrol: reach a waypoint, then path to the next)
      if (this.path.length === 0) {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrolRoute.length;
        const waypoint = this.patrolRoute[this.patrolIndex];
        this.path = map.findPath(this.x, this.y, waypoint.x, waypoint.y);
      }
      this.followPath(dt, map);
    } else if (this.mode === 'return') {
      // 趕回營地：走到了就改成守衛 (running back to camp; become a guard on arrival)
      if (this.followPath(dt, map)) {
        this.mode = 'guard';
      }
    } else if (this.mode === 'alert') {
      // 就定位：走到位置後停下來，面向槍聲的方向 (take position, then face the gunfire)
      if (this.followPath(dt, map)) {
        this.mode = 'guard';
        this.aimAngle = Math.atan2(this.noiseY - this.y, this.noiseX - this.x);
      }
    }

    this.seesPlayer = canSee;
  }

  /**
   * 看不看得到玩家 (can this enemy see the player)
   * 看得到 = 在視線範圍內，而且 (in range, and):
   *   1. 貼得很近：躲在草叢裡也會被發現 (very close: found even inside a bush)
   *   2. 玩家剛開過槍：槍口火光暴露位置，只有箱子、石頭擋得住 (player just fired: only solid cover hides you)
   *   3. 其他情況：草叢、箱子、石頭都會擋住視線 (otherwise bushes block the view too)
   * @param {Player} player 玩家
   * @param {GameMap} map 地圖
   * @param {number} range 視線距離 (sight range)
   * @returns {boolean}
   */
  canSeePlayer(player, map, range) {
    const distance = Math.hypot(player.x - this.x, player.y - this.y);
    if (distance > range) return false;
    if (distance <= BUSH_REVEAL_DISTANCE) return true;
    if (player.revealTimer > 0) return map.hasLineOfSight(this.x, this.y, player.x, player.y);
    return map.hasSightLine(this.x, this.y, player.x, player.y);
  }

  /**
   * 開始巡邏 (start patrolling a route)
   * @param {{x: number, y: number}[]} route 巡邏點 (waypoints)
   */
  startPatrol(route) {
    this.mode = 'patrol';
    this.patrolRoute = route;
    this.patrolIndex = 0;
    this.path = [];
  }

  /**
   * 聽到槍聲：巡邏兵找一條路跑回營地 (heard gunfire: a patrol finds a way back to the camp)
   * @param {GameMap} map 地圖
   * @param {number} baseX 營地中心 x (camp center)
   * @param {number} baseY 營地中心 y
   */
  hearGunshot(map, baseX, baseY) {
    if (this.mode !== 'patrol') return;
    this.mode = 'return';
    this.path = map.findPath(this.x, this.y, baseX, baseY);
  }

  /**
   * 近戰兵：一直衝向玩家，夠近就砍一刀 (melee: charge the player and slash when close enough)
   * @param {Player} player 玩家
   * @param {number} distance 和玩家的距離
   * @param {number} dirX 朝玩家的方向 x
   * @param {number} dirY 朝玩家的方向 y
   * @param {number} dt 經過秒數
   * @param {GameMap} map 地圖
   */
  updateMelee(player, distance, dirX, dirY, dt, map) {
    const reach = this.radius + player.radius + MELEE_REACH;
    if (distance > reach - 4) {
      this.moveToward(player.x, player.y, dt, map); // 衝過去，會繞過障礙物 (charge, routing around obstacles)
    }
    if (distance <= reach && this.meleeCooldown === 0) {
      player.takeDamage(this.meleeDamage);
      this.meleeCooldown = MELEE_INTERVAL;
      playSound('machete');
    }
  }

  /**
   * 聽到槍聲（營地裡的敵人）：走到槍聲附近的位置就定位 (heard gunfire: move into position toward it)
   *   步槍兵：停在離槍聲 NOISE_RIFLE_DISTANCE 的地方，左右隨機散開 (riflemen stop at mid range, fanned out)
   *   狙擊手：停得比較遠；已經夠遠就待在原地，只轉向槍聲 (snipers hold farther back, or just turn if already far)
   *   近戰兵：直接衝到槍聲的位置 (melee rushes straight to the noise)
   * @param {GameMap} map 地圖
   * @param {number} noiseX 槍聲位置 x
   * @param {number} noiseY 槍聲位置 y
   */
  respondToNoise(map, noiseX, noiseY) {
    if (this.noiseCooldown > 0) return;
    this.noiseCooldown = NOISE_RESPONSE_COOLDOWN;
    this.noiseX = noiseX;
    this.noiseY = noiseY;

    // 塔上的狙擊手下不來：轉向槍聲，盯著那邊 (a sniper in a tower can't climb down: just turn toward the noise)
    if (this.perched) {
      this.aimAngle = Math.atan2(noiseY - this.y, noiseX - this.x);
      return;
    }

    const dx = this.x - noiseX;
    const dy = this.y - noiseY;
    const distance = Math.hypot(dx, dy) || 1;
    let standoff = NOISE_RIFLE_DISTANCE;
    if (this.role === 'sniper') standoff = NOISE_SNIPER_DISTANCE;
    if (this.role === 'melee') standoff = 0;

    // 已經比該站的距離還近：原地轉向槍聲就好 (already close enough: just turn toward it)
    if (distance <= standoff) {
      this.aimAngle = Math.atan2(-dy, -dx);
      return;
    }

    // 目標點 = 槍聲位置往自己這邊退 standoff，再往左右隨機偏一點 (target = back off from the noise, then shift sideways)
    const ux = dx / distance;
    const uy = dy / distance;
    const side = this.role === 'melee' ? 0 : (Math.random() * 2 - 1) * NOISE_SPREAD;
    const targetX = noiseX + ux * standoff - uy * side;
    const targetY = noiseY + uy * standoff + ux * side;
    const spot = map.nearestWalkable(targetX, targetY);
    if (spot === null) return;

    const path = map.findPath(this.x, this.y, spot.x, spot.y);
    if (path.length === 0) return;
    this.mode = 'alert';
    this.path = path;
  }

  /**
   * 移動；站在瞭望塔上的狙擊手不會動 (move; a sniper up in a watchtower stays put)
   */
  move(dirX, dirY, dt, map) {
    if (this.perched) return;
    super.move(dirX, dirY, dt, map);
    // 卡住偵測：想走卻一直沒前進，就舉旗讓呼叫的人換條路 (stuck detection: trying to move but not getting anywhere)
    this.progressTimer += dt;
    if (this.progressTimer >= ENEMY_STUCK_TIME) {
      const moved = Math.hypot(this.x - this.progressX, this.y - this.progressY);
      this.stuck = moved < this.getSpeed() * ENEMY_STUCK_TIME * 0.2;
      this.progressX = this.x;
      this.progressY = this.y;
      this.progressTimer = 0;
    }
  }

  /**
   * 地形速度：鐵絲網 40%，敵人踩在自己的陷阱上也要放慢 (terrain speed: wire 40%; enemies also slow down on traps)
   * @param {GameMap} map 地圖
   * @returns {number}
   */
  getTerrainMultiplier(map) {
    const trap = map.isTrapAtPixel(this.x, this.y) ? TRAP_ENEMY_SPEED_MULTIPLIER : 1;
    return super.getTerrainMultiplier(map) * trap;
  }

  /**
   * 走向某一點，不會卡在樹和石頭上：直線走得通就直接走，不然用 BFS 找路繞過去；卡住了就強制照路線走一陣子
   * (walk toward a point without getting stuck on trees and rocks: straight if clear, otherwise a BFS route around;
   *  if stuck, follow the route for a while)
   * @param {number} targetX 目標 x
   * @param {number} targetY 目標 y
   * @param {number} dt 經過秒數
   * @param {GameMap} map 地圖
   * @returns {boolean} 有沒有路可以走（false = 完全到不了）(false if the target is unreachable)
   */
  moveToward(targetX, targetY, dt, map) {
    if (this.perched) return true;
    this.forcePathTimer = Math.max(0, this.forcePathTimer - dt);
    this.chaseRepathTimer -= dt;
    if (this.stuck) {
      this.stuck = false;
      this.forcePathTimer = 1.5;
      this.chaseRepathTimer = 0;
    }

    // 直線走得通：直接走 (clear straight line: just walk)
    if (this.forcePathTimer === 0 && map.isClearWalk(this.x, this.y, targetX, targetY, this.radius)) {
      this.chasePath = [];
      const dx = targetX - this.x;
      const dy = targetY - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) this.move(dx / distance, dy / distance, dt, map);
      return true;
    }

    // 走不通：找路。目標換了格子、路線走完、或時間到就重找 (blocked: re-path when the goal tile changes or on a timer)
    const goalCol = Math.floor(targetX / TILE_SIZE);
    const goalRow = Math.floor(targetY / TILE_SIZE);
    const goalChanged = this.chaseGoal === null || this.chaseGoal.col !== goalCol || this.chaseGoal.row !== goalRow;
    if (this.chasePath.length === 0 || goalChanged || this.chaseRepathTimer <= 0) {
      this.chaseRepathTimer = ENEMY_REPATH_TIME;
      this.chaseGoal = { col: goalCol, row: goalRow };
      const goal = map.blocksMovementAt(goalCol, goalRow) ? map.nearestWalkable(targetX, targetY) : { x: targetX, y: targetY };
      if (goal === null) return false;
      this.chasePath = map.findPath(this.x, this.y, goal.x, goal.y);
      if (this.chasePath.length === 0) return false;
      // 先回到自己這一格的中心，身體才不會卡在轉角 (step to the center of the current tile first, so we don't snag corners)
      const here = map.tileCenter(Math.floor(this.x / TILE_SIZE), Math.floor(this.y / TILE_SIZE));
      if (Math.hypot(here.x - this.x, here.y - this.y) > 6) this.chasePath.unshift(here);
    }

    // 沿著路線走；看得到下一個點之後的點就跳過，路線才不會一格一格很僵硬 (follow the route, skipping ahead when clear)
    while (this.chasePath.length > 1 && map.isClearWalk(this.x, this.y, this.chasePath[1].x, this.chasePath[1].y, this.radius)) {
      this.chasePath.shift();
    }
    const next = this.chasePath[0];
    const dx = next.x - this.x;
    const dy = next.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) {
      this.chasePath.shift();
      return true;
    }
    this.move(dx / distance, dy / distance, dt, map);
    return true;
  }

  /**
   * 追向某個位置（伏擊兵用）：找一條路走過去，到了就停下來面向那裡 (chase toward a point, used by ambush waves)
   * @param {GameMap} map 地圖
   * @param {number} x 目標 x
   * @param {number} y 目標 y
   */
  chase(map, x, y) {
    const spot = map.nearestWalkable(x, y);
    if (spot === null) return;
    const path = map.findPath(this.x, this.y, spot.x, spot.y);
    if (path.length === 0) return;
    this.mode = 'alert';
    this.path = path;
    this.noiseX = x;
    this.noiseY = y;
  }

  /**
   * 狙擊手瞄準時，從槍口畫一條紅色雷射線 (sniper laser sight while aiming)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   */
  draw(ctx) {
    if (this.aiming) {
      const length = this.sightRange;
      ctx.strokeStyle = 'rgba(255, 40, 40, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + Math.cos(this.aimAngle) * length, this.y + Math.sin(this.aimAngle) * length);
      ctx.stroke();
    }
    super.draw(ctx);
  }

  /**
   * 沿著 path 走一格一格，走到了就換下一格 (walk along the path tile by tile)
   * @param {number} dt 經過秒數
   * @param {GameMap} map 地圖
   * @returns {boolean} 走完了回傳 true (true when the path is finished)
   */
  followPath(dt, map) {
    if (this.path.length === 0) return true;
    // 卡住了：從自己這一格的中心重新找路到終點 (stuck: re-route to the end from the center of our own tile)
    if (this.stuck) {
      this.stuck = false;
      const end = this.path[this.path.length - 1];
      const route = map.findPath(this.x, this.y, end.x, end.y);
      route.unshift(map.tileCenter(Math.floor(this.x / TILE_SIZE), Math.floor(this.y / TILE_SIZE)));
      this.path = route;
    }
    const target = this.path[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) {
      this.path.shift();
      return this.path.length === 0;
    }
    this.aimAngle = Math.atan2(dy, dx); // 面向走的方向 (face where you walk)
    this.move(dx / distance, dy / distance, dt, map);
    return false;
  }

  /**
   * 巡邏時走比較慢 (patrols walk slower)
   * @returns {number}
   */
  getSpeed() {
    return this.mode === 'patrol' ? this.speed * PATROL_SPEED_MULTIPLIER : this.speed;
  }

  /**
   * 朝玩家開槍：一發，加上隨機偏移，敵人才不會百發百中 (shoot one bullet with random spread)
   * BOSS 會覆寫這個方法，改成扇形多發。
   * @param {Bullet[]} bullets 子彈陣列
   */
  shootAtPlayer(bullets) {
    playSound(this.role === 'sniper' ? 'sniper' : 'enemyShot');
    const spread = (Math.random() * 2 - 1) * this.bulletSpread;
    this.shootBullet(bullets, this.aimAngle + spread, 'enemy', this.bulletStats);
  }
}

// ===== BOSS =====

// BOSS：繼承 Enemy，AI 完全一樣，只改「怎麼開槍」和外觀 (boss: same AI, different attack & look)
export class Boss extends Enemy {
  /**
   * 覆寫開槍：一次射出扇形的多顆子彈 (override: fire a fan of bullets)
   * @param {Bullet[]} bullets 子彈陣列
   */
  shootAtPlayer(bullets) {
    playSound('bossShot');
    // 跟霰彈槍同樣的算法：從 -spread 到 +spread 平均分配 (same fan math as the shotgun)
    const step = (BOSS_FAN_SPREAD * 2) / (BOSS_BULLET_COUNT - 1);
    for (let i = 0; i < BOSS_BULLET_COUNT; i++) {
      const angle = this.aimAngle - BOSS_FAN_SPREAD + step * i;
      this.shootBullet(bullets, angle, 'enemy', this.bulletStats);
    }
  }

  /**
   * 覆寫 draw：照常畫好，再在血條上方寫 BOSS (override draw: add a BOSS label)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   */
  draw(ctx) {
    super.draw(ctx);

    ctx.fillStyle = BOSS_COLOR;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('BOSS', this.x, this.y - this.radius - HP_BAR_OFFSET - HP_BAR_HEIGHT - 2);
  }
}

// ===== 自動砲塔 (gun turret) =====

// 自動砲塔：繼承 Enemy，但不會動，只會轉向玩家開槍；沒看到人時左右掃視 (stationary: turns and fires; scans when idle)
export class Turret extends Enemy {
  /**
   * 建立砲塔：用一般敵人的數值，再調整血量、射速、外觀 (create a turret from normal enemy stats)
   * @param {number} x 位置 x
   * @param {number} y 位置 y
   * @param {object} stats createEnemyStats 的結果 (normal enemy stats)
   */
  constructor(x, y, stats) {
    super(x, y, {
      ...stats, // 「展開」：先複製 stats 的全部欄位，後面的欄位再覆蓋 (spread: copy every field, then override some)
      radius: TURRET_RADIUS,
      speed: 0,
      maxHp: Math.round(stats.maxHp * TURRET_HP_MULTIPLIER),
      fireInterval: stats.fireInterval * TURRET_FIRE_INTERVAL_MULTIPLIER,
      imageName: 'turret',
    });
    this.aimAngle = Math.PI; // 一開始朝左，正門的方向 (start facing left, toward the front gate)
    this.scanDirection = 1;
    this.scanCenter = Math.PI;
  }

  /**
   * 砲塔的 AI：看到就轉過去開槍，沒看到就來回掃視 (turret AI: track & fire, otherwise sweep)
   * @param {number} dt 經過秒數
   * @param {Player} player 玩家
   * @param {Bullet[]} bullets 子彈陣列
   * @param {GameMap} map 地圖
   */
  update(dt, player, bullets, map) {
    this.updateStatus(dt, map);
    const canSee = this.canSeePlayer(player, map, TURRET_SIGHT_RANGE);

    if (canSee) {
      if (!this.seesPlayer) {
        this.shootCooldown = Math.max(this.shootCooldown, ENEMY_REACTION_TIME);
      }
      this.aimAngle = Math.atan2(player.y - this.y, player.x - this.x);
      this.scanCenter = this.aimAngle;
      if (this.shootCooldown === 0) {
        this.shootAtPlayer(bullets);
        this.shootCooldown = this.fireInterval;
      }
    } else {
      // 在最後看的方向左右 60° 之間來回轉 (sweep ±60° around the last direction)
      this.aimAngle += this.scanDirection * TURRET_SCAN_SPEED * dt;
      if (Math.abs(this.aimAngle - this.scanCenter) > Math.PI / 3) {
        this.scanDirection *= -1;
      }
    }
    this.seesPlayer = canSee;
  }
}
