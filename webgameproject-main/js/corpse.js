import { CORPSE_SEARCH_RADIUS, CORPSE_SEARCH_TIME, CHARACTER_SPRITE_SCALE } from './config.js';
import { getImage } from './assets.js';

// 敵人的屍體：倒在地上，玩家站在旁邊一下子就會自動搜身，可能找到彈藥或繃帶
// (an enemy corpse: stand next to it for a moment to search it for ammo or a bandage)
export class Corpse {
  /**
   * 從剛死掉的敵人建立屍體，保留他的外觀 (create a corpse from an enemy that just died)
   * @param {Enemy} enemy 死掉的敵人
   * @param {boolean} isBoss 是不是 BOSS（BOSS 身上的彈藥比較多）(is it the boss: carries more ammo)
   */
  constructor(enemy, isBoss) {
    this.x = enemy.x;
    this.y = enemy.y;
    this.radius = enemy.radius;
    this.imageName = enemy.imageName;
    this.color = enemy.color;
    this.isBoss = isBoss;
    // 倒下的方向：被打的反方向再隨機偏一點 (fallen direction: random-ish)
    this.angle = enemy.aimAngle + Math.PI + (Math.random() - 0.5);
    this.searched = false;     // 搜過了沒 (already searched)
    this.progress = 0;         // 搜身進度 0 ~ 1 (search progress)
    this.bloodSize = 0;        // 血跡慢慢擴大的動畫 (blood pool grows over time)
  }

  /**
   * 玩家站在旁邊就累積搜身進度，離開就慢慢退回去 (fill the search bar while the player stays close)
   * @param {number} dt 經過秒數
   * @param {{x: number, y: number}} player 玩家
   * @returns {boolean} 這一幀剛好搜完回傳 true (true on the frame the search finishes)
   */
  update(dt, player) {
    this.bloodSize = Math.min(1, this.bloodSize + dt * 0.8);
    if (this.searched) return false;

    const close = Math.hypot(player.x - this.x, player.y - this.y) < CORPSE_SEARCH_RADIUS + this.radius;
    if (close) {
      this.progress += dt / CORPSE_SEARCH_TIME;
    } else {
      this.progress = Math.max(0, this.progress - dt / CORPSE_SEARCH_TIME);
    }
    if (this.progress >= 1) {
      this.progress = 1;
      this.searched = true;
      return true;
    }
    return false;
  }

  /**
   * 畫屍體：血跡、倒下轉向的身體（變暗）、還沒搜過的話有提示和進度圈 (blood, darkened fallen body, search hint & ring)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {number} time 經過秒數
   */
  draw(ctx, time) {
    // 血跡：一灘深紅色的橢圓，慢慢擴大 (blood pool, slowly spreading)
    ctx.fillStyle = 'rgba(110, 10, 10, 0.55)';
    ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + 2, this.radius * (0.6 + this.bloodSize * 0.7), this.radius * (0.45 + this.bloodSize * 0.5), this.angle, 0, Math.PI * 2);
    ctx.fill();

    const size = this.radius * CHARACTER_SPRITE_SCALE;
    const image = getImage(this.imageName);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.globalAlpha = this.searched ? 0.6 : 0.85;
    if (image !== null) {
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    // 疊一層深色，看起來就是倒地不動了 (a dark wash so it reads as dead)
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (this.searched) return;

    // 還沒搜過：上面有個會跳的彈藥圖示，提示可以搜 (not searched: a bouncing ammo hint)
    const hintY = this.y - this.radius - 12 + Math.sin(time * 4) * 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.arc(this.x, hintY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd740';
    ctx.fillRect(this.x - 3.5, hintY - 4, 2.5, 8);
    ctx.fillRect(this.x + 1, hintY - 4, 2.5, 8);

    // 搜身進度圈 (search progress ring)
    if (this.progress > 0) {
      ctx.strokeStyle = '#ffd740';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, hintY, 11, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
      ctx.stroke();
    }
  }
}
