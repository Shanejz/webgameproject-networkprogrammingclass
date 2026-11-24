import { INTEL_RADIUS, HOSTAGE_RADIUS, HOSTAGE_FADE_TIME } from './config.js';
import { getImage } from './assets.js';

// 任務物件：機密情報與人質 (mission objects: intel and hostages)
//   一般關卡：敵軍營地裡藏著一份機密情報，撿到之後（加上敵人全滅），停機坪才會開
//   BOSS 關：營地裡綁著幾個人質；打倒 BOSS（敵軍指揮官）之後，走過去碰一下就能救出

// 機密情報資料夾 (intel folder)
export class Intel {
  /**
   * 建立情報 (create intel)
   * @param {number} x 位置 x
   * @param {number} y 位置 y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = INTEL_RADIUS;
  }

  /**
   * 畫出情報：底下一圈一閃一閃的金光，玩家才找得到 (draw with a pulsing gold glow so it's easy to spot)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {number} time 經過秒數 (seconds, for the pulse)
   */
  draw(ctx, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.fillStyle = `rgba(255, 215, 64, ${0.25 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 6 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();

    const image = getImage('intel');
    const size = this.radius * 2.2;
    if (image !== null) {
      ctx.drawImage(image, this.x - size / 2, this.y - size / 2, size, size);
      return;
    }
    // 沒有圖片：黃色方塊 + 紅色框 (fallback: yellow folder with a red frame)
    ctx.fillStyle = '#f0d48f';
    ctx.fillRect(this.x - 10, this.y - 12, 20, 24);
    ctx.strokeStyle = '#c62828';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x - 7, this.y - 4, 14, 8);
  }
}

// 被綁的人質 (tied-up hostage)
export class Hostage {
  /**
   * 建立人質，面向隨機方向 (create a hostage facing a random direction)
   * @param {number} x 位置 x
   * @param {number} y 位置 y
   */
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = HOSTAGE_RADIUS;
    this.angle = Math.random() * Math.PI * 2;
    this.rescued = false;   // 是否已經救出 (rescued yet)
    this.fadeTimer = 0;     // 救出後的淡出倒數 (fade-out countdown after rescue)
  }

  /**
   * 救出人質：開始淡出，代表被接走了 (rescue: start fading out, they've been picked up)
   */
  rescue() {
    this.rescued = true;
    this.fadeTimer = HOSTAGE_FADE_TIME;
  }

  /**
   * 淡出倒數 (count down the fade)
   * @param {number} dt 經過秒數
   */
  update(dt) {
    this.fadeTimer = Math.max(0, this.fadeTimer - dt);
  }

  /**
   * 已經救出而且完全淡出，就不用再畫 (rescued and fully faded = nothing to draw)
   * @returns {boolean}
   */
  isGone() {
    return this.rescued && this.fadeTimer === 0;
  }

  /**
   * 畫出人質：還沒救出時頭上有「!」求救；救出後慢慢變透明並往上飄 (draw: "!" while tied, fade & float up once rescued)
   * @param {CanvasRenderingContext2D} ctx 畫筆
   * @param {number} time 經過秒數
   */
  draw(ctx, time) {
    if (this.isGone()) return;
    const alpha = this.rescued ? this.fadeTimer / HOSTAGE_FADE_TIME : 1;
    const lift = this.rescued ? (1 - alpha) * 16 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y - lift);

    const image = getImage('hostage');
    const size = this.radius * 3;
    ctx.save();
    ctx.rotate(this.angle);
    if (image !== null) {
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#eeeae0';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 頭上的求救符號，會上下跳 (bouncing "!" above the head)
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.rescued) {
      ctx.fillStyle = '#76ff03';
      ctx.fillText('✓', 0, -this.radius - 12);
    } else {
      ctx.fillStyle = '#ffd740';
      ctx.fillText('!', 0, -this.radius - 10 + Math.sin(time * 6) * 2);
    }
    ctx.restore();
  }
}
