import {
  GAME_WIDTH,
  GAME_HEIGHT,
  MAX_RENDER_SCALE,
  MAX_DELTA_TIME,
} from './config.js';
import { initInput } from './input.js';
import { Game } from './game.js';
import { loadImages, PIXEL_ART } from './assets.js';
import { initAudio } from './audio.js';

// main.js 只負責「啟動」：準備 canvas、縮放、game loop。
// 遊戲內容（關卡、玩家、敵人）都交給 game.js。(main.js only boots the game)

// ===== 取得 canvas 和畫筆 (get canvas & context) =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 繪圖倍率 (render scale)：canvas 實際像素 = 邏輯尺寸 × renderScale
// 遊戲邏輯永遠用 896×416 計算；每幀開頭用 setTransform 把畫筆放大 renderScale 倍，
// 所以其他檔案的繪圖程式完全不用改。
// 為什麼這樣會變清楚？以前 canvas 只有 896×416 個像素，再被 CSS 拉大，瀏覽器是把「小圖放大」所以會糊；
// 現在 canvas 的像素數量 ≈ 螢幕上實際顯示的像素數量，文字和線條就是直接用高解析度畫出來的。
let renderScale = 1;

/**
 * 依視窗大小等比例縮放 canvas，多出來的地方是黑邊 (letterbox scaling)
 * 同時依「顯示大小 × 螢幕像素密度」調整 canvas 的實際像素數 (also match the backing store to the screen)
 */
function resizeCanvas() {
  // 顯示大小 (CSS pixels) 的縮放比
  const cssScale = Math.min(
    window.innerWidth / GAME_WIDTH,
    window.innerHeight / GAME_HEIGHT
  );
  canvas.style.width = `${GAME_WIDTH * cssScale}px`;
  canvas.style.height = `${GAME_HEIGHT * cssScale}px`;

  // devicePixelRatio：1 個 CSS 像素對應幾個實體像素；Retina 螢幕和手機通常是 2 或 3 (physical pixels per CSS pixel)
  const pixelRatio = window.devicePixelRatio || 1;
  // 至少 1 倍（不要比邏輯尺寸還小），最多 MAX_RENDER_SCALE 倍（保護手機效能）(clamp between 1 and the cap)
  renderScale = Math.min(MAX_RENDER_SCALE, Math.max(1, cssScale * pixelRatio));

  // 改 canvas.width / height 會清空畫面並重設所有畫筆設定，所以設定要放在它後面 (resizing resets the context)
  canvas.width = Math.round(GAME_WIDTH * renderScale);
  canvas.height = Math.round(GAME_HEIGHT * renderScale);

  // 像素風格圖片放大時不要變模糊；一般圖片用高品質平滑 (pixel art stays blocky, others smooth)
  ctx.imageSmoothingEnabled = !PIXEL_ART;
  ctx.imageSmoothingQuality = 'high';
}

// ===== 初始化 (initialize) =====
// 主動請瀏覽器載入標題字型，不然 canvas 第一次畫字時可能還在用備用字型 (preload the title font for canvas text)
if (document.fonts && document.fonts.load) {
  document.fonts.load('16px "Lilita One"').catch(() => {});
}
loadImages();   // 開始下載美術圖片，不用等它，遊戲先開始 (start loading images, don't wait)
initInput(canvas);
initAudio();    // 註冊音效解鎖事件（要等玩家第一次操作才會出聲）(audio unlocks on first user input)
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
// 手機轉向時 resize 不一定會觸發，補一個保險 (orientation change safety net)
window.addEventListener('orientationchange', resizeCanvas);

const game = new Game();

// 手機直向時暫停遊戲；條件和 style.css 的直向提示一樣 (pause in portrait, same rule as the CSS hint)
// matchMedia 讓 JS 也能用 CSS media query 判斷 (use a CSS media query from JS)
const portraitQuery = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

/**
 * 畫出整個畫面 (render one frame)
 * 地圖、角色、HUD 全部交給 game.draw；這裡只負責設定縮放和清畫面 (game.draw does everything else)
 */
function draw() {
  // 每幀先把座標系統設成「邏輯座標 × renderScale」，之後所有程式照舊用 896×416 的座標畫就好 (logical coords → pixels)
  // 用 setTransform 而不是 scale：scale 會一直疊加，setTransform 是直接指定 (setTransform replaces, scale accumulates)
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

  // 先塗黑底：畫面震動時，邊緣露出的地方才不會留下上一幀的殘影 (black first so shake edges stay clean)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  game.draw(ctx);
}

// ===== Game loop =====
let lastTime = performance.now();

/**
 * 每一幀由瀏覽器呼叫一次 (called by the browser every frame)
 * @param {number} currentTime 目前時間，單位毫秒 (timestamp in ms)
 */
function gameLoop(currentTime) {
  // 計算 delta time：毫秒換成秒 (ms → seconds)
  let dt = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // 避免 dt 太大（例如切換分頁後回來）(cap delta time)
  dt = Math.min(dt, MAX_DELTA_TIME);

  // 直向時畫面被提示蓋住，不更新遊戲，免得玩家看不到的時候被打死 (don't update while the rotate hint is shown)
  if (!portraitQuery.matches) {
    game.update(dt);
  }
  draw();

  // 預約下一幀 (schedule next frame)
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
