import {
  VISION_HALF_ANGLE,
  VISION_SHADE_ALPHA,
  VISION_NEAR_RADIUS,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
  MINIMAP_TILE_PX,
  MINIMAP_TOP,
  EXIT_ARROW_MARGIN,
  GAME_WIDTH,
  GAME_HEIGHT,
  CAMERA_ZOOM,
  VIEW_WIDTH,
  VIEW_HEIGHT,
  TITLE_FONT,
  WEAPONS,
  HUD_HP_BAR_WIDTH,
  HUD_HP_BAR_HEIGHT,
  HUD_HP_COLOR,
  HUD_HP_LOW_COLOR,
  HUD_HP_LOW_RATIO,
  HUD_ARMOR_COLOR,
  HUD_ADRENALINE_COLOR,
  HUD_POWER_AMMO_COLOR,
  HUD_STAGE_PANEL_WIDTH,
  BOSS_COLOR,
  MESSAGE_BG_COLOR,
  MESSAGE_TEXT_COLOR,
  MENU_SUBTEXT_COLOR,
  NEW_RECORD_COLOR,
  GAME_OVER_OVERLAY_COLOR,
  GAME_OVER_TEXT_COLOR,
  HUD_MARGIN,
  HUD_SLOT_SIZE,
  HUD_SLOT_GAP,
  HUD_BAR_WIDTH,
  HUD_BAR_HEIGHT,
  HUD_BG_COLOR,
  HUD_TEXT_COLOR,
  HUD_SUBTEXT_COLOR,
  HUD_SLOT_OWNED_COLOR,
  HUD_SLOT_EMPTY_COLOR,
  HUD_SLOT_SELECTED_COLOR,
  HUD_RELOAD_COLOR,
  HUD_SPIN_COLOR,
  MAX_ARMOR,
  TOUCH_STICK_RADIUS,
  TOUCH_KNOB_RADIUS,
  TOUCH_LEFT_HINT_X,
  TOUCH_LEFT_HINT_Y,
  TOUCH_RIGHT_HINT_X,
  TOUCH_RIGHT_HINT_Y,
  RELOAD_BUTTON,
  SWITCH_BUTTON,
  TOUCH_BASE_COLOR,
  TOUCH_BASE_BORDER_COLOR,
  TOUCH_KNOB_COLOR,
  TOUCH_HINT_COLOR,
  TOUCH_BUTTON_COLOR,
  TOUCH_BUTTON_TEXT_COLOR,
} from './config.js';

// HUD（抬頭顯示）與選單畫面：畫在遊戲畫面最上層的資訊 (heads-up display & screens)
//   左上：血量、護甲、暫時效果　右上：關卡、剩餘敵人、最高紀錄　左下：武器
//   另外還有：畫面中央提示、主選單、死亡畫面

/**
 * 設定文字樣式的小幫手，省得每次寫三行 (helper to set text style)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {string} font 字型，例如 'bold 16px sans-serif'
 * @param {string} align 水平對齊：'left'、'center'、'right'
 * @param {string} baseline 垂直對齊：'top'、'middle'、'bottom'
 */
function setText(ctx, font, align, baseline) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
}

// ===== 左上：血量與效果 (top-left: HP & buffs) =====

/**
 * 左上角的玩家狀態：血條、護甲條、暫時效果剩餘秒數 (player status panel)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {Player} player 玩家
 */
export function drawStatusHud(ctx, player) {
  const left = HUD_MARGIN;
  let y = HUD_MARGIN;   // 由上往下排，每畫一行就往下移 (stack rows downward)

  // 先算出要畫幾行，才知道底板多高 (count rows to size the panel)
  const buffs = [];
  if (player.speedBuffTimer > 0) {
    buffs.push({ text: `Adrenaline ${Math.ceil(player.speedBuffTimer)}s`, color: HUD_ADRENALINE_COLOR });
  }
  if (player.damageBuffTimer > 0) {
    buffs.push({ text: `Power Ammo ${Math.ceil(player.damageBuffTimer)}s`, color: HUD_POWER_AMMO_COLOR });
  }
  // 躲在草叢裡沒被發現時提示玩家 (tell the player they're hidden)
  if (player.isHidden) {
    buffs.push({ text: 'HIDDEN in bush', color: '#a5d6a7' });
  }
  const panelHeight = 24 + (player.armor > 0 ? 10 : 0) + buffs.length * 18;

  ctx.fillStyle = HUD_BG_COLOR;
  ctx.fillRect(left - 6, y - 6, HUD_HP_BAR_WIDTH + 12, panelHeight + 12);

  // ----- 血條：低血量時變紅 (HP bar, red when low) -----
  const hpRatio = player.hp / player.maxHp;
  ctx.fillStyle = HUD_SLOT_EMPTY_COLOR;
  ctx.fillRect(left, y, HUD_HP_BAR_WIDTH, HUD_HP_BAR_HEIGHT);
  ctx.fillStyle = hpRatio < HUD_HP_LOW_RATIO ? HUD_HP_LOW_COLOR : HUD_HP_COLOR;
  ctx.fillRect(left, y, HUD_HP_BAR_WIDTH * hpRatio, HUD_HP_BAR_HEIGHT);

  // 血條上寫數字，例如 HP 70 / 100 (numbers on the bar)
  ctx.fillStyle = HUD_TEXT_COLOR;
  setText(ctx, 'bold 11px sans-serif', 'left', 'middle');
  ctx.fillText(`HP ${Math.ceil(player.hp)} / ${player.maxHp}`, left + 6, y + HUD_HP_BAR_HEIGHT / 2 + 1);
  y += HUD_HP_BAR_HEIGHT + 4;

  // ----- 護甲條：有護甲才畫 (armor bar, only when armored) -----
  if (player.armor > 0) {
    ctx.fillStyle = HUD_SLOT_EMPTY_COLOR;
    ctx.fillRect(left, y, HUD_HP_BAR_WIDTH, 6);
    ctx.fillStyle = HUD_ARMOR_COLOR;
    ctx.fillRect(left, y, HUD_HP_BAR_WIDTH * (player.armor / MAX_ARMOR), 6);
    y += 10;
  }

  // ----- 暫時效果 (active buffs) -----
  setText(ctx, '12px sans-serif', 'left', 'top');
  for (const buff of buffs) {
    ctx.fillStyle = buff.color;
    ctx.fillText(buff.text, left, y + 4);
    y += 18;
  }
}

// ===== 右上：關卡資訊 (top-right: stage info) =====

/**
 * 右上角的關卡資訊：第幾關、目標、最高紀錄 (stage panel)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} stage 第幾關
 * @param {boolean} isBoss 是否為 BOSS 關
 * @param {string} objective 目前目標，例如「剩餘敵人 3」
 * @param {number} bestStage 最高紀錄
 */
export function drawStageHud(ctx, stage, isBoss, objective, bestStage) {
  const right = GAME_WIDTH - HUD_MARGIN;
  const top = HUD_MARGIN;

  // 底板寬度跟著任務文字變寬，長的任務說明才不會超出底板 (panel grows with the objective text)
  setText(ctx, '13px sans-serif', 'right', 'top');
  const width = Math.max(HUD_STAGE_PANEL_WIDTH, ctx.measureText(objective).width);
  ctx.fillStyle = HUD_BG_COLOR;
  ctx.fillRect(right - width - 6, top - 6, width + 12, 64);

  // 第 N 關，BOSS 關用紫色並加上標記 (stage number, purple on boss stages)
  ctx.fillStyle = isBoss ? BOSS_COLOR : HUD_TEXT_COLOR;
  setText(ctx, 'bold 18px sans-serif', 'right', 'top');
  ctx.fillText(isBoss ? `BOSS - STAGE ${stage}` : `STAGE ${stage}`, right, top);

  ctx.fillStyle = HUD_TEXT_COLOR;
  setText(ctx, '13px sans-serif', 'right', 'top');
  ctx.fillText(objective, right, top + 24);

  ctx.fillStyle = HUD_SUBTEXT_COLOR;
  setText(ctx, '11px sans-serif', 'right', 'top');
  ctx.fillText(`Best: Stage ${bestStage}`, right, top + 42);
}

// ===== 畫面中央提示 (center message) =====

/**
 * 在畫面中央畫提示文字，背後一條半透明黑帶 (draw center message)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {string} text 文字
 */
export function drawCenterMessage(ctx, text) {
  const bandHeight = 60;
  ctx.fillStyle = MESSAGE_BG_COLOR;
  ctx.fillRect(0, GAME_HEIGHT / 2 - bandHeight / 2, GAME_WIDTH, bandHeight);

  ctx.fillStyle = MESSAGE_TEXT_COLOR;
  setText(ctx, 'bold 32px sans-serif', 'center', 'middle');
  ctx.fillText(text, GAME_WIDTH / 2, GAME_HEIGHT / 2);
}

// ===== 死亡畫面 (game over) =====

/**
 * 死亡畫面：撐到第幾關、最高紀錄、是否破紀錄、操作提示 (game over screen)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} stage 這局撐到第幾關
 * @param {number} bestStage 最高紀錄
 * @param {boolean} isNewRecord 這局是否破紀錄
 * @param {boolean} showHint 是否顯示操作提示（死亡後等一下才顯示）
 * @param {boolean} touchMode 是否為觸控模式 (touch mode)
 */
export function drawGameOverScreen(ctx, stage, bestStage, isNewRecord, showHint, touchMode) {
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;

  ctx.fillStyle = GAME_OVER_OVERLAY_COLOR;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = GAME_OVER_TEXT_COLOR;
  setText(ctx, `52px ${TITLE_FONT}`, 'center', 'middle');
  ctx.fillText('GAME OVER', cx, cy - 80);

  setText(ctx, '24px sans-serif', 'center', 'middle');
  ctx.fillText(`You reached stage ${stage}`, cx, cy - 25);

  if (isNewRecord) {
    ctx.fillStyle = NEW_RECORD_COLOR;
    setText(ctx, 'bold 22px sans-serif', 'center', 'middle');
    ctx.fillText('* NEW RECORD! *', cx, cy + 15);
  } else {
    ctx.fillStyle = MENU_SUBTEXT_COLOR;
    setText(ctx, '18px sans-serif', 'center', 'middle');
    ctx.fillText(`Best: Stage ${bestStage}`, cx, cy + 15);
  }

  if (showHint) {
    ctx.fillStyle = GAME_OVER_TEXT_COLOR;
    setText(ctx, '20px sans-serif', 'center', 'middle');
    // 手機沒有 Enter 和 Esc，只提示點擊 (no keyboard on phones)
    if (touchMode) {
      ctx.fillText('Tap the screen to restart', cx, cy + 70);
    } else {
      ctx.fillText('Press Enter or click to restart', cx, cy + 70);
      ctx.fillStyle = MENU_SUBTEXT_COLOR;
      setText(ctx, '16px sans-serif', 'center', 'middle');
      ctx.fillText('Press Esc for the main menu', cx, cy + 100);
    }
  }
}

// ===== 左下：武器 (bottom-left: weapon) =====

/**
 * 畫一條進度條 (draw a progress bar)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} x 左上角 x
 * @param {number} y 左上角 y
 * @param {number} ratio 進度 0 ~ 1
 * @param {string} color 顏色
 */
function drawProgressBar(ctx, x, y, ratio, color) {
  ctx.fillStyle = HUD_BG_COLOR;
  ctx.fillRect(x, y, HUD_BAR_WIDTH, HUD_BAR_HEIGHT);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, HUD_BAR_WIDTH * ratio, HUD_BAR_HEIGHT);
}

/**
 * 左下角的武器資訊：武器名稱、彈藥、換彈 / 預熱進度、8 格武器欄 (weapon HUD)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {Player} player 玩家
 */
export function drawWeaponHud(ctx, player) {
  const weapon = player.getWeapon();
  const def = weapon.def;

  const left = HUD_MARGIN;
  const panelWidth = WEAPONS.length * (HUD_SLOT_SIZE + HUD_SLOT_GAP) - HUD_SLOT_GAP;
  const panelHeight = 74;
  const panelTop = GAME_HEIGHT - HUD_MARGIN - panelHeight;

  // ----- 半透明底板 (background panel) -----
  ctx.fillStyle = HUD_BG_COLOR;
  ctx.fillRect(left - 6, panelTop - 6, panelWidth + 12, panelHeight + 12);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // ----- 武器名稱 (weapon name) -----
  ctx.fillStyle = HUD_TEXT_COLOR;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(def.name, left, panelTop);

  // ----- 彈藥：彈匣 / 備彈，手槍顯示 ∞ (ammo: magazine / reserve) -----
  const reserveText = def.infiniteReserve ? '∞' : `${weapon.reserveAmmo}`;
  ctx.font = '14px sans-serif';
  ctx.fillText(`${weapon.ammoInMag} / ${reserveText}`, left, panelTop + 22);

  // ----- 狀態：和彈藥同一行，「文字 + 進度條」(status on the same line as ammo) -----
  const statusX = left + 70;           // 文字的位置 (label x)
    const statusY = panelTop + 24;
  ctx.font = '12px sans-serif';

  if (weapon.isReloading()) {
    // 進度 = 已經過的時間 ÷ 總時間 (progress = elapsed / total)
    const ratio = 1 - weapon.reloadTimer / weapon.reloadDuration;
    ctx.fillStyle = HUD_SUBTEXT_COLOR;
    ctx.fillText('RELOAD', statusX, statusY);
    const barX = statusX + ctx.measureText('RELOAD').width + 6; // 進度條接在文字後面 (bar after the label)
    drawProgressBar(ctx, barX, statusY + 4, ratio, HUD_RELOAD_COLOR);
  } else if (def.spinUpTime > 0 && weapon.spinTimer > 0 && weapon.spinTimer < def.spinUpTime) {
    ctx.fillStyle = HUD_SUBTEXT_COLOR;
    ctx.fillText('SPIN UP', statusX, statusY);
    const barX = statusX + ctx.measureText('SPIN UP').width + 6;
    drawProgressBar(ctx, barX, statusY + 4, weapon.spinTimer / def.spinUpTime, HUD_SPIN_COLOR);
  } else if (weapon.ammoInMag === 0 && !weapon.hasReserveAmmo()) {
    ctx.fillStyle = HUD_SPIN_COLOR;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('NO AMMO!', statusX, statusY);
  }

  // ----- 武器欄：只畫已取得的武器，格子位置固定，按 N 永遠是第 N 把 (owned weapon slots only) -----
  for (let i = 0; i < WEAPONS.length; i++) {
    const slot = getWeaponSlotRect(i);
    const owned = player.weapons[i] !== null;
    if (!owned) continue; // 還沒拿到的武器不顯示 (skip weapons not owned yet)

    ctx.fillStyle = HUD_SLOT_OWNED_COLOR;
    ctx.fillRect(slot.x, slot.y, slot.size, slot.size);

    // 目前的武器加上黃色外框 (highlight current weapon)
    if (i === player.currentIndex) {
      ctx.strokeStyle = HUD_SLOT_SELECTED_COLOR;
      ctx.lineWidth = 2;
      ctx.strokeRect(slot.x, slot.y, slot.size, slot.size);
    }

    // 格子裡寫數字鍵 1~8 (number key label)
    ctx.fillStyle = HUD_TEXT_COLOR;
    setText(ctx, 'bold 12px sans-serif', 'center', 'middle');
    ctx.fillText(`${i + 1}`, slot.x + slot.size / 2, slot.y + slot.size / 2 + 1);
  }
}

/**
 * 第 i 格武器欄的位置和大小；畫圖和觸控判斷共用，才不會「畫的位置」和「點的位置」對不上 (slot rectangle)
 * @param {number} i 第幾格，0 ~ 7
 * @returns {{x: number, y: number, size: number}} 左上角座標與邊長
 */
export function getWeaponSlotRect(i) {
  return {
    x: HUD_MARGIN + i * (HUD_SLOT_SIZE + HUD_SLOT_GAP),
    y: GAME_HEIGHT - HUD_MARGIN - HUD_SLOT_SIZE,
    size: HUD_SLOT_SIZE,
  };
}

// ===== 手機觸控操作 (touch controls) =====

/**
 * 畫一個圓形按鈕，例如「換彈」(draw a round button)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {{x: number, y: number, radius: number, label: string}} button 按鈕設定
 */
function drawTouchButton(ctx, button) {
  ctx.fillStyle = TOUCH_BUTTON_COLOR;
  ctx.beginPath();
  ctx.arc(button.x, button.y, button.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TOUCH_BASE_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = TOUCH_BUTTON_TEXT_COLOR;
  setText(ctx, 'bold 14px sans-serif', 'center', 'middle');
  ctx.fillText(button.label, button.x, button.y + 1);
}

/**
 * 畫一個搖桿：推動中畫底座 + 搖桿頭；沒推的時候在預設位置畫淡淡的提示圈 (draw one joystick)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {object} stick 搖桿狀態，來自 input.js
 * @param {number} hintX 提示圈 x
 * @param {number} hintY 提示圈 y
 */
function drawStick(ctx, stick, hintX, hintY) {
  if (stick.pointerId === null) {
    ctx.fillStyle = TOUCH_HINT_COLOR;
    ctx.beginPath();
    ctx.arc(hintX, hintY, TOUCH_STICK_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 底座：手指一開始按下的位置 (base: where the finger first touched)
  ctx.fillStyle = TOUCH_BASE_COLOR;
  ctx.beginPath();
  ctx.arc(stick.baseX, stick.baseY, TOUCH_STICK_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = TOUCH_BASE_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 搖桿頭：跟著手指，但不超出底座 (knob: follows the finger, stays inside the base)
  ctx.fillStyle = TOUCH_KNOB_COLOR;
  ctx.beginPath();
  ctx.arc(stick.knobX, stick.knobY, TOUCH_KNOB_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 畫出所有觸控操作：兩個搖桿、換彈按鈕、換槍按鈕 (draw all touch controls)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {{leftStick: object, rightStick: object}} controls 搖桿狀態
 */
export function drawTouchControls(ctx, controls) {
  drawStick(ctx, controls.leftStick, TOUCH_LEFT_HINT_X, TOUCH_LEFT_HINT_Y);
  drawStick(ctx, controls.rightStick, TOUCH_RIGHT_HINT_X, TOUCH_RIGHT_HINT_Y);
  drawTouchButton(ctx, RELOAD_BUTTON);
  drawTouchButton(ctx, SWITCH_BUTTON);
}

// ===== 小地圖與出口箭頭 (minimap & exit arrow) =====

// 小地圖上每種格子的顏色；空地不畫 (minimap colors per tile type; empty tiles are skipped)
const MINIMAP_COLORS = {
  tree: '#2e7d32',
  rock: '#9e9e9e',
  crate: '#a1887f',
  water: '#4fc3f7',
  bush: '#66bb6a',
  tower: '#e57373',
  wire: '#b0bec5',
  bunker: '#90a4ae',
  bunkerTurret: '#ff7043',
  towerTurret: '#ff7043',
  towerSniper: '#e57373',
  palisade: '#8d6e63',
  tent: '#827717',
  hut: '#c9a253',
  campfire: '#ff7043',
  sandbag: '#d7c08a',
  trap: '#e57373',
};

/**
 * 右上角的小地圖：障礙物、河、小路、出口、敵人（紅點）、玩家（黃點），白框是目前畫面看到的範圍
 * (minimap: terrain, exit, enemies, player, and a white box for the current view)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {GameMap} map 地圖
 * @param {Player} player 玩家
 * @param {Enemy[]} enemies 敵人
 * @param {{x: number, y: number}} camera 鏡頭位置
 * @param {{x: number, y: number, color: string}[]} markers 任務目標標記（情報、人質）(mission markers)
 */
export function drawMinimap(ctx, map, player, enemies, camera, markers) {
  const px = MINIMAP_TILE_PX;
  const width = MAP_COLS * px;
  const height = MAP_ROWS * px;
  const left = GAME_WIDTH - HUD_MARGIN - width;
  const top = MINIMAP_TOP;
  // 地圖座標 → 小地圖座標：除以格子大小再乘每格幾 px (world px → minimap px)
  const ratio = px / TILE_SIZE;

  ctx.fillStyle = 'rgba(20, 50, 25, 0.75)';
  ctx.fillRect(left - 3, top - 3, width + 6, height + 6);

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const type = map.tiles[row][col];
      let color = MINIMAP_COLORS[type];
      if (color === undefined && map.ground[row][col] !== 'grass') {
        color = map.ground[row][col] === 'bridge' ? '#8d6e63' : 'rgba(210, 180, 120, 0.55)'; // 小路、橋、營地 (trail, bridge, camp)
      }
      if (color === undefined) continue;
      ctx.fillStyle = color;
      ctx.fillRect(left + col * px, top + row * px, px, px);
    }
  }


  // 任務目標：會閃的方塊 (mission markers, blinking)
  if (Math.floor(performance.now() / 300) % 2 === 0) {
    for (const marker of markers) {
      ctx.fillStyle = marker.color;
      ctx.fillRect(left + marker.x * ratio - 2, top + marker.y * ratio - 2, 4, 4);
    }
  }

  // 敵人紅點 (enemies as red dots)
  ctx.fillStyle = '#ff5252';
  for (const enemy of enemies) {
    ctx.fillRect(left + enemy.x * ratio - 1.5, top + enemy.y * ratio - 1.5, 3, 3);
  }

  // 目前畫面看到的範圍 (the area the screen shows right now)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + camera.x * ratio, top + camera.y * ratio, VIEW_WIDTH * ratio, VIEW_HEIGHT * ratio);

  // 玩家黃點，最後畫才不會被蓋住 (player dot on top)
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(left + player.x * ratio, top + player.y * ratio, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 目標（撤離卡車）不在畫面內時，在畫面邊緣畫一個指向它的綠色箭頭 (edge arrow pointing to an off-screen target)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {{x: number, y: number}} exit 目標的地圖座標 (target position in the world)
 * @param {{x: number, y: number}} camera 鏡頭位置
 * @param {number} time 經過秒數，讓箭頭輕輕跳動 (seconds, for a gentle bounce)
 */
export function drawTargetArrow(ctx, exit, camera, time) {
  // 出口在畫面上的位置 = 地圖座標 − 鏡頭位置 (world → screen)
  const screenX = (exit.x - camera.x) * CAMERA_ZOOM;
  const screenY = (exit.y - camera.y) * CAMERA_ZOOM;
  const margin = EXIT_ARROW_MARGIN;
  const onScreen = screenX > margin && screenX < GAME_WIDTH - margin && screenY > margin && screenY < GAME_HEIGHT - margin;
  if (onScreen) return;

  // 從畫面中心指向出口的方向，延伸到碰到「內縮 margin 的畫面邊框」為止 (from screen center toward the exit, stop at the inset border)
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const dx = screenX - cx;
  const dy = screenY - cy;
  const scaleX = dx !== 0 ? (cx - margin) / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? (cy - margin) / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);
  const angle = Math.atan2(dy, dx);
  const bounce = Math.sin(time * 6) * 3;
  const x = cx + dx * t + Math.cos(angle) * bounce;
  const y = cy + dy * t + Math.sin(angle) * bounce;

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20, 60, 20, 0.8)';
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#76ff03';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  // 小卡車圖示 (tiny truck icon)
  ctx.fillRect(-9, -4, 12, 8);
  ctx.fillRect(4, -3, 6, 6);
  // 三角形箭頭，指向出口 (triangle pointing at the exit)
  ctx.rotate(angle);
  ctx.fillStyle = '#76ff03';
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(17, -7);
  ctx.lineTo(17, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ===== 視野陰影 (field-of-view shade) =====
// 做法：在另一張和畫面一樣大的畫布上先塗滿半透明黑色，再用 destination-out（「挖掉」模式）
// 把面前的扇形和身邊的小圓挖空，最後整張貼到畫面上 → 只有背後和兩側變暗。
// (paint a dark layer, cut out the view cone with destination-out, then lay it over the screen)
let shadeCanvas = null;
let shadeContext = null;

/**
 * 畫視野陰影：玩家面向的 120° 扇形是亮的，其他地方稍微變暗 (bright view cone, darker elsewhere)
 * @param {CanvasRenderingContext2D} ctx 畫筆
 * @param {number} x 玩家在畫面上的 x (player x on screen)
 * @param {number} y 玩家在畫面上的 y
 * @param {number} angle 瞄準角度 (aim angle)
 */
export function drawVisionShade(ctx, x, y, angle) {
  // 陰影畫布的解析度跟主畫布一樣，邊緣才不會糊 (same resolution as the main canvas)
  const scale = ctx.getTransform().a;
  const width = Math.round(GAME_WIDTH * scale);
  const height = Math.round(GAME_HEIGHT * scale);
  if (shadeCanvas === null || shadeCanvas.width !== width || shadeCanvas.height !== height) {
    shadeCanvas = document.createElement('canvas');
    shadeCanvas.width = width;
    shadeCanvas.height = height;
    shadeContext = shadeCanvas.getContext('2d');
  }
  const g = shadeContext;
  g.setTransform(scale, 0, 0, scale, 0, 0);

  // 1. 先塗滿半透明黑色 (fill with translucent black)
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  g.fillStyle = `rgba(0, 0, 0, ${VISION_SHADE_ALPHA})`;
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // 2. 挖掉面前的扇形：畫三層，越外層越寬、挖得越少，邊緣就是柔和的漸層 (cut the cone in 3 layers for a soft edge)
  g.globalCompositeOperation = 'destination-out';
  const reach = GAME_WIDTH * 1.5; // 扇形半徑要夠長，蓋到畫面最遠的角落 (long enough to reach any corner)
  const layers = [
    { extra: 0.24, strength: 0.3 },
    { extra: 0.12, strength: 0.5 },
    { extra: 0, strength: 1 },
  ];
  for (const layer of layers) {
    const half = VISION_HALF_ANGLE + layer.extra;
    g.fillStyle = `rgba(0, 0, 0, ${layer.strength})`;
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, reach, angle - half, angle + half);
    g.closePath();
    g.fill();
  }

  // 3. 挖掉身邊的小圓，中心全挖、往外漸漸變淡 (cut a soft circle around the player)
  const near = g.createRadialGradient(x, y, VISION_NEAR_RADIUS * 0.5, x, y, VISION_NEAR_RADIUS);
  near.addColorStop(0, 'rgba(0, 0, 0, 1)');
  near.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = near;
  g.beginPath();
  g.arc(x, y, VISION_NEAR_RADIUS, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';

  // 4. 貼到主畫面 (lay it over the screen)
  ctx.drawImage(shadeCanvas, 0, 0, GAME_WIDTH, GAME_HEIGHT);
}
