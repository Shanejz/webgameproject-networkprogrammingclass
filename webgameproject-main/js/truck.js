import {
  TRUCK_SPEED,
  TRUCK_LENGTH,
  TRUCK_BOARD_RADIUS,
  TRUCK_BOARD_TIME,
  TRUCK_GUN_RANGE,
  TRUCK_GUN_INTERVAL,
  TRUCK_GUN_DAMAGE,
  TRUCK_GUN_DAMAGE_GROWTH,
  TRUCK_GUN_SPREAD,
  TRUCK_GUNNER_SIZE,
  GUNNER_LINE_TIME,
  GAME_WIDTH,
  GAME_HEIGHT,
  CAMERA_ZOOM,
  TRUCK_DEPART_ACCEL,
} from './config.js';
import { getImage } from './assets.js';
import { Bullet } from './bullet.js';
import { playSound } from './audio.js';

// 載玩家來的皮卡車，也是撤離用的車 (the pickup that drops you off, and also your ride out)
//   1. 關卡開始時就停在玩家出生點旁邊，機槍手會跟你說話 (parked at the spawn at stage start; the gunner talks to you)
//   2. 任務完成後，沿著 BFS 找到的路開到營地正門外 (after the mission it drives to the front gate along a BFS path)
//   3. 後斗的友軍機槍手只打「已經發現你」的敵人，不會害你曝光 (the gunner only shoots enemies whose cover is already blown)
//   4. 停好之後，玩家站在旁邊一下子就上車，進入下一關（跟搜屍體一樣）(stand next to it to board, like searching a corpse)
export class Truck {
  /**
   * 建立卡車：停在 position，車頭朝右（朝敵人營地）(create the truck parked at position, facing right)
   * @param {{x: number, y: number}} position 停車位置
   * @param {number} stage 第幾關（機槍傷害會成長）(stage, for gun damage)
   */
  constructor(position, stage) {
    this.x = position.x;
    this.y = position.y;
    this.radius = TRUCK_LENGTH / 2;
    this.path = [];
    this.angle = 0;                // 車頭方向 (heading)
    this.arrived = true;           // 停好了嗎（開車中是 false）(parked?)
    this.boardProgress = 0;        // 上車進度 0 ~ 1 (boarding progress)
    this.speech = '';              // 機槍手正在說的話 (what the gunner is saying)
    this.speechTimer = 0;

    this.gunAngle = Math.PI;       // 機槍手瞄準的方向 (gunner aim)
    this.gunCooldown = 0;
    this.gunKick = 0;              // 開槍的後座力，畫的時候往後退一點 (recoil offset for drawing)
    this.idleTime = Math.random() * 10; // 待機動畫的時間（每台卡車從不同位置開始）(idle animation clock)
    this.lookTarget = 0;           // 待機時「轉頭看」的目標角度（相對車尾）(idle look-around offset)
    this.lookTimer = 0;            // 多久之後換一個方向看 (time until the next glance)
    this.gunStats = {
      speed: 620,
      damage: Math.max(1, Math.round(TRUCK_GUN_DAMAGE * (1 + TRUCK_GUN_DAMAGE_GROWTH * (stage - 1)))),
      range: TRUCK_GUN_RANGE,
      pierce: false,
      explosionRadius: 0,
      radius: 2.5,
      color: '#fff59d',
    };
  }

  /**
   * 開去某個位置（任務完成時開到營地門口）(drive to a spot, e.g. the camp gate once the mission is done)
   * @param {GameMap} map 地圖
   * @param {{x: number, y: number}} park 停車點
   * @returns {boolean} 有沒有要開（已經在那裡就是 false）(whether it actually has to drive)
   */
  driveTo(map, park) {
    this.path = map.findPath(this.x, this.y, park.x, park.y);
    this.arrived = this.path.length === 0;
    return !this.arrived;
  }

  /**
   * 開走（上車之後）：一邊迴轉朝向「離開營地」的方向，一邊加速，只是畫面效果，不管障礙物
   * (drive off after boarding: turn toward the way out while accelerating; visual only)
   * @param {number} dt 經過秒數
   * @param {number} awayAngle 要開去的方向（背對營地）(direction to drive, away from the camp)
   */
  depart(dt, awayAngle) {
    const diff = Math.atan2(Math.sin(awayAngle - this.angle), Math.cos(awayAngle - this.angle));
    this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 2.6 * dt);
    this.departSpeed = (this.departSpeed ?? 0) + TRUCK_DEPART_ACCEL * dt;
    this.x += Math.cos(this.angle) * this.departSpeed * dt;
    this.y += Math.sin(this.angle) * this.departSpeed * dt;
    this.boardProgress = 0;
  }

  /**
   * 機槍手說一句話：頭上出現對話框（不出聲）(the gunner says a line: a silent speech bubble)
   * @param {string} text 台詞
   */
  say(text) {
    this.speech = text;
    this.speechTimer = GUNNER_LINE_TIME;
  }

  /**
   * 機槍的位置：在後斗中間，車身中心往車尾退一點 (gun position: middle of the truck bed)
   * @returns {{x: number, y: number}}
   */
  getGunPosition() {
    return {
      x: this.x - Math.cos(this.angle) * TRUCK_LENGTH * 0.19,
      y: this.y - Math.sin(this.angle) * TRUCK_LENGTH * 0.19,
    };
  }

  /**
   * 每幀更新：開車、機槍手找目標開火、上車進度 (drive, let the gunner fire, track boarding)
   * @param {number} dt 經過秒數
   * @param {Enemy[]} enemies 敵人
   * @param {Bullet[]} bullets 子彈陣列
   * @param {GameMap} map 地圖
   * @param {Player} player 玩家
   * @param {boolean} canBoard 現在可不可以上車（伏擊兵要先清光）(boarding allowed: ambush cleared)
   * @returns {boolean} 上車完成回傳 true (true once boarded)
   */
  update(dt, enemies, bullets, map, player, canBoard) {
    this.speechTimer = Math.max(0, this.speechTimer - dt);
    this.drive(dt);
    this.updateGunner(dt, enemies, bullets, map);

    if (!this.arrived || !canBoard) {
      this.boardProgress = 0;
      return false;
    }
    const close = Math.hypot(player.x - this.x, player.y - this.y) < TRUCK_BOARD_RADIUS;
    if (close) {
      this.boardProgress += dt / TRUCK_BOARD_TIME;
    } else {
      this.boardProgress = Math.max(0, this.boardProgress - dt / TRUCK_BOARD_TIME);
    }
    return this.boardProgress >= 1;
  }

  /**
   * 沿著路線開：一格一格往前，車頭慢慢轉向前進方向 (drive along the path, turning smoothly)
   * @param {number} dt 經過秒數
   */
  drive(dt) {
    if (this.arrived) return;
    let remaining = TRUCK_SPEED * dt;
    while (remaining > 0 && this.path.length > 0) {
      const target = this.path[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= remaining) {
        this.x = target.x;
        this.y = target.y;
        remaining -= distance;
        this.path.shift();
      } else {
        this.x += (dx / distance) * remaining;
        this.y += (dy / distance) * remaining;
        remaining = 0;
      }
      if (distance > 0.5) {
        // 車頭不要瞬間轉過去，每幀轉一部分，看起來比較像在開車 (turn gradually, like steering)
        const wanted = Math.atan2(dy, dx);
        const diff = Math.atan2(Math.sin(wanted - this.angle), Math.cos(wanted - this.angle));
        this.angle += diff * Math.min(1, dt * 8);
      }
    }
    if (this.path.length === 0) {
      this.arrived = true;
      playSound('truckArrive');
    }
  }

  /**
   * 機槍手：找最近、看得到、在射程內的敵人，轉過去開槍 (gunner: aim at the nearest visible enemy in range and fire)
   */
  updateGunner(dt, enemies, bullets, map) {
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.gunKick = Math.max(0, this.gunKick - dt * 30);
    this.idleTime += dt;
    const gun = this.getGunPosition();

    let target = null;
    let bestDistance = TRUCK_GUN_RANGE;
    for (const enemy of enemies) {
      if (enemy.isDead()) continue;
      // 還沒發現玩家的敵人不打，免得害玩家曝光 (don't shoot enemies that haven't noticed you: don't blow your cover)
      const coverBlown = enemy.isWave === true || enemy.mode === 'alert' || enemy.seesPlayer || enemy.lastSeenX !== null;
      if (!coverBlown) continue;
      const distance = Math.hypot(enemy.x - gun.x, enemy.y - gun.y);
      if (distance > bestDistance) continue;
      if (!map.hasLineOfSight(gun.x, gun.y, enemy.x, enemy.y)) continue;
      target = enemy;
      bestDistance = distance;
    }

    if (target === null) {
      // 待機動畫：機槍慢慢左右掃視，每隔幾秒轉頭看另一邊 (idle: slow sweep, glancing somewhere new every few seconds)
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTimer = 2 + Math.random() * 2.5;
        this.lookTarget = (Math.random() * 2 - 1) * 1.3;
      }
      const sweep = Math.sin(this.idleTime * 0.9) * 0.25;
      this.turnGun(this.angle + Math.PI + this.lookTarget + sweep, dt * 2.5);
      return;
    }
    this.turnGun(Math.atan2(target.y - gun.y, target.x - gun.x), dt * 14);
    if (this.gunCooldown === 0) {
      const spread = (Math.random() * 2 - 1) * TRUCK_GUN_SPREAD;
      const muzzleX = gun.x + Math.cos(this.gunAngle) * TRUCK_GUNNER_SIZE * 0.46;
      const muzzleY = gun.y + Math.sin(this.gunAngle) * TRUCK_GUNNER_SIZE * 0.46;
      // owner 是 'player'：友軍的子彈只會打到敵人 (owner 'player' so it only hits enemies)
      bullets.push(new Bullet(muzzleX, muzzleY, this.gunAngle + spread, 'player', this.gunStats));
      this.gunCooldown = TRUCK_GUN_INTERVAL;
      this.gunKick = 4;
      playSound('lmg');
    }
  }

  /**
   * 機槍慢慢轉向某個角度，不要瞬間轉過去 (turn the gun toward an angle gradually)
   * @param {number} wanted 想要的角度
   * @param {number} amount 這一幀轉多少比例（0 ~ 1）
   */
  turnGun(wanted, amount) {
    const diff = Math.atan2(Math.sin(wanted - this.gunAngle), Math.cos(wanted - this.gunAngle));
    this.gunAngle += diff * Math.min(1, amount);
  }

  /**
   * 畫卡車、機槍手、上車提示和進度圈 (draw the truck, the gunner, the boarding hint and ring)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {number} time 經過秒數
   * @param {boolean} canBoard 現在可不可以上車
   */
  draw(ctx, time, canBoard) {
    const width = TRUCK_LENGTH;
    const height = TRUCK_LENGTH / 2;
    const image = getImage('truck');
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    if (image !== null) {
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = '#5d6b36';
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.fillStyle = '#6f7f42';
      ctx.fillRect(width * 0.1, -height / 2, width * 0.4, height);
    }
    ctx.restore();

    // 機槍手（會轉向目標）(the gunner, turning toward targets)
    const gun = this.getGunPosition();
    const gunner = getImage('truck_gunner');
    const size = TRUCK_GUNNER_SIZE;
    ctx.save();
    ctx.translate(gun.x, gun.y);
    ctx.rotate(this.gunAngle);
    // 呼吸：身體輕輕放大縮小；開槍時往後頓一下 (breathing: a slight scale pulse; recoil pushes him back)
    const breathe = 1 + Math.sin(this.idleTime * 2.4) * 0.035;
    ctx.translate(-this.gunKick, 0);
    ctx.scale(breathe, breathe);
    if (gunner !== null) {
      ctx.drawImage(gunner, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#7d8c52';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2124';
      ctx.fillRect(0, -2, 18, 4);
    }
    ctx.restore();

    if (!this.arrived || !canBoard) return;

    // 可以上車：上方一個會跳的箭頭 + 「GET IN」，上車中畫進度圈 (ready: bouncing "GET IN" hint and progress ring)
    const hintY = this.y - height - 14 + Math.sin(time * 5) * 3;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeText('GET IN ▼', this.x, hintY);
    ctx.fillStyle = '#b2ff59';
    ctx.fillText('GET IN ▼', this.x, hintY);
    if (this.boardProgress > 0) {
      ctx.strokeStyle = '#b2ff59';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, TRUCK_BOARD_RADIUS - 6, -Math.PI / 2, -Math.PI / 2 + this.boardProgress * Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * 畫機槍手的對話框；卡車不在畫面內時，對話框貼在畫面邊緣（像無線電）
   * (draw the gunner's speech bubble; when the truck is off-screen the bubble sticks to the screen edge, like a radio call)
   * 要在視野陰影之後、鏡頭位移之外畫，所以傳入鏡頭位置 (drawn after the vision shade, in screen space)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {{x: number, y: number}} camera 鏡頭左上角
   */
  drawSpeech(ctx, camera) {
    if (this.speechTimer <= 0 || this.speech === '') return;
    const fade = Math.min(1, this.speechTimer / 0.3);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = 'bold 13px sans-serif';
    const boxHeight = 26;
    const margin = 8;

    // 對話框在機槍手頭上；超出畫面就夾回畫面內，前面加上「GUNNER:」(above the gunner; clamped to the screen with a "GUNNER:" prefix)
    const gun = this.getGunPosition();
    let x = (gun.x - camera.x) * CAMERA_ZOOM;
    let y = (gun.y - camera.y - TRUCK_GUNNER_SIZE / 2) * CAMERA_ZOOM - boxHeight / 2 - 10;
    const onScreen = x > 0 && x < GAME_WIDTH && y > 0 && y < GAME_HEIGHT;
    const label = onScreen ? this.speech : `GUNNER: ${this.speech}`;
    const textWidth = ctx.measureText(label).width;
    const boxWidth = textWidth + 22;
    x = Math.min(GAME_WIDTH - boxWidth / 2 - margin, Math.max(boxWidth / 2 + margin, x));
    y = Math.min(GAME_HEIGHT - boxHeight - 60, Math.max(boxHeight / 2 + 70, y));

    ctx.fillStyle = 'rgba(20, 26, 16, 0.88)';
    ctx.strokeStyle = '#b2ff59';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, 7);
    } else {
      ctx.rect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight); // 舊瀏覽器沒有圓角 (older browsers)
    }
    ctx.fill();
    ctx.stroke();
    if (onScreen) {
      // 小尾巴指向機槍手 (little tail pointing at the gunner)
      ctx.beginPath();
      ctx.moveTo(x - 6, y + boxHeight / 2);
      ctx.lineTo(x, y + boxHeight / 2 + 8);
      ctx.lineTo(x + 6, y + boxHeight / 2);
      ctx.closePath();
      ctx.fillStyle = '#b2ff59';
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
    ctx.restore();
  }
}
