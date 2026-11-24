import {
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_MAX_HP,
  PLAYER_COLOR,
  WEAPONS,
  ADRENALINE_SPEED_BONUS,
  POWER_AMMO_DAMAGE_BONUS,
  SPEED_BUFF_RING_COLOR,
  DAMAGE_BUFF_RING_COLOR,
  BUSH_FIRE_REVEAL_TIME,
} from './config.js';
import { Character } from './character.js';
import { Weapon, getWeaponDps } from './weapons.js';
import { playSound } from './audio.js';

// 玩家角色：繼承 Character，只需要寫「玩家專屬」的部分 (player, extends Character)
export class Player extends Character {
  /**
   * 建立玩家 (create player)
   * @param {number} x 起始 x 座標 (start x)
   * @param {number} y 起始 y 座標 (start y)
   */
  constructor(x, y) {
    super(x, y, PLAYER_RADIUS, PLAYER_SPEED, PLAYER_MAX_HP, PLAYER_COLOR);
    // 圖片依手上的武器換，例如 player_shotgun；沒有那張圖就用 player (sprite per weapon, e.g. player_shotgun)
    this.imageName = 'player_pistol';
    this.fallbackImageName = 'player';

    // 開槍後幾秒內會暴露位置，就算躲在草叢裡也一樣 (seconds you stay revealed after firing)
    this.revealTimer = 0;
    // 是否正躲在草叢裡沒被發現，HUD 用；由 game.js 每幀更新 (hidden in a bush, set by game.js)
    this.isHidden = false;
    this.firedThisFrame = false;

    // 暫時效果的剩餘秒數，> 0 代表效果中 (buff time left, active while > 0)
    this.speedBuffTimer = 0;    // 腎上腺素 (adrenaline)
    this.damageBuffTimer = 0;   // 強化彈藥 (power ammo)

    // 永久效果：換彈速度倍率，1 = 正常，快手套每個 +0.15 (permanent reload speed multiplier)
    this.reloadSpeedMultiplier = 1;

    // 武器欄：位置 i 對應 WEAPONS[i]，null 代表還沒取得 (weapon slots, null = not owned)
    // 例如 weapons[1] 永遠是霰彈槍的位置，所以按 2 一定是霰彈槍。
    this.weapons = [];
    for (let i = 0; i < WEAPONS.length; i++) {
      this.weapons.push(null);
    }
    this.weapons[0] = new Weapon(0);  // 開局只有手槍 (start with the pistol)
    this.currentIndex = 0;            // 目前拿的是第幾把 (current weapon slot)

    // 是否正在開火（按著扳機而且不在換彈），用來判斷輕機槍減速 (is firing, for LMG slow-down)
    this.isFiring = false;
  }

  // ===== 武器管理 (weapon management) =====

  /**
   * 目前手上的武器 (current weapon)
   * @returns {Weapon}
   */
  getWeapon() {
    return this.weapons[this.currentIndex];
  }

  /**
   * 取得一把新武器；已經有的話就補滿彈藥，BOSS 掉落時使用 (give a weapon)
   * @param {number} index WEAPONS 中的位置
   */
  giveWeapon(index) {
    if (this.weapons[index] === null) {
      this.weapons[index] = new Weapon(index);
    } else {
      this.weapons[index].refillAll();
    }
    this.selectWeapon(index); // 撿到新槍直接換上 (equip it)
  }

  /**
   * 切換到指定位置的武器；沒有那把槍就不動作 (switch to a slot)
   * @param {number} index WEAPONS 中的位置
   */
  selectWeapon(index) {
    if (index < 0 || index >= this.weapons.length) return;
    if (this.weapons[index] === null) return;
    if (index === this.currentIndex) return;

    this.getWeapon().cancelReload(); // 換槍會中斷換彈 (switching cancels reload)
    this.currentIndex = index;
    playSound('switchWeapon');
  }

  /**
   * 往前或往後切換到下一把「已取得」的武器，滑鼠滾輪用 (cycle through owned weapons)
   * @param {number} direction +1 = 下一把，-1 = 上一把
   */
  cycleWeapon(direction) {
    const count = this.weapons.length;
    let index = this.currentIndex;

    // 最多繞一圈，找到下一把有的槍 (loop at most once around)
    for (let i = 0; i < count; i++) {
      // 加 count 再取餘數，讓 -1 變成最後一格，形成循環 (wrap around)
      index = (index + direction + count) % count;
      if (this.weapons[index] !== null) {
        this.selectWeapon(index);
        return;
      }
    }
  }

  /**
   * 已取得武器中，最高的理論 DPS，用來決定敵人血量上限 (best DPS among owned weapons)
   * @returns {number}
   */
  getBestDps() {
    let best = 0;
    for (const weapon of this.weapons) {
      if (weapon !== null) {
        best = Math.max(best, getWeaponDps(weapon.def));
      }
    }
    return best;
  }

  /**
   * 是否有「備彈有限」的武器，沒有的話撿彈藥也沒用 (owns any weapon that uses ammo)
   * @returns {boolean}
   */
  needsAmmo() {
    for (const weapon of this.weapons) {
      if (weapon !== null && !weapon.def.infiniteReserve) return true;
    }
    return false;
  }

  /**
   * 撿到彈藥：每把有限備彈的槍都補「備彈上限 × 比例」(pick up ammo for every weapon)
   * @param {number} ratio 補充比例，例如 0.3
   */
  addAmmoToAll(ratio) {
    for (const weapon of this.weapons) {
      if (weapon !== null) {
        weapon.addReserveAmmo(Math.ceil(weapon.def.maxReserve * ratio));
      }
    }
  }

  // ===== 效果 (buffs) =====

  /**
   * 覆寫父類別的 getSpeed：腎上腺素變快、拿輕機槍開火時變慢 (override speed)
   * @returns {number}
   */
  getSpeed() {
    let speed = this.speed;
    if (this.speedBuffTimer > 0) {
      speed *= 1 + ADRENALINE_SPEED_BONUS;
    }
    if (this.isFiring) {
      speed *= this.getWeapon().def.firingMoveMultiplier;
    }
    return speed;
  }

  /**
   * 目前的傷害倍率：強化彈藥效果中提升 (damage multiplier)
   * @returns {number}
   */
  getDamageMultiplier() {
    if (this.damageBuffTimer > 0) {
      return 1 + POWER_AMMO_DAMAGE_BONUS;
    }
    return 1;
  }

  // ===== 每幀更新 (update) =====

  /**
   * 每一幀更新：狀態、切換武器、換彈、移動、瞄準、射擊 (update every frame)
   * @param {number} dt 距離上一幀經過的秒數 (delta time in seconds)
   * @param {object} input 輸入狀態，來自 input.js (input state)
   * @param {Bullet[]} bullets 子彈陣列，開槍時把新子彈放進去 (bullet list)
   * @param {GameMap} map 地圖，用來判斷碰撞 (map for collision)
   */
  update(dt, input, bullets, map) {
    this.updateStatus(dt, map);

    // 暫時效果倒數 (count down buffs)
    this.speedBuffTimer = Math.max(0, this.speedBuffTimer - dt);
    this.damageBuffTimer = Math.max(0, this.damageBuffTimer - dt);
    this.revealTimer = Math.max(0, this.revealTimer - dt);
    this.firedThisFrame = false; // 這一幀有沒有開槍，巡邏兵聽槍聲用 (fired this frame, for patrols hearing gunfire)

    // ----- 切換武器 (switch weapon) -----
    if (input.switchWeapon !== null) {
      this.selectWeapon(input.switchWeapon);
    }
    if (input.switchWeaponStep !== 0) {
      this.cycleWeapon(input.switchWeaponStep);
    }

    const weapon = this.getWeapon();
    // 換成手上這把槍的圖片 (use the sprite for the weapon in hand)
    this.imageName = `player_${weapon.def.id}`;

    const wasReloading = weapon.isReloading();
    const wasSpinning = weapon.spinTimer > 0;
    weapon.update(dt, input.isShooting);
    // 加特林剛開始空轉：播放「嗡——」的預熱聲 (gatling just started spinning: play the spin-up whir)
    if (!wasSpinning && weapon.spinTimer > 0) {
      playSound('gatlingSpin');
    }
    // 剛才在換彈、現在不是了（而且沒被切槍打斷）= 換彈完成 (reload just finished)
    if (wasReloading && !weapon.isReloading()) {
      playSound(`reloadDone_${weapon.def.id}`); // 每把槍的換彈聲不同 (reload sound per weapon)
    }

    // ----- 手動換彈 (manual reload) -----
    if (input.reload) {
      this.startReloadWithSound(weapon);
    }

    // 按著扳機、沒在換彈、彈匣有子彈，才算「正在開火」(actually firing)
    this.isFiring = input.isShooting && !weapon.isReloading() && weapon.ammoInMag > 0;

    // ----- 移動與瞄準 (move & aim) -----
    this.move(input.moveX, input.moveY, dt, map);
    this.aimAngle = input.aimAngle;

    // ----- 射擊 (shooting) -----
    if (input.isShooting && weapon.canFire()) {
      this.fireWeapon(weapon, bullets);
    }

    // 彈匣空了，而且還按著扳機（或剛打完最後一發）就自動換彈 (auto reload when empty)
    if (weapon.ammoInMag === 0) {
      this.startReloadWithSound(weapon);

      // 完全沒子彈（備彈也沒了）還按著扳機：播空擊聲 (dry-fire click when completely out of ammo)
      if (input.isShooting && !weapon.hasReserveAmmo()) {
        playSound('empty');
      }
    }
  }

  /**
   * 開始換彈，真的開始了才播放換彈聲 (start reload and play the sound only if it really started)
   * Weapon.startReload 在彈匣滿了、已在換彈、沒備彈時什麼都不做，所以要比較前後狀態才知道有沒有開始。
   * @param {Weapon} weapon 武器
   */
  startReloadWithSound(weapon) {
    const wasReloading = weapon.isReloading();
    weapon.startReload(this.reloadSpeedMultiplier);
    if (!wasReloading && weapon.isReloading()) {
      playSound(`reloadStart_${weapon.def.id}`);
    }
  }

  /**
   * 用目前的武器開一槍：可能射出好幾顆彈丸 (fire the weapon, may shoot several pellets)
   * @param {Weapon} weapon 武器
   * @param {Bullet[]} bullets 子彈陣列
   */
  fireWeapon(weapon, bullets) {
    const def = weapon.def;
    const stats = {
      speed: def.bulletSpeed,
      damage: def.damage * this.getDamageMultiplier(),
      range: def.range,
      pierce: def.pierce,
      explosionRadius: def.explosionRadius,
      radius: def.bulletRadius,
      color: def.bulletColor,
    };

    // 一次開槍只播一次聲音（霰彈槍 6 顆彈丸也只算一聲）；聲音名稱 = 武器 id (one sound per shot, named by weapon id)
    playSound(def.id);
    this.revealTimer = BUSH_FIRE_REVEAL_TIME; // 槍口火光會暴露位置 (the muzzle flash gives you away)
    this.firedThisFrame = true;

    const angles = weapon.fire(this.aimAngle);
    for (const angle of angles) {
      this.shootBullet(bullets, angle, 'player', stats);
    }
  }

  // ===== 繪製 (drawing) =====

  /**
   * 覆寫 draw：先照父類別畫好，再加上效果中的外圈 (override draw: add buff rings)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   */
  draw(ctx) {
    super.draw(ctx); // 先執行父類別的 draw (call parent's draw first)

    ctx.lineWidth = 2;
    if (this.speedBuffTimer > 0) {
      ctx.strokeStyle = SPEED_BUFF_RING_COLOR;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.damageBuffTimer > 0) {
      ctx.strokeStyle = DAMAGE_BUFF_RING_COLOR;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
