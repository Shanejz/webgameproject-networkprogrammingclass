import {
  AUDIO_MASTER_VOLUME,
  AUDIO_SFX_VOLUME,
  AUDIO_GUN_VOLUME,
  AUDIO_MUSIC_VOLUME,
  STORAGE_KEY_MUTED,
  MUTE_KEY_CODE,
  MUSIC_TEMPO_MENU,
  MUSIC_TEMPO_BOSS,
  AUDIO_AMBIENCE_VOLUME,
  SOUND_MIN_INTERVAL,
} from './config.js';

// 音效與音樂：全部用 Web Audio API 即時「合成」，不用任何音檔 (all sounds are synthesized, no audio files)
//
// 聲音的做法只有兩種積木：
//   tone()  ：振盪器 (oscillator)，發出有音高的聲音，頻率可以從 A 滑到 B（槍聲的「咚」、道具的「叮」）
//   noise() ：白噪音 (white noise) 經過濾波器 (filter)，發出沒音高的聲音（槍聲的「啪」、爆炸的「轟」）
// 每個音效就是把幾個積木疊在一起，再各自套用「音量由大到小」的包絡 (envelope)。
//
// 聲音流向 (signal flow)：
//   槍聲 → gunGain ──→ sfxGain ──┐
//   其他音效 ─────────→ sfxGain ──┤
//                                ├→ masterGain → 喇叭 (speakers)
//   音樂 → musicGain ────────────┘

let audioCtx = null;      // AudioContext：瀏覽器的音訊系統，要等玩家第一次操作才能建立 (created after first user gesture)
let masterGain = null;    // 總音量 (master volume)
let sfxGain = null;       // 音效音量 (sfx volume)
let musicGain = null;     // 音樂音量 (music volume)
let gunGain = null;       // 槍聲音量，接在 sfxGain 前面 (gunshot volume, feeds into sfxGain)
// 目前這個音效要接到哪個音量節點；playSound 會依音效種類設定 (where the current recipe's sounds go)
let recipeOutput = null;
let noiseBuffer = null;   // 預先做好的白噪音，大家共用 (shared white noise)

let muted = loadMuted();  // 是否靜音 (muted flag)
const lastPlayedAt = {};  // 每種音效上次播放的時間，節流用 (last play time per sound)

// ===== 靜音設定存檔 (mute setting in localStorage) =====

/**
 * 讀取靜音設定；讀不到就當作沒靜音 (load mute setting)
 * @returns {boolean}
 */
function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY_MUTED) === '1';
  } catch (error) {
    return false;
  }
}

/**
 * 儲存靜音設定 (save mute setting)
 */
function saveMuted() {
  try {
    localStorage.setItem(STORAGE_KEY_MUTED, muted ? '1' : '0');
  } catch (error) {
    // 存不了就算了 (ignore)
  }
}

// ===== 啟動與解鎖 (init & unlock) =====

/**
 * 準備音訊系統，遊戲啟動時呼叫一次 (call once at startup)
 * 瀏覽器規定：沒有玩家操作之前不准出聲（防止網頁亂播聲音），
 * 所以這裡只「註冊」第一次點擊 / 按鍵 / 觸碰的事件，真正建立音訊系統是在那一刻。
 */
export function initAudio() {
  const unlock = () => {
    if (audioCtx === null) {
      createAudioSystem();
    }
    // 手機或切換分頁後 context 可能是 suspended，要叫醒它 (wake it up if suspended)
    if (audioCtx !== null && audioCtx.state !== 'running') {
      audioCtx.resume();
    }
  };
  // 這幾種都算「玩家操作」。不拿掉監聽器，因為 iOS 有時會再次暫停 (keep listeners; iOS may suspend again)
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('touchend', unlock);
  window.addEventListener('keydown', unlock);

  // 按 M 切換靜音 (M toggles mute)
  window.addEventListener('keydown', (event) => {
    if (event.code === MUTE_KEY_CODE && !event.repeat) {
      toggleMute();
    }
  });

  // 切到別的分頁就暫停聲音，回來再繼續，省電也不會背景亂叫 (pause audio when tab is hidden)
  document.addEventListener('visibilitychange', () => {
    if (audioCtx === null) return;
    if (document.hidden) {
      audioCtx.suspend();
    } else {
      audioCtx.resume();
    }
  });
}

/**
 * 建立 AudioContext、音量節點、白噪音，並啟動音樂排程 (build the audio graph)
 */
function createAudioSystem() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext; // 舊版 Safari 要加 webkit (old Safari)
  if (!AudioContextClass) return; // 瀏覽器不支援就當作沒有聲音，遊戲照玩 (no support: stay silent)

  audioCtx = new AudioContextClass();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = muted ? 0 : AUDIO_MASTER_VOLUME;
  masterGain.connect(audioCtx.destination);

  sfxGain = audioCtx.createGain();
  sfxGain.gain.value = AUDIO_SFX_VOLUME;
  sfxGain.connect(masterGain);

  recipeOutput = sfxGain; // 預設接到音效音量 (default destination)

  gunGain = audioCtx.createGain();
  gunGain.gain.value = AUDIO_GUN_VOLUME;
  gunGain.connect(sfxGain);

  musicGain = audioCtx.createGain();
  musicGain.gain.value = AUDIO_MUSIC_VOLUME;
  musicGain.connect(masterGain);

  // 白噪音 = 一長串隨機數字 (white noise = random samples)，做 2 秒就夠，每次從不同位置開始播
  const length = audioCtx.sampleRate * 2;
  noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  buildGunSounds();
  startMusicScheduler();
}

/**
 * 切換靜音 (toggle mute)
 * @returns {boolean} 切換後是否靜音 (muted after toggle)
 */
export function toggleMute() {
  muted = !muted;
  saveMuted();
  if (masterGain !== null) {
    masterGain.gain.value = muted ? 0 : AUDIO_MASTER_VOLUME;
  }
  return muted;
}

/**
 * 目前是否靜音 (is muted)
 * @returns {boolean}
 */
export function isMuted() {
  return muted;
}

// ===== 兩種基本積木 (the two building blocks) =====

/**
 * 發出一個有音高的聲音 (play a pitched sound)
 * @param {number} freq 起始頻率 Hz，越大越尖 (start frequency)
 * @param {number} endFreq 結束頻率 Hz，頻率往這裡滑動 (end frequency, glides to this)
 * @param {number} duration 持續秒數 (seconds)
 * @param {string} type 波形：'sine' 圓潤、'triangle' 柔和、'square' 電子、'sawtooth' 粗糙 (waveform)
 * @param {number} volume 音量 0 ~ 1 (volume)
 * @param {number} delay 幾秒後才開始 (start delay in seconds)
 * @param {AudioNode} output 接到哪裡，預設是目前音效該去的音量節點 (destination node)
 */
function tone(freq, endFreq, duration, type, volume, delay = 0, output = recipeOutput) {
  const start = audioCtx.currentTime + Math.max(0, delay);
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  // 指數滑動聽起來比較自然；頻率不能是 0，所以至少 1 (exponential glide; must be > 0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);

  const gain = audioCtx.createGain();
  applyEnvelope(gain, start, duration, volume);

  osc.connect(gain);
  gain.connect(output);
  osc.start(start);
  osc.stop(start + duration + 0.05); // 多留一點點，避免尾巴被切掉 (small tail margin)
}

/**
 * 發出一個沒有音高的「噪音」聲音，用濾波器決定音色 (play filtered noise)
 * @param {number} duration 持續秒數 (seconds)
 * @param {string} filterType 'lowpass' 悶（只留低頻）、'bandpass' 中間、'highpass' 嘶（只留高頻）(filter type)
 * @param {number} freq 濾波器起始頻率 Hz (filter start frequency)
 * @param {number} endFreq 濾波器結束頻率 Hz，往這裡滑動 (filter end frequency)
 * @param {number} volume 音量 0 ~ 1 (volume)
 * @param {number} delay 幾秒後才開始 (start delay in seconds)
 * @param {AudioNode} output 接到哪裡，預設是目前音效該去的音量節點 (destination node)
 */
function noise(duration, filterType, freq, endFreq, volume, delay = 0, output = recipeOutput) {
  const start = audioCtx.currentTime + Math.max(0, delay);
  const source = audioCtx.createBufferSource();
  source.buffer = noiseBuffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), start + duration);

  const gain = audioCtx.createGain();
  applyEnvelope(gain, start, duration, volume);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  // 從噪音的隨機位置開始播，每次聽起來才不會一模一樣 (random start offset)
  source.start(start, Math.random() * 1.5);
  source.stop(start + duration + 0.05);
}

/**
 * 音量包絡：0.005 秒內衝到最大音量，然後慢慢降到幾乎無聲 (volume envelope)
 * 為什麼不直接開關？突然開關會有「啪」的雜音，漸變才乾淨。
 * @param {GainNode} gain 音量節點
 * @param {number} start 開始時間 (start time)
 * @param {number} duration 持續秒數
 * @param {number} volume 最大音量
 */
function applyEnvelope(gain, start, duration, volume) {
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
}

// ===== 音效配方表 (sound recipes) =====
// 每個音效 = 幾個 tone / noise 疊在一起。想改音色就改這裡的數字：
//   頻率越高越尖、duration 越長尾音越長、volume 越大越吵。

const SOUNDS = {
  // ----- 槍聲 (gunshots) -----
  // 每把槍的槍聲不在這裡，改用下面 GUN_PROFILES「逐點算出」的錄音式音效，聽起來比較像真槍 (see GUN_PROFILES below)
  gatlingSpin() {
    // 加特林空轉：馬達越轉越快的「嗡——」(motor whir rising while the barrels spin up)
    tone(60, 300, 1.0, 'sawtooth', 0.07);
    noise(1.0, 'bandpass', 300, 1800, 0.12);
  },

  // ----- 武器操作 (weapon handling) -----
  // 換彈聲和空擊聲改用下面 FOLEY_SOUNDS 的擬真機械聲 (reload & dry-fire sounds: see FOLEY_SOUNDS below)
  switchWeapon() {
    noise(0.04, 'bandpass', 3000, 2000, 0.25);
    tone(700, 500, 0.04, 'square', 0.12);
  },

  // ----- 戰鬥回饋 (combat feedback) -----
  hit() {
    noise(0.05, 'bandpass', 1000, 500, 0.32);
    tone(220, 100, 0.05, 'square', 0.18);
  },
  playerHurt() {
    tone(240, 70, 0.22, 'sawtooth', 0.45);
    noise(0.13, 'lowpass', 1500, 300, 0.3);
  },
  enemyDeath() {
    tone(320, 50, 0.35, 'sawtooth', 0.3);
    noise(0.3, 'lowpass', 1400, 200, 0.35);
  },
  bossDeath() {
    tone(160, 30, 0.9, 'sawtooth', 0.5);
    noise(0.9, 'lowpass', 2200, 100, 0.8);
    tone(80, 25, 1.0, 'sine', 0.5, 0.1);
  },
  crateBreak() {
    noise(0.16, 'lowpass', 2000, 500, 0.5);             // 木頭碎裂 (wood crack)
    tone(180, 90, 0.1, 'square', 0.15);
    noise(0.06, 'highpass', 3000, 3000, 0.25);
  },
  explosion() {
    noise(0.7, 'lowpass', 2000, 60, 1.0);
    tone(95, 25, 0.6, 'sine', 0.7);
    noise(0.1, 'highpass', 2500, 2500, 0.3);
  },

  // ----- 撿東西 (pickups) -----
  pickupAmmo() {
    tone(660, 660, 0.05, 'square', 0.18);
    tone(990, 990, 0.08, 'square', 0.18, 0.05);
  },
  pickupHeal() {
    tone(523, 523, 0.1, 'sine', 0.35);                  // Do Mi Sol 上行的小琶音 (rising arpeggio)
    tone(659, 659, 0.1, 'sine', 0.35, 0.07);
    tone(784, 784, 0.18, 'sine', 0.35, 0.14);
  },
  pickupItem() {
    tone(523, 523, 0.09, 'triangle', 0.4);
    tone(659, 659, 0.09, 'triangle', 0.4, 0.07);
    tone(784, 784, 0.09, 'triangle', 0.4, 0.14);
    tone(1047, 1047, 0.25, 'triangle', 0.4, 0.21);
  },
  pickupIntel() {
    // 偷到情報：翻紙的沙沙聲 + 神秘的兩個音 (paper rustle + a sneaky two-note sting)
    noise(0.18, 'highpass', 3000, 5000, 0.25);
    tone(392, 392, 0.14, 'triangle', 0.3, 0.08);
    tone(587, 587, 0.3, 'triangle', 0.3, 0.2);
  },
  hostageRescued() {
    // 救出人質：溫暖上行的和弦 (warm rising chord)
    tone(392, 392, 0.4, 'sine', 0.25);
    tone(494, 494, 0.4, 'sine', 0.22, 0.08);
    tone(587, 587, 0.5, 'sine', 0.22, 0.16);
    tone(784, 784, 0.6, 'sine', 0.2, 0.24);
  },
  machete() {
    // 砍刀：揮過空氣的「咻」+ 砍中的「啪」(machete: whoosh + hit)
    noise(0.12, 'bandpass', 1200, 4000, 0.3);
    noise(0.05, 'lowpass', 1500, 400, 0.45, 0.08);
    tone(160, 80, 0.06, 'square', 0.15, 0.08);
  },
  dialogueNext() {
    // 過場對話翻到下一句：很輕的「喀」(soft tick for the next line of dialogue)
    tone(900, 700, 0.03, 'triangle', 0.12);
  },
  pickupWeapon() {
    tone(392, 392, 0.12, 'square', 0.25);               // 取得新武器的號角 (fanfare)
    tone(523, 523, 0.12, 'square', 0.25, 0.1);
    tone(659, 659, 0.12, 'square', 0.25, 0.2);
    tone(784, 784, 0.35, 'square', 0.3, 0.3);
    noise(0.15, 'highpass', 4000, 4000, 0.2, 0.3);
  },

  // ----- 關卡流程 (stage flow) -----
  stageStart() {
    tone(180, 320, 0.25, 'triangle', 0.35);
    noise(0.25, 'bandpass', 400, 1500, 0.15);
  },
  bossAlert() {
    tone(90, 60, 0.9, 'sawtooth', 0.4);                 // 低沉的警報 (ominous alarm)
    tone(440, 440, 0.15, 'square', 0.18, 0.0);
    tone(440, 440, 0.15, 'square', 0.18, 0.3);
    tone(440, 440, 0.15, 'square', 0.18, 0.6);
  },
  stageClear() {
    tone(392, 392, 0.12, 'triangle', 0.4);
    tone(523, 523, 0.12, 'triangle', 0.4, 0.1);
    tone(659, 659, 0.12, 'triangle', 0.4, 0.2);
    tone(784, 784, 0.3, 'triangle', 0.4, 0.3);
  },
  truckHorn() {
    // 卡車喇叭「叭叭」(truck horn: two honks)
    tone(330, 330, 0.18, 'sawtooth', 0.12);
    tone(415, 415, 0.18, 'sawtooth', 0.1);
    tone(330, 330, 0.3, 'sawtooth', 0.12, 0.25);
    tone(415, 415, 0.3, 'sawtooth', 0.1, 0.25);
  },
  ambushWhistle() {
    // 伏擊的戰爭哨音：「嗶、嗶、嗶——」兩短一長，從叢林裡傳來，有回音 (war whistle: two short blasts and a long one, echoing in the jungle)
    playWhistle(0, 0.16);
    playWhistle(0.24, 0.16);
    playWhistle(0.5, 0.95);
    noise(0.5, 'lowpass', 140, 70, 0.25, 0.5);   // 底下一聲低沉的悶響，像戰鼓 (a low thump underneath, like a war drum)
    tone(70, 45, 0.5, 'sine', 0.35, 0.5);
  },
  engineStart() {
    // 上車：啟動馬達「咕嚕咕嚕」轉幾下 → 引擎發動、催油門 → 慢慢開走 (board: starter cranks → engine catches and revs → drives off)
    playEngine(true);
  },
  engineStop() {
    // 下車：引擎怠速 → 熄火，再「碰」一聲關車門 (drop-off: idling engine winds down, then a door slam)
    playEngine(false);
  },
  truckArrive() {
    // 卡車停下：引擎低沉的熄火聲 + 煞車 (engine winding down + brakes)
    tone(90, 45, 0.6, 'sawtooth', 0.12);
    noise(0.3, 'bandpass', 2500, 1500, 0.1, 0.1);
  },
  gameOver() {
    tone(392, 196, 0.5, 'sawtooth', 0.35);              // 往下掉的哀鳴 (falling wail)
    tone(330, 165, 0.6, 'sawtooth', 0.3, 0.3);
    tone(262, 98, 1.0, 'sawtooth', 0.35, 0.6);
  },
  uiConfirm() {
    tone(440, 880, 0.1, 'square', 0.2);
    tone(660, 1320, 0.15, 'square', 0.15, 0.07);
  },
};

// 哪些音效算「槍聲」，要走 gunGain (which sounds count as gunshots)
// 擬真槍聲（GUN_PROFILES）本來就走 gunGain；這裡列的是用合成配方、但也算槍聲的 (synth recipes that also use the gun bus)
const GUN_SOUNDS = new Set(['gatlingSpin']);

/**
 * 播放一個音效 (play a sound effect)
 * 還沒解鎖、靜音、名稱不存在、或太快重複播放時，什麼都不做（所以呼叫的地方可以放心亂呼叫）。
 * @param {string} name SOUNDS 裡的名稱，例如 'explosion' (sound name)
 */
export function playSound(name) {
  if (audioCtx === null || audioCtx.state !== 'running') return;
  if (muted) return;

  const recipe = SOUNDS[name];
  const gunBuffer = gunBuffers[name];
  if (recipe === undefined && gunBuffer === undefined) return;

  // 節流 (throttle)：同一種聲音太靠近就跳過 (skip if the same sound played too recently)
  const minInterval = SOUND_MIN_INTERVAL[name] ?? 0;
  const now = audioCtx.currentTime;
  if (minInterval > 0 && now - (lastPlayedAt[name] ?? -1) < minInterval) return;
  lastPlayedAt[name] = now;

  if (gunBuffer !== undefined) {
    playGunBuffer(name, gunBuffer);
    return;
  }

  // 槍聲走比較小聲的 gunGain，其他音效走 sfxGain (gunshots use the quieter gun bus)
  recipeOutput = GUN_SOUNDS.has(name) ? gunGain : sfxGain;
  recipe();
  recipeOutput = sfxGain;
}

// ===== 戰爭哨音 (war whistle) =====

/**
 * 吹一聲哨子：高音正弦波，加上很快的音高抖動（哨子裡的小球在滾），再送一點到回音裡
 * (one whistle blast: a high sine with fast pitch wobble from the rolling pea, plus some reverb)
 * @param {number} delay 幾秒後開始
 * @param {number} length 吹多久（秒）
 */
function playWhistle(delay, length) {
  const start = audioCtx.currentTime + delay;
  const end = start + length;
  const whistle = audioCtx.createOscillator();
  whistle.type = 'sine';
  whistle.frequency.setValueAtTime(2650, start);
  whistle.frequency.linearRampToValueAtTime(2900, start + 0.04);    // 吹進去的瞬間音高往上 (the pitch jumps as you blow)
  whistle.frequency.setValueAtTime(2900, end - 0.05);
  whistle.frequency.linearRampToValueAtTime(2600, end);
  const pea = audioCtx.createOscillator();                           // 小球滾動造成的抖音 (the pea's trill)
  pea.type = 'triangle';
  pea.frequency.value = 32;
  const peaDepth = audioCtx.createGain();
  peaDepth.gain.value = 140;
  pea.connect(peaDepth);
  peaDepth.connect(whistle.frequency);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.11, start + 0.015);
  gain.gain.setValueAtTime(0.11, end - 0.04);
  gain.gain.linearRampToValueAtTime(0, end);
  whistle.connect(gain);
  gain.connect(recipeOutput);
  if (reverb !== null) {
    const send = audioCtx.createGain();       // 叢林裡的回音 (jungle echo)
    send.gain.value = 0.6;
    gain.connect(send);
    send.connect(reverb);
  }
  whistle.start(start);
  pea.start(start);
  whistle.stop(end + 0.02);
  pea.stop(end + 0.02);
  noise(length, 'highpass', 4000, 4000, 0.025, delay);   // 吹氣的氣音 (breath noise)
}

// ===== 卡車引擎 (truck engine) =====

/**
 * 合成卡車引擎聲 (synthesize the truck engine)
 * 引擎 = 低頻鋸齒波（點火頻率）＋ 一點破音，經過低通濾波；再用「點火頻率一半」的正弦波去調音量，聽起來會「突突突」
 * (engine = a low sawtooth at the firing rate + mild distortion through a low-pass; amplitude-modulated at half the
 *  firing rate so it chugs)
 * @param {boolean} starting true = 發動並開走（上車）；false = 怠速後熄火、關車門（下車）
 *                           (true: crank, start and drive off; false: idle, shut off, door slam)
 */
function playEngine(starting) {
  const out = recipeOutput;
  const now = audioCtx.currentTime + 0.02;
  const crank = starting ? 0.8 : 0;          // 啟動馬達轉多久 (starter duration)
  const total = starting ? 2.9 : 1.5;
  const end = now + total;

  // ----- 啟動馬達：「咕嚕咕嚕」(starter motor: whirring with compression chugs) -----
  if (starting) {
    const starter = audioCtx.createOscillator();
    starter.type = 'sawtooth';
    starter.frequency.setValueAtTime(110, now);
    starter.frequency.linearRampToValueAtTime(150, now + crank);
    const chug = audioCtx.createOscillator();   // 壓縮行程讓馬達一頓一頓 (compression strokes)
    chug.type = 'square';
    chug.frequency.value = 7.5;
    const chugDepth = audioCtx.createGain();
    chugDepth.gain.value = 0.05;
    const starterGain = audioCtx.createGain();
    starterGain.gain.setValueAtTime(0, now);
    starterGain.gain.linearRampToValueAtTime(0.07, now + 0.05);
    starterGain.gain.setValueAtTime(0.07, now + crank - 0.08);
    starterGain.gain.linearRampToValueAtTime(0, now + crank + 0.05);
    chug.connect(chugDepth);
    chugDepth.connect(starterGain.gain);
    const starterFilter = audioCtx.createBiquadFilter();
    starterFilter.type = 'bandpass';
    starterFilter.frequency.value = 700;
    starterFilter.Q.value = 0.9;
    starter.connect(starterFilter);
    starterFilter.connect(starterGain);
    starterGain.connect(out);
    starter.start(now);
    chug.start(now);
    starter.stop(now + crank + 0.1);
    chug.stop(now + crank + 0.1);
    noise(crank, 'lowpass', 500, 400, 0.08, 0.02);   // 機械的沙沙聲 (mechanical rattle)
  }

  // ----- 引擎本體 (the engine itself) -----
  const engine = audioCtx.createOscillator();
  engine.type = 'sawtooth';
  const lope = audioCtx.createOscillator();         // 「突突突」的起伏 (the chugging pulse)
  lope.type = 'sine';
  const lopeDepth = audioCtx.createGain();
  const engineGain = audioCtx.createGain();
  const shaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 3) / Math.tanh(3);
  }
  shaper.curve = curve;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;

  // 轉速曲線（點火頻率 Hz）、濾波器、音量 (rpm curve as firing frequency, filter cutoff, volume)
  const rpm = engine.frequency;
  const caught = now + crank;
  if (starting) {
    rpm.setValueAtTime(14, caught);
    rpm.exponentialRampToValueAtTime(62, caught + 0.35);   // 發動，催一下油門 (catches and revs)
    rpm.exponentialRampToValueAtTime(30, caught + 0.9);    // 回到怠速 (back to idle)
    rpm.setValueAtTime(30, caught + 1.15);
    rpm.exponentialRampToValueAtTime(52, end);              // 打檔開走 (in gear, pulling away)
    filter.frequency.setValueAtTime(350, caught);
    filter.frequency.exponentialRampToValueAtTime(1100, caught + 0.35);
    filter.frequency.exponentialRampToValueAtTime(500, caught + 0.9);
    filter.frequency.exponentialRampToValueAtTime(900, end);
    engineGain.gain.setValueAtTime(0, now);
    engineGain.gain.setValueAtTime(0, caught);
    engineGain.gain.linearRampToValueAtTime(0.32, caught + 0.08);
    engineGain.gain.setValueAtTime(0.3, end - 0.9);
    engineGain.gain.linearRampToValueAtTime(0, end);        // 開遠了 (fades into the distance)
  } else {
    rpm.setValueAtTime(30, now);
    rpm.setValueAtTime(30, now + 0.6);
    rpm.exponentialRampToValueAtTime(9, now + 1.05);       // 熄火，轉速掉下來 (shut off: rpm falls)
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 1.05);
    engineGain.gain.setValueAtTime(0, now);
    engineGain.gain.linearRampToValueAtTime(0.26, now + 0.12);
    engineGain.gain.setValueAtTime(0.26, now + 0.6);
    engineGain.gain.linearRampToValueAtTime(0, now + 1.1);
  }
  lope.frequency.value = 6;
  lopeDepth.gain.value = 0.1;
  lope.connect(lopeDepth);
  lopeDepth.connect(engineGain.gain);

  engine.connect(shaper);
  shaper.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(out);
  engine.start(now);
  lope.start(now);
  engine.stop(end + 0.05);
  lope.stop(end + 0.05);

  // 排氣的低沉噪音 (low exhaust rumble)
  if (starting) {
    noise(1.0, 'lowpass', 260, 180, 0.12, crank + 0.02);
    noise(total - crank - 1.0, 'lowpass', 220, 300, 0.08, crank + 1.0);
  } else {
    noise(1.0, 'lowpass', 220, 120, 0.09);
    // 關車門「碰」(door slam)
    tone(110, 55, 0.18, 'sine', 0.35, 1.2);
    noise(0.12, 'lowpass', 900, 300, 0.25, 1.2);
  }
}

// ===== 擬真槍聲 (realistic gunshots) =====
// 真的槍聲由幾個部分組成，這裡一個一個算出來，再加在一起 (a real gunshot = these parts added together)：
//   1. crack 爆裂聲：子彈超音速飛出的「啪」，只有 1~2 毫秒，非常尖 (supersonic crack, 1~2 ms)
//   2. blast 爆風：火藥氣體衝出槍口的「轟」，是一團很快變小聲、越來越悶的噪音 (muzzle blast: noise that fades and gets duller)
//   3. thump 低音：胸口感受到的「咚」，頻率從高往低掉 (low thump, pitch falling)
//   4. clicks 機械聲：手槍滑套、霰彈槍泵動「喀嚓」、狙擊槍拉槍栓 (mechanical clicks: slide, pump, bolt)
//   5. 回音：在叢林裡的反射，用 ConvolverNode（迴響效果器）做 (jungle echo via a convolution reverb)
// 每把槍只在遊戲開始時算一次，存成 AudioBuffer（一段錄音），之後每次開槍直接播放，
// 播的時候音高隨機偏一點點，連射才不會每一發都一模一樣 (rendered once, replayed with slight pitch variation)
//
// 數值說明 (what the numbers mean)：
//   length：整段聲音幾秒　crack / blast / thump：各部分的大小　*Decay：多快消失（秒，越小越短）
//   blastCutoff：爆風有多「亮」（Hz，越大越尖）　thumpStart → thumpEnd：低音從幾 Hz 掉到幾 Hz
//   drive：失真程度，越大越有衝擊感　clicks：機械聲 [{ 第幾秒, 音高 Hz, 大小 }]
//   volume：播放音量　reverb：回音多寡（遠方的槍回音比較多）
const GUN_PROFILES = {
  // 手槍 9mm：短而清脆的「砰」，後面一聲滑套回彈 (9mm pistol: short sharp bang + slide)
  pistol: { length: 0.4, crack: 1.0, crackDecay: 0.0012, blast: 4, blastCutoff: 3200, blastDecay: 0.022,
    thump: 0.5, thumpStart: 180, thumpEnd: 80, thumpDecay: 0.035, drive: 2.5,
    clicks: [{ time: 0.03, freq: 3200, volume: 0.12 }], volume: 0.8, reverb: 0.28 },
  // 霰彈槍 12 號：又大又悶的「轟」，接著拉泵「喀—嚓」(12-gauge: big boom, then the pump)
  shotgun: { length: 0.8, crack: 1.2, crackDecay: 0.0015, blast: 6, blastCutoff: 1800, blastDecay: 0.09,
    thump: 1.1, thumpStart: 110, thumpEnd: 40, thumpDecay: 0.12, drive: 3,
    clicks: [{ time: 0.36, freq: 1800, volume: 0.35 }, { time: 0.46, freq: 2400, volume: 0.4 }], volume: 1.0, reverb: 0.35 },
  // 衝鋒槍（有消音器）：沒有爆裂聲，只剩「噗」和槍機撞擊的「喀」(suppressed SMG: thwip + bolt clack)
  smg: { length: 0.25, crack: 0.15, crackDecay: 0.0008, blast: 3, blastCutoff: 1100, blastDecay: 0.018,
    thump: 0.3, thumpStart: 200, thumpEnd: 120, thumpDecay: 0.02, drive: 1.5,
    clicks: [{ time: 0.012, freq: 2800, volume: 0.35 }, { time: 0.04, freq: 2200, volume: 0.25 }], volume: 0.6, reverb: 0.1 },
  // 突擊步槍 7.62mm：尖銳的爆裂聲 + 厚實的爆風 (7.62 rifle: sharp crack + full blast)
  rifle: { length: 0.45, crack: 1.4, crackDecay: 0.001, blast: 4.5, blastCutoff: 2600, blastDecay: 0.045,
    thump: 0.8, thumpStart: 150, thumpEnd: 55, thumpDecay: 0.06, drive: 3,
    clicks: [{ time: 0.035, freq: 2400, volume: 0.08 }], volume: 0.85, reverb: 0.3 },
  // 狙擊槍：最大聲的爆裂、很長的回音，最後拉槍栓 (sniper: loudest crack, long echo, bolt action)
  sniper: { length: 1.1, crack: 2.0, crackDecay: 0.0008, blast: 5, blastCutoff: 2200, blastDecay: 0.12,
    thump: 1.2, thumpStart: 100, thumpEnd: 35, thumpDecay: 0.2, drive: 3.5,
    clicks: [{ time: 0.62, freq: 2000, volume: 0.3 }, { time: 0.74, freq: 2600, volume: 0.35 }], volume: 1.0, reverb: 0.55 },
  // 榴彈槍：沒有爆裂聲，空心的「砰」(grenade launcher: hollow thoomp, no crack)
  grenade: { length: 0.5, crack: 0.1, crackDecay: 0.001, blast: 2.5, blastCutoff: 600, blastDecay: 0.05,
    thump: 1.4, thumpStart: 220, thumpEnd: 70, thumpDecay: 0.08, drive: 2,
    clicks: [{ time: 0.02, freq: 1500, volume: 0.2 }], volume: 0.9, reverb: 0.25 },
  // 輕機槍：比步槍更低沉粗重 (LMG: heavier and lower than the rifle)
  lmg: { length: 0.5, crack: 1.2, crackDecay: 0.001, blast: 5, blastCutoff: 2000, blastDecay: 0.06,
    thump: 1.0, thumpStart: 120, thumpEnd: 45, thumpDecay: 0.08, drive: 3,
    clicks: [{ time: 0.03, freq: 1900, volume: 0.1 }], volume: 0.85, reverb: 0.3 },
  // 加特林：每發很短，射速極快時連成「嘶——」的一串 (minigun: very short shots that blur together)
  gatling: { length: 0.2, crack: 0.9, crackDecay: 0.0008, blast: 3.5, blastCutoff: 2400, blastDecay: 0.02,
    thump: 0.5, thumpStart: 160, thumpEnd: 80, thumpDecay: 0.025, drive: 2.5,
    clicks: [], volume: 0.5, reverb: 0.2 },
  // 敵人的步槍：距離比較遠，所以比較悶、比較小聲、回音比較多 (enemy rifle: farther away = duller, quieter, more echo)
  enemyShot: { length: 0.45, crack: 0.5, crackDecay: 0.001, blast: 4, blastCutoff: 1300, blastDecay: 0.05,
    thump: 0.6, thumpStart: 130, thumpEnd: 50, thumpDecay: 0.06, drive: 2.5,
    clicks: [], volume: 0.5, reverb: 0.5 },
  // BOSS 的散彈：低沉的重砲 (boss: heavy, booming spread shot)
  bossShot: { length: 0.7, crack: 0.8, crackDecay: 0.0015, blast: 6, blastCutoff: 1200, blastDecay: 0.1,
    thump: 1.3, thumpStart: 100, thumpEnd: 35, thumpDecay: 0.14, drive: 3,
    clicks: [], volume: 0.7, reverb: 0.45 },
};

const gunBuffers = {};   // 算好的槍聲和機械聲：名稱 → AudioBuffer (rendered gunshots & foley)
let reverb = null;       // 叢林回音效果器 (jungle reverb)

/**
 * 算出所有槍聲，並建立回音效果器；音訊系統建立時呼叫一次 (render all gunshots and build the reverb, once)
 */
function buildGunSounds() {
  reverb = audioCtx.createConvolver();
  reverb.buffer = createReverbImpulse(1.6, 0.35);
  reverb.connect(gunGain);

  for (const name of Object.keys(GUN_PROFILES)) {
    gunBuffers[name] = renderGunshot(GUN_PROFILES[name]);
  }
  for (const name of Object.keys(FOLEY_SOUNDS)) {
    gunBuffers[name] = renderFoley(FOLEY_SOUNDS[name].events);
  }
}

/**
 * 產生「回音的樣本」(impulse response)：一段越來越小聲、越來越悶的噪音。
 * ConvolverNode 會把每個聲音都「套上」這段回音，聽起來就像在戶外有反射 (the shape of the echo every sound gets)
 * @param {number} seconds 回音多長 (echo length)
 * @param {number} decay 回音多快變小聲，秒 (how fast it fades)
 * @returns {AudioBuffer}
 */
function createReverbImpulse(seconds, decay) {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(seconds * rate);
  const impulse = audioCtx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // 越後面的回音越悶：低通濾波的截止頻率隨時間下降 (later reflections are duller)
      const cutoff = 4000 * Math.exp(-t / 0.4) + 300;
      low += (1 - Math.exp(-2 * Math.PI * cutoff / rate)) * ((Math.random() * 2 - 1) - low);
      data[i] = low * Math.exp(-t / decay);
    }
  }
  return impulse;
}

/**
 * 依照 GUN_PROFILES 的一筆設定，逐點算出一段槍聲 (render one gunshot sample by sample)
 * 聲音就是一長串數字（每秒 4 萬多個），每個數字代表喇叭那一刻要推到哪裡 (audio = a long list of speaker positions)
 * @param {object} p GUN_PROFILES 裡的一筆設定 (one profile)
 * @returns {AudioBuffer}
 */
function renderGunshot(p) {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(p.length * rate);
  const buffer = audioCtx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);

  let previousNoise = 0;
  let blastLow = 0;    // 低通濾波器的狀態 (low-pass filter state)
  let phase = 0;       // 低音正弦波的相位 (phase of the thump sine wave)

  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const white = Math.random() * 2 - 1;
    const attack = Math.min(1, t / 0.0006); // 0.6 毫秒內衝到最大，避免「喀」的雜音 (0.6 ms fade-in)

    // 1. 爆裂聲：噪音「這一點減上一點」= 只留下最尖的高頻，而且一下子就消失 (difference of noise = only the sharpest highs)
    const crack = (white - previousNoise) * p.crack * Math.exp(-t / p.crackDecay);
    previousNoise = white;

    // 2. 爆風：低通濾波的噪音，截止頻率隨時間往下掉，所以聲音從「轟」變成悶悶的尾巴 (low-passed noise that gets duller)
    const cutoff = p.blastCutoff * Math.exp(-t / (p.blastDecay * 2)) + 150;
    blastLow += (1 - Math.exp(-2 * Math.PI * cutoff / rate)) * (white - blastLow);
    const blast = blastLow * p.blast * attack * Math.exp(-t / p.blastDecay);

    // 3. 低音：正弦波，頻率從 thumpStart 很快掉到 thumpEnd (a sine whose pitch drops fast)
    const frequency = p.thumpEnd + (p.thumpStart - p.thumpEnd) * Math.exp(-t / 0.02);
    phase += 2 * Math.PI * frequency / rate;
    const thump = Math.sin(phase) * p.thump * attack * Math.exp(-t / p.thumpDecay);

    data[i] = crack + blast + thump;
  }

  // 4. 機械聲 (mechanical clicks)
  for (const click of p.clicks) {
    addClick(data, rate, click.time, click.freq, click.volume);
  }

  // 失真讓聲音更有衝擊感，再把最大音量調整到一樣，每把槍才好比較 (soft clipping for punch, then normalize)
  let peak = 0;
  for (let i = 0; i < length; i++) {
    data[i] = Math.tanh(data[i] * p.drive);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0) {
    for (let i = 0; i < length; i++) data[i] = (data[i] / peak) * 0.95;
  }
  return buffer;
}

/**
 * 在一段聲音裡加上一個金屬「喀」：一小段很短的噪音 + 一點點金屬的嗡聲 (a metallic click: short noise + a ringing tone)
 * @param {Float32Array} data 聲音資料
 * @param {number} rate 取樣率 (sample rate)
 * @param {number} time 在第幾秒 (when)
 * @param {number} frequency 金屬嗡聲的音高 Hz (ring pitch)
 * @param {number} volume 大小
 */
function addClick(data, rate, time, frequency, volume) {
  const start = Math.floor(time * rate);
  const length = Math.floor(0.035 * rate);
  let previousNoise = 0;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const t = j / rate;
    const white = Math.random() * 2 - 1;
    const snap = (white - previousNoise) * 0.5 * Math.exp(-t / 0.003);
    previousNoise = white;
    const ring = Math.sin(2 * Math.PI * frequency * t) * 0.35 * Math.exp(-t / 0.012);
    data[start + j] += (snap + ring) * volume;
  }
}

/**
 * 播放一段算好的槍聲：音高隨機 ±4%，一部分送進回音效果器 (play a rendered gunshot with slight pitch variation and echo)
 * @param {string} name 槍聲名稱
 * @param {AudioBuffer} buffer 算好的聲音
 */
function playGunBuffer(name, buffer) {
  // 槍聲和機械聲的設定放在不同表，兩邊都有 volume 和 reverb (gunshot or foley settings)
  const p = GUN_PROFILES[name] ?? FOLEY_SOUNDS[name];
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = 1 + (Math.random() - 0.5) * 0.08;

  const level = audioCtx.createGain();
  level.gain.value = p.volume;
  source.connect(level);
  level.connect(gunGain);              // 原本的聲音 (dry)

  const send = audioCtx.createGain();
  send.gain.value = p.reverb;
  level.connect(send);
  send.connect(reverb);                // 回音 (wet)

  source.start();
}

// ===== 擬真換彈聲 (realistic reload sounds) =====
// 換彈是一連串的機械動作，每個動作用一種「積木」做出來 (a reload = a sequence of mechanical actions)：
//   click：金屬「喀」（按鈕、卡榫、彈匣卡進去）(metal click: release button, latch, mag seating)
//   slide：摩擦聲（彈匣滑出來、槍機往後拉）(friction: mag sliding out, bolt pulled back)
//   thud：沉悶的「咚」（彈匣撞進槍裡、彈藥箱放上去）(dull knock: mag slapped in, ammo box set down)
//   rack：拉槍機一來一回「喀—嚓」(charging handle back and forward)
//   shell：塞一顆霰彈 (push one shotgun shell in)
// 名稱規則：reloadStart_武器id = 開始換彈時播，reloadDone_武器id = 換完時播 (start / finish of each weapon's reload)
// events 每一筆是 [積木, 第幾秒, ...參數]；click 的參數是 [音高 Hz, 大小]，slide 是 [長度秒, 大小, 音色 Hz]，
// thud / rack / shell 是 [大小] (event format: [type, time, ...params])
const FOLEY_SOUNDS = {
  // 手槍：按彈匣鈕、彈匣滑出 → 新彈匣拍進去、拉滑套上膛 (pistol: drop mag → slap in, rack the slide)
  reloadStart_pistol: { volume: 0.55, reverb: 0.05, events: [['click', 0, 2600, 0.6], ['slide', 0.03, 0.12, 0.5, 1800]] },
  reloadDone_pistol: { volume: 0.6, reverb: 0.05, events: [['thud', 0, 0.7], ['click', 0.012, 3000, 0.5], ['rack', 0.12, 0.8]] },
  // 霰彈槍：一顆一顆塞子彈 → 拉泵上膛 (shotgun: load shells one by one → pump)
  reloadStart_shotgun: { volume: 0.55, reverb: 0.05, events: [['shell', 0.05, 0.7], ['shell', 0.45, 0.7], ['shell', 0.85, 0.7]] },
  reloadDone_shotgun: { volume: 0.65, reverb: 0.05, events: [['shell', 0, 0.6], ['rack', 0.2, 1.2]] },
  // 衝鋒槍：彈匣出 → 彈匣進、拉槍機 (SMG: mag out → mag in, cock)
  reloadStart_smg: { volume: 0.5, reverb: 0.05, events: [['click', 0, 2600, 0.5], ['slide', 0.02, 0.1, 0.5, 1800]] },
  reloadDone_smg: { volume: 0.55, reverb: 0.05, events: [['thud', 0, 0.6], ['click', 0.01, 2800, 0.5], ['rack', 0.15, 0.7]] },
  // 突擊步槍：壓卡榫、彈匣滑出 → 彈匣卡進去、拉槍機 (rifle: release, mag out → rock mag in, charging handle)
  reloadStart_rifle: { volume: 0.55, reverb: 0.05, events: [['click', 0, 2000, 0.6], ['slide', 0.02, 0.16, 0.6, 1400]] },
  reloadDone_rifle: { volume: 0.6, reverb: 0.05, events: [['slide', 0, 0.08, 0.4, 1500], ['thud', 0.08, 0.9], ['click', 0.09, 2400, 0.6], ['rack', 0.25, 1.0]] },
  // 狙擊槍：槍栓往上拉開 → 壓子彈、槍栓推回去鎖上 (sniper: bolt up and back → push round in, bolt forward and down)
  reloadStart_sniper: { volume: 0.55, reverb: 0.05, events: [['click', 0, 1800, 0.6], ['slide', 0.03, 0.14, 0.6, 1200]] },
  reloadDone_sniper: { volume: 0.6, reverb: 0.05, events: [['thud', 0, 0.5], ['click', 0.01, 2200, 0.4], ['slide', 0.12, 0.12, 0.6, 1200], ['click', 0.24, 1900, 0.8]] },
  // 榴彈槍：打開轉輪、倒出彈殼 → 轉輪一格一格轉、關上 (grenade launcher: open drum → ratchet, snap shut)
  reloadStart_grenade: { volume: 0.55, reverb: 0.05, events: [['click', 0, 1500, 0.7], ['slide', 0.02, 0.25, 0.4, 900], ['click', 0.2, 1700, 0.3]] },
  reloadDone_grenade: { volume: 0.6, reverb: 0.05, events: [
    ['click', 0, 2600, 0.35], ['click', 0.06, 2600, 0.35], ['click', 0.12, 2600, 0.35],
    ['click', 0.18, 2600, 0.35], ['click', 0.24, 2600, 0.35], ['click', 0.36, 1400, 0.9]] },
  // 輕機槍：打開供彈蓋、放下彈鏈箱 → 拉彈鏈、蓋子用力蓋上、拉槍機 (LMG: open feed cover → belt in, slam cover, charge)
  reloadStart_lmg: { volume: 0.6, reverb: 0.05, events: [['click', 0, 1300, 0.9], ['slide', 0.03, 0.12, 0.5, 1000], ['thud', 0.15, 0.6]] },
  reloadDone_lmg: { volume: 0.65, reverb: 0.05, events: [['slide', 0, 0.2, 0.5, 1600], ['click', 0.18, 1200, 1.0], ['rack', 0.35, 1.1]] },
  // 加特林：卸下沉重的彈藥箱 → 裝上新箱、扣上卡榫 (minigun: heavy ammo box off → new box on, latches)
  reloadStart_gatling: { volume: 0.6, reverb: 0.05, events: [['thud', 0, 1.0], ['slide', 0.05, 0.2, 0.5, 800]] },
  reloadDone_gatling: { volume: 0.65, reverb: 0.05, events: [['thud', 0, 0.9], ['click', 0.05, 1600, 0.8], ['click', 0.12, 2400, 0.5]] },
  // 沒子彈還扣扳機：撞針空擊的「喀」(dry fire: the hammer clicking on an empty chamber)
  empty: { volume: 0.45, reverb: 0, events: [['click', 0, 3500, 0.5]] },
};

/**
 * 依照一串機械動作，算出一段換彈聲 (render a foley sequence into one sound)
 * @param {Array[]} events FOLEY_SOUNDS 裡的 events
 * @returns {AudioBuffer}
 */
function renderFoley(events) {
  const rate = audioCtx.sampleRate;
  // 總長度 = 最後一個動作的時間 + 0.3 秒餘韻 (length = last event + tail)
  let lastTime = 0;
  for (const event of events) lastTime = Math.max(lastTime, event[1]);
  const length = Math.floor((lastTime + 0.3) * rate);
  const buffer = audioCtx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);

  for (const event of events) {
    const type = event[0];
    const time = event[1];
    if (type === 'click') addClick(data, rate, time, event[2], event[3]);
    else if (type === 'slide') addSlide(data, rate, time, event[2], event[3], event[4]);
    else if (type === 'thud') addThud(data, rate, time, event[2]);
    else if (type === 'rack') addRack(data, rate, time, event[2]);
    else if (type === 'shell') addShell(data, rate, time, event[2]);
  }

  // 輕微失真再調整音量，跟槍聲的做法一樣 (soft clip and normalize, same as gunshots)
  let peak = 0;
  for (let i = 0; i < length; i++) {
    data[i] = Math.tanh(data[i] * 1.5);
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak > 0) {
    for (let i = 0; i < length; i++) data[i] = (data[i] / peak) * 0.9;
  }
  return buffer;
}

/**
 * 摩擦聲：只留中間頻率的噪音，音量先變大再變小，再加一點顆粒感 (friction: band-passed noise, swelling then fading, with grit)
 * 「兩個低通濾波器相減」就是一個簡單的帶通濾波器 (two low-pass filters subtracted = a simple band-pass)
 * @param {Float32Array} data 聲音資料
 * @param {number} rate 取樣率
 * @param {number} time 開始時間（秒）
 * @param {number} duration 長度（秒）
 * @param {number} volume 大小
 * @param {number} center 音色中心頻率 Hz，越高越像金屬、越低越像塑膠 (tone: higher = metal, lower = plastic)
 */
function addSlide(data, rate, time, duration, volume, center) {
  const start = Math.floor(time * rate);
  const length = Math.floor(duration * rate);
  const highCoef = 1 - Math.exp(-2 * Math.PI * center * 1.5 / rate);
  const lowCoef = 1 - Math.exp(-2 * Math.PI * center * 0.5 / rate);
  let high = 0;
  let low = 0;
  let grit = 1;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const white = Math.random() * 2 - 1;
    high += highCoef * (white - high);
    low += lowCoef * (white - low);
    // 每 2 毫秒換一次顆粒大小，聽起來才像金屬刮過去 (change grit every 2 ms for a scraping texture)
    if (j % Math.floor(rate * 0.002) === 0) grit = 0.5 + Math.random() * 0.5;
    const envelope = Math.pow(Math.sin(Math.PI * j / length), 0.7);
    data[start + j] += (high - low) * envelope * grit * volume * 3;
  }
}

/**
 * 沉悶的「咚」：快速往下掉的低音 + 一小段悶悶的噪音 (dull knock: falling low tone + a muffled noise burst)
 */
function addThud(data, rate, time, volume) {
  const start = Math.floor(time * rate);
  const length = Math.floor(0.08 * rate);
  const coef = 1 - Math.exp(-2 * Math.PI * 900 / rate);
  let low = 0;
  let phase = 0;
  for (let j = 0; j < length && start + j < data.length; j++) {
    const t = j / rate;
    const frequency = 60 + 90 * Math.exp(-t / 0.015);
    phase += 2 * Math.PI * frequency / rate;
    low += coef * ((Math.random() * 2 - 1) - low);
    const body = Math.sin(phase) * Math.exp(-t / 0.03);
    const knock = low * 2 * Math.exp(-t / 0.012);
    data[start + j] += (body + knock) * volume;
  }
}

/**
 * 拉槍機「喀—嚓」：往後拉（摩擦 + 喀）、放開彈回去（摩擦 + 更大聲的喀）(charging handle: back, then slam forward)
 */
function addRack(data, rate, time, volume) {
  addSlide(data, rate, time, 0.07, 0.6 * volume, 1500);
  addClick(data, rate, time + 0.07, 1800, 0.7 * volume);
  addSlide(data, rate, time + 0.1, 0.05, 0.5 * volume, 1700);
  addClick(data, rate, time + 0.15, 2500, volume);
}

/**
 * 塞一顆霰彈：彈殼滑進彈倉 + 卡住的「喀」+ 一點點撞擊 (push a shotgun shell in: slide, click, small knock)
 */
function addShell(data, rate, time, volume) {
  addSlide(data, rate, time, 0.06, 0.5 * volume, 1400);
  addClick(data, rate, time + 0.06, 1600, 0.6 * volume);
  addThud(data, rate, time + 0.06, 0.3 * volume);
}

// ===== 背景音樂與環境音 (background music & ambience) =====
// 三種場景 (three scenes)：
//   menu ：叢林戰爭主題曲：戰鼓 + 軍鼓 + 低音弦樂 + 銅管和弦 + 號角旋律，底下墊一點叢林聲 (jungle-war theme)
//   play ：沒有音樂，只有叢林環境音：蟲鳴、風吹樹葉、鳥叫、蟋蟀、青蛙 (jungle ambience only)
//   boss ：叢林環境音 + 低沉緊張的戰鼓 (jungle ambience + tense war drums)
//
// 兩種聲音來源 (two kinds of sound)：
//   1. 一直在響的底層：蟲鳴和風聲，用「循環播放的噪音」做，只需要建立一次，靠音量開關 (looping layers, built once)
//   2. 一個一個排進去的聲音：樂曲的每一拍、隨機的鳥叫蛙鳴，由排程器每 50ms 檢查一次
//      節奏由音訊時鐘決定，不會因為畫面卡頓而忽快忽慢 (scheduled on the audio clock, not on frames)

let musicMode = 'off';   // 'off' | 'menu' | 'play' | 'boss'
let musicStep = 0;       // 目前排到第幾步（十六分音符），主題曲 4 小節 = 64 步 (current 16th-note step)
let nextStepTime = 0;    // 下一步要在音訊時鐘的幾秒播放 (when the next step plays)
let musicTimer = null;
let ambienceGain = null; // 環境音總音量 (ambience volume)

// 隨機環境音下一次出現的時間 (when each random jungle sound happens next)
let nextBirdTime = 0;
let nextCricketTime = 0;
let nextFrogTime = 0;

// 各場景的環境音大小：主選單只墊一點點，遊戲中是主角 (ambience level per scene)
const AMBIENCE_LEVEL = { off: 0, menu: 0.3, play: 1, boss: 0.8 };

/**
 * 切換背景音樂的場景，環境音量會在約半秒內平順地變過去 (switch scene; ambience fades smoothly)
 * @param {string} mode 'off' | 'menu' | 'play' | 'boss'
 */
export function setMusicMode(mode) {
  if (mode !== musicMode) musicStep = 0; // 換場景就從第一拍開始 (restart the loop on a scene change)
  musicMode = mode;
  if (ambienceGain !== null) {
    // setTargetAtTime：音量往目標值「慢慢靠近」，不會突然跳 (glide toward the target level)
    ambienceGain.gain.setTargetAtTime(AMBIENCE_LEVEL[mode] * AUDIO_AMBIENCE_VOLUME, audioCtx.currentTime, 0.3);
  }
}

/**
 * 建立一直在響的叢林底層聲音，並啟動排程器，只會執行一次 (build the looping jungle layers and start the scheduler)
 */
function startMusicScheduler() {
  if (musicTimer !== null) return;

  ambienceGain = audioCtx.createGain();
  ambienceGain.gain.value = AMBIENCE_LEVEL[musicMode] * AUDIO_AMBIENCE_VOLUME;
  ambienceGain.connect(masterGain);
  buildInsectLayer();
  buildWindLayer();

  nextStepTime = audioCtx.currentTime + 0.1;
  nextBirdTime = audioCtx.currentTime + 1;
  nextCricketTime = audioCtx.currentTime + 2;
  nextFrogTime = audioCtx.currentTime + 4;
  musicTimer = setInterval(scheduleMusic, 50);
}

/**
 * 蟲鳴底層：高頻噪音，再用 38 Hz 的振盪器快速開關音量 → 「滋滋滋」的蟬聲；
 * 另一個很慢的振盪器讓整片蟲鳴每幾秒大聲小聲一次 (cicada bed: high noise pulsed at 38 Hz, swelling slowly)
 */
function buildInsectLayer() {
  const source = audioCtx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const band = audioCtx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 5200;
  band.Q.value = 6;

  // 快速開關音量：振盪器的輸出直接接到 gain 參數上 (an oscillator wired into a gain parameter = tremolo)
  const pulse = audioCtx.createGain();
  pulse.gain.value = 0.5;
  const pulseLfo = audioCtx.createOscillator();
  pulseLfo.frequency.value = 38;
  const pulseDepth = audioCtx.createGain();
  pulseDepth.gain.value = 0.5;
  pulseLfo.connect(pulseDepth);
  pulseDepth.connect(pulse.gain);

  // 慢慢起伏：每 7 秒左右一次 (slow swell, about every 7 s)
  const swell = audioCtx.createGain();
  swell.gain.value = 0.12;
  const swellLfo = audioCtx.createOscillator();
  swellLfo.frequency.value = 0.14;
  const swellDepth = audioCtx.createGain();
  swellDepth.gain.value = 0.08;
  swellLfo.connect(swellDepth);
  swellDepth.connect(swell.gain);

  source.connect(band);
  band.connect(pulse);
  pulse.connect(swell);
  swell.connect(ambienceGain);
  source.start();
  pulseLfo.start();
  swellLfo.start();
}

/**
 * 風吹樹葉：低頻噪音，音量很慢地起伏，像一陣一陣的風 (wind in the leaves: low noise with slow gusts)
 */
function buildWindLayer() {
  const source = audioCtx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  source.playbackRate.value = 0.7; // 放慢一點，聲音更低沉 (slower = deeper)

  const low = audioCtx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 650;

  const gust = audioCtx.createGain();
  gust.gain.value = 0.18;
  const gustLfo = audioCtx.createOscillator();
  gustLfo.frequency.value = 0.08;
  const gustDepth = audioCtx.createGain();
  gustDepth.gain.value = 0.12;
  gustLfo.connect(gustDepth);
  gustDepth.connect(gust.gain);

  source.connect(low);
  low.connect(gust);
  gust.connect(ambienceGain);
  source.start();
  gustLfo.start();
}

/**
 * 每 50ms 呼叫一次：把快要輪到的音符和隨機的叢林聲排進去 (schedule upcoming notes and random jungle sounds)
 */
function scheduleMusic() {
  if (audioCtx === null || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;

  // 沒有音樂時，一直把時鐘往前推，下次開始才不會一次補播一大堆 (keep the clock fresh when off)
  if (musicMode === 'off' || muted) {
    nextStepTime = now + 0.1;
    nextBirdTime = Math.max(nextBirdTime, now + 1);
    return;
  }

  // ----- 隨機的叢林聲，主選單少一點 (random jungle sounds; fewer on the menu) -----
  const busy = musicMode === 'menu' ? 0.4 : 1;
  if (now >= nextBirdTime) {
    playBirdCall(randomPan());
    nextBirdTime = now + (2 + Math.random() * 5) / busy;
  }
  if (now >= nextCricketTime) {
    playCrickets(randomPan());
    nextCricketTime = now + (1.5 + Math.random() * 3) / busy;
  }
  if (now >= nextFrogTime) {
    playFrog(randomPan());
    nextFrogTime = now + (4 + Math.random() * 7) / busy;
  }

  // ----- 樂曲：只有主選單和 BOSS 關有 (music: menu and boss only) -----
  if (musicMode === 'play') {
    nextStepTime = now + 0.1;
    return;
  }
  while (nextStepTime < now + 0.2) {
    const delay = nextStepTime - now;
    if (musicMode === 'menu') {
      playThemeStep(musicStep, delay);
    } else {
      playBossDrumStep(musicStep, delay);
    }
    // 一步 = 十六分音符 = 四分之一拍 (one step = a 16th note)
    nextStepTime += 60 / getTempo() / 4;
    musicStep = (musicStep + 1) % 64;
  }
}

/**
 * 目前場景的速度 BPM (tempo of the current scene)
 * @returns {number}
 */
function getTempo() {
  return musicMode === 'boss' ? MUSIC_TEMPO_BOSS : MUSIC_TEMPO_MENU;
}

// ----- 叢林環境音 (jungle sounds) -----

/**
 * 隨機的左右位置，-1 = 最左、1 = 最右，讓叢林聲從四面八方來 (random stereo position)
 * @returns {number}
 */
function randomPan() {
  return Math.random() * 1.6 - 0.8;
}

/**
 * 建立一個「放在左邊或右邊」的輸出，接到環境音音量 (an output placed left/right, feeding the ambience bus)
 * StereoPannerNode：把聲音放到左右聲道的某個位置 (places a sound in the stereo field)
 * @param {number} pan -1 ~ 1
 * @returns {AudioNode}
 */
function pannedOutput(pan) {
  if (!audioCtx.createStereoPanner) return ambienceGain; // 很舊的瀏覽器沒有，就不分左右 (fallback: centered)
  const panner = audioCtx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(ambienceGain);
  return panner;
}

/**
 * 鳥叫：隨機選一種 (bird call, one of three kinds)
 *   口哨：上滑再下滑的幾聲 (whistle)　顫音：很快的高低交替 (trill)　鸚鵡：沙啞的短叫 (parrot squawk)
 */
function playBirdCall(pan) {
  const out = pannedOutput(pan);
  const kind = Math.random();
  if (kind < 0.4) {
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 1800 + Math.random() * 900;
    for (let i = 0; i < notes; i++) {
      tone(base, base * 1.6, 0.09, 'sine', 0.12, i * 0.16, out);
      tone(base * 1.6, base * 1.2, 0.08, 'sine', 0.1, i * 0.16 + 0.08, out);
    }
  } else if (kind < 0.75) {
    const high = 3200 + Math.random() * 800;
    for (let i = 0; i < 10; i++) {
      tone(i % 2 === 0 ? high : high * 0.85, high * 0.9, 0.03, 'sine', 0.08, i * 0.035, out);
    }
  } else {
    noise(0.14, 'bandpass', 900, 1500, 0.18, 0, out);
    tone(700, 1100, 0.14, 'sawtooth', 0.04, 0, out);
    noise(0.12, 'bandpass', 1100, 800, 0.14, 0.2, out);
  }
}

/**
 * 蟋蟀：三聲一組的短「唧唧唧」，重複兩次 (cricket: two groups of three quick chirps)
 */
function playCrickets(pan) {
  const out = pannedOutput(pan);
  const pitch = 4300 + Math.random() * 900;
  for (let group = 0; group < 2; group++) {
    for (let i = 0; i < 3; i++) {
      tone(pitch, pitch, 0.025, 'sine', 0.05, group * 0.4 + i * 0.06, out);
    }
  }
}

/**
 * 青蛙：低沉的「呱—呱」(frog: low croaks)
 */
function playFrog(pan) {
  const out = pannedOutput(pan);
  const croaks = 2 + Math.floor(Math.random() * 2);
  const pitch = 110 + Math.random() * 60;
  for (let i = 0; i < croaks; i++) {
    tone(pitch * 1.3, pitch, 0.09, 'sawtooth', 0.07, i * 0.22, out);
    noise(0.08, 'bandpass', 500, 300, 0.08, i * 0.22, out);
  }
}

// ----- 樂器 (instruments) -----

/**
 * 弦樂 / 銅管音色：兩個稍微走音的鋸齒波疊在一起（比較厚），再經過低通濾波器變溫暖 (two detuned saws through a low-pass = warm strings/brass)
 * @param {number} freq 頻率 Hz
 * @param {number} duration 長度（秒）
 * @param {number} volume 音量
 * @param {number} delay 幾秒後開始
 * @param {number} cutoff 低通濾波頻率，越低越柔、越高越亮 (brightness)
 * @param {number} attack 從無聲到最大音量要幾秒，銅管和弦慢慢湧上來 (fade-in time)
 */
function orchestraNote(freq, duration, volume, delay, cutoff, attack) {
  const start = audioCtx.currentTime + Math.max(0, delay);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  gain.gain.setValueAtTime(volume, start + Math.max(attack, duration - 0.12));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  for (const detune of [-7, 7]) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune; // 單位是「分」，100 分 = 半音 (cents)
    osc.connect(filter);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
  filter.connect(gain);
  gain.connect(musicGain);
}

/**
 * 大戰鼓：很低的「咚」，頻率快速往下掉，再加一點悶悶的皮面聲 (big war drum: deep falling boom + muffled skin)
 */
function warDrum(volume, delay) {
  tone(95, 38, 0.45, 'sine', volume, delay, musicGain);
  noise(0.12, 'lowpass', 400, 120, volume * 0.6, delay, musicGain);
}

/**
 * 中鼓 (mid tom)
 */
function midTom(volume, delay) {
  tone(170, 90, 0.22, 'sine', volume, delay, musicGain);
  noise(0.06, 'lowpass', 900, 300, volume * 0.4, delay, musicGain);
}

/**
 * 軍鼓：響弦的「沙」+ 鼓皮的「答」(military snare: rattle + skin)
 */
function snare(volume, delay) {
  noise(0.13, 'bandpass', 2400, 1600, volume, delay, musicGain);
  tone(200, 140, 0.06, 'triangle', volume * 0.5, delay, musicGain);
}

// ----- 主題曲 (menu theme) -----
// D 小調，和弦進行 Dm → B♭ → C → A，四小節一循環，電影配樂常用的「史詩感」進行 (an "epic" i–VI–VII–V progression)
const D2 = 73.42; // 主音 D 的頻率 Hz (root note D2)
// 每個和弦：根音離 D 幾個半音、三和弦的三個音 (chord root in semitones from D, plus triad intervals)
const THEME_CHORDS = [
  { root: 0, triad: [0, 3, 7] },    // Dm
  { root: -4, triad: [0, 4, 7] },   // B♭
  { root: -2, triad: [0, 4, 7] },   // C
  { root: -5, triad: [0, 4, 7] },   // A
];
// 低音弦樂的跳動音型：每八分音符一個音，數字是離和弦根音幾個半音 (driving string ostinato, 8th notes)
const OSTINATO = [0, 12, 7, 12, 0, 12, 7, 12];
// 號角旋律：[第幾步, 頻率 Hz, 幾步長]，4 小節 = 64 步 (horn melody: step, frequency, length in steps)
const HORN_MELODY = [
  [0, 293.66, 8], [8, 349.23, 4], [12, 440.0, 4],        // D4 — F4 A4
  [16, 466.16, 16],                                      // B♭4（長音）
  [32, 523.25, 8], [40, 440.0, 4], [44, 392.0, 4],       // C5 — A4 G4
  [48, 440.0, 16],                                       // A4（長音，準備回到開頭）
];
// 戰鼓節奏：一小節 16 步裡大鼓、中鼓落在哪幾步 (war drum pattern within a bar)
const DRUM_BIG = [0, 3, 6, 8, 11, 14];
const DRUM_MID = [4, 12, 15];

/**
 * 主題曲的其中一步 (one step of the menu theme)
 * @param {number} step 第幾步 0~63
 * @param {number} delay 幾秒後播放
 */
function playThemeStep(step, delay) {
  const bar = Math.floor(step / 16);
  const beat = step % 16;
  const chord = THEME_CHORDS[bar];
  const secondsPerStep = 60 / MUSIC_TEMPO_MENU / 4;
  const rootFreq = D2 * Math.pow(2, chord.root / 12);

  // 戰鼓與中鼓 (war drums & toms)
  if (DRUM_BIG.includes(beat)) warDrum(beat === 0 ? 0.9 : 0.6, delay);
  if (DRUM_MID.includes(beat)) midTom(0.45, delay);

  // 軍鼓：每小節第 2、4 拍；最後一小節的後半段打滾奏，越打越大聲，帶回開頭 (snare on 2 & 4, a roll at the end of the loop)
  if (beat === 4 || beat === 12) snare(0.4, delay);
  if (bar === 3 && beat >= 8) {
    const rollVolume = 0.12 + (beat - 8) * 0.04;
    snare(rollVolume, delay);
    snare(rollVolume * 0.8, delay + secondsPerStep / 2);
  }

  // 低音弦樂跳動音型：每八分音符一個短音 (string ostinato on every 8th note)
  if (beat % 2 === 0) {
    const semitone = OSTINATO[beat / 2];
    orchestraNote(rootFreq * 2 * Math.pow(2, semitone / 12), secondsPerStep * 1.7, 0.16, delay, 1300, 0.01);
  }

  // 銅管和弦：每小節開頭慢慢湧上來，延續一整小節 (brass chord swelling at the start of each bar)
  if (beat === 0) {
    for (const interval of chord.triad) {
      orchestraNote(rootFreq * 2 * Math.pow(2, interval / 12), secondsPerStep * 16, 0.09, delay, 900, 0.35);
    }
    orchestraNote(rootFreq, secondsPerStep * 16, 0.12, delay, 500, 0.2); // 低音 (bass)
  }

  // 號角旋律 (horn melody)
  for (const [noteStep, freq, length] of HORN_MELODY) {
    if (noteStep === step) {
      orchestraNote(freq, secondsPerStep * length, 0.11, delay, 1800, 0.06);
    }
  }
}

/**
 * BOSS 關：低沉緊張的戰鼓 + 一個持續的低音，沒有旋律 (boss: tense war drums over a low drone, no melody)
 * @param {number} step 第幾步 0~63
 * @param {number} delay 幾秒後播放
 */
function playBossDrumStep(step, delay) {
  const beat = step % 16;
  if (beat === 0 || beat === 3 || beat === 8 || beat === 10) warDrum(0.55, delay);
  if (beat === 6 || beat === 14) midTom(0.3, delay);
  if (beat % 4 === 2) snare(0.08, delay);
  if (step % 32 === 0) {
    const secondsPerStep = 60 / MUSIC_TEMPO_BOSS / 4;
    orchestraNote(D2, secondsPerStep * 32, 0.1, delay, 300, 1.0);                       // 低音 D (low drone)
    orchestraNote(D2 * Math.pow(2, 1 / 12), secondsPerStep * 32, 0.04, delay, 300, 1.5); // 不和諧的半音，製造緊張 (dissonant semitone)
  }
}

// ===== 指揮官的無線電聲 (the commander's voice over the radio) =====
// 指揮官不在現場，是從無線電講話，所以聽到的只有「無線電雜訊」：沙沙聲底下，有一段一段跟著說話節奏起伏的嘈雜訊號，
// 偶爾劈啪一聲，開頭和結尾各有一聲「喀」。聽得出「有人在講話」，但聽不到人聲，字幕才是重點。
// (the commander is on the radio, so all you hear is radio noise: static, with bursts of garbled signal that follow
//  the rhythm of speech, random crackles, and a squelch click at both ends. You can tell someone is talking, the subtitles carry the words.)
// 同一句台詞用同一個亂數種子，所以每次聽起來都一樣 (each line is seeded by its text, so it always sounds the same)

const RADIO_VOICE = {
  pitch: 100,         // 推動訊號頻帶高低的基準（不是真的音高）(base used to move the noise band; not a real pitch)
  pitchRange: 0.3,    // 每段訊號的隨機幅度 (random variation per burst)
  syllable: 0.15,     // 一段訊號（一個音節）大約幾秒 (seconds per burst = syllable)
  wordGap: 0.05,      // 字和字之間的停頓 (pause between words)
  commaPause: 0.2,    // 逗號的停頓 (pause at a comma)
  sentencePause: 0.34, // 句號、驚嘆號、問號的停頓 (pause at the end of a sentence)
  volume: 0.55,
  staticLevel: 0.05,  // 背景沙沙聲 (background hiss)
  crackles: 7,        // 每秒幾次劈啪聲 (crackles per second)
};
// 每段訊號的兩個頻帶（Hz），借用母音的共振峰，讓雜訊有「像說話」的起伏 (two noise bands per burst, borrowed from vowel formants)
const VOWEL_FORMANTS = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [300, 2200, 2950],
  [570, 840, 2410],
  [320, 900, 2240],
  [500, 1500, 2500],
];
let activeRadioVoice = null; // 正在播放的那一句，要停的時候用 (the line playing now, so it can be stopped)

/**
 * 用文字當種子的亂數產生器 (random numbers seeded by the text)
 * @param {string} text
 * @returns {() => number} 每次呼叫回傳 0 ~ 1
 */
function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * 把一句台詞拆成音節的時間表 (turn a line into a timeline of syllables)
 * @param {string} text 台詞
 * @param {() => number} rand 亂數
 * @returns {{syllables: object[], duration: number}}
 */
function planRadioVoice(text, rand) {
  const syllables = [];
  let time = 0.12; // 先讓無線電「喀」一聲 (leave room for the squelch click)
  let sentenceStart = 0;
  const tokens = text.match(/[A-Za-z0-9']+|[,;:]|[.!?]+/g) ?? [];

  // 一句話結束時，算出每個音節在句子裡的位置，用來做「句首高、句尾低」(mark each syllable's place in its sentence)
  const closeSentence = (question, shout) => {
    const count = syllables.length - sentenceStart;
    for (let i = sentenceStart; i < syllables.length; i++) {
      const progress = count > 1 ? (i - sentenceStart) / (count - 1) : 0;
      let contour = 1.14 - 0.26 * progress;                    // 慢慢往下 (declination)
      if (question && progress > 0.7) contour += (progress - 0.7) * 1.2; // 問句尾巴上揚 (questions rise at the end)
      syllables[i].pitch *= contour * (shout ? 1.12 : 1); // 音高拿來推「雜訊的頻帶」(pitch nudges the noise band)
      if (shout) syllables[i].loud *= 1.2;
    }
    sentenceStart = syllables.length;
  };

  for (const token of tokens) {
    if (/^[,;:]$/.test(token)) {
      time += RADIO_VOICE.commaPause;
      continue;
    }
    if (/^[.!?]+$/.test(token)) {
      closeSentence(token.includes('?'), token.includes('!'));
      time += RADIO_VOICE.sentencePause;
      continue;
    }
    // 一個字有幾個音節：數母音群，最多 4 個 (syllables per word = vowel groups, at most 4)
    const count = Math.min(4, Math.max(1, (token.match(/[aeiouy]+/gi) ?? []).length));
    for (let i = 0; i < count; i++) {
      const length = RADIO_VOICE.syllable * (0.7 + rand() * 0.65);
      const stressed = i === 0 && rand() < 0.6;
      syllables.push({
        start: time,
        length,
        vowel: VOWEL_FORMANTS[Math.floor(rand() * VOWEL_FORMANTS.length)],
        pitch: RADIO_VOICE.pitch * (1 + (rand() - 0.5) * RADIO_VOICE.pitchRange) * (stressed ? 1.1 : 1),
        loud: (stressed ? 1 : 0.75) * (0.85 + rand() * 0.3),
              });
      time += length + 0.012;
    }
    time += RADIO_VOICE.wordGap * (0.6 + rand() * 0.8);
  }
  closeSentence(false, false);
  return { syllables, duration: time + 0.1 };
}

/**
 * 播放指揮官的一句無線電通話（只有雜訊）(play one line of the commander's radio transmission: noise only)
 * @param {string} text 台詞（決定長短、停頓和起伏）(the line: sets the length, pauses and rhythm)
 */
export function playRadioVoice(text) {
  if (audioCtx === null || muted) return;
  stopRadioVoice();
  const rand = seededRandom(text);
  const plan = planRadioVoice(text, rand);
  if (plan.syllables.length === 0) return;
  const now = audioCtx.currentTime + 0.03;
  const end = now + plan.duration;

  // ----- 輸出：無線電濾波 → 一點破音 → 音量 (output: radio band-pass → slight distortion → volume) -----
  const lineGain = audioCtx.createGain();
  lineGain.gain.value = RADIO_VOICE.volume;
  lineGain.connect(sfxGain);
  const shaper = audioCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.5) / Math.tanh(2.5);
  }
  shaper.curve = curve;
  shaper.connect(lineGain);
  const radioHigh = audioCtx.createBiquadFilter();
  radioHigh.type = 'highpass';
  radioHigh.frequency.value = 400;
  radioHigh.connect(shaper);
  const radioLow = audioCtx.createBiquadFilter();
  radioLow.type = 'lowpass';
  radioLow.frequency.value = 3000;
  radioLow.connect(radioHigh);

  const sources = [];
  const makeNoise = () => {
    const source = audioCtx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    source.loopStart = rand();          // 每條從不同位置開始，聽起來才不會一樣 (start each at a different spot)
    sources.push(source);
    return source;
  };

  // ----- 訊號：跟著說話節奏起伏的雜訊，兩個會移動的頻帶 (signal: speech-rhythm noise through two moving bands) -----
  const signal = makeNoise();
  const signalGain = audioCtx.createGain();
  signalGain.gain.value = 0;
  const bands = [];
  const bandGains = [1.4, 0.9];
  for (let f = 0; f < 2; f++) {
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.5;
    filter.frequency.value = plan.syllables[0].vowel[f];
    const gain = audioCtx.createGain();
    gain.gain.value = bandGains[f];
    signal.connect(filter);
    filter.connect(gain);
    gain.connect(signalGain);
    bands.push(filter);
  }
  signalGain.connect(radioLow);

  // ----- 背景沙沙聲、開頭和結尾的「喀」(background static, squelch clicks) -----
  const hiss = makeNoise();
  const hissFilter = audioCtx.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.value = 1900;
  hissFilter.Q.value = 0.6;
  const hissGain = audioCtx.createGain();
  hissGain.gain.setValueAtTime(0, now);
  hissGain.gain.linearRampToValueAtTime(0.45, now + 0.005);   // 開頭「喀」(opening click)
  hissGain.gain.exponentialRampToValueAtTime(RADIO_VOICE.staticLevel, now + 0.09);
  hissGain.gain.setValueAtTime(RADIO_VOICE.staticLevel, end - 0.1);
  hissGain.gain.linearRampToValueAtTime(0.4, end - 0.095);    // 結尾「喀」(closing click)
  hissGain.gain.exponentialRampToValueAtTime(0.0001, end);
  hiss.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(radioHigh);

  // ----- 劈啪聲：隨機的短爆音 (crackles: random short pops) -----
  const crackle = makeNoise();
  const crackleFilter = audioCtx.createBiquadFilter();
  crackleFilter.type = 'highpass';
  crackleFilter.frequency.value = 2500;
  const crackleGain = audioCtx.createGain();
  crackleGain.gain.value = 0;
  crackle.connect(crackleFilter);
  crackleFilter.connect(crackleGain);
  crackleGain.connect(radioHigh);
  const crackleCount = Math.floor(plan.duration * RADIO_VOICE.crackles);
  const crackleTimes = [];
  for (let i = 0; i < crackleCount; i++) crackleTimes.push(0.1 + rand() * (plan.duration - 0.25));
  crackleTimes.sort((a, b) => a - b);
  let lastCrackle = -1;
  for (const t of crackleTimes) {
    if (t - lastCrackle < 0.03) continue;
    lastCrackle = t;
    const at = now + t;
    crackleGain.gain.setValueAtTime(0, at);
    crackleGain.gain.linearRampToValueAtTime(0.15 + rand() * 0.2, at + 0.002);
    crackleGain.gain.linearRampToValueAtTime(0, at + 0.006 + rand() * 0.012);
  }

  // ----- 依時間表排好每段訊號 (schedule each burst) -----
  for (const syllable of plan.syllables) {
    const start = now + syllable.start;
    const attack = Math.min(0.025, syllable.length * 0.2);
    const level = 0.6 * syllable.loud;
    const shift = syllable.pitch / RADIO_VOICE.pitch; // 「音高」把頻帶往上或往下推 (the pitch pushes the bands up or down)
    for (let f = 0; f < 2; f++) {
      bands[f].frequency.setTargetAtTime(syllable.vowel[f] * shift, start, 0.02);
    }
    signalGain.gain.setValueAtTime(0, start);
    signalGain.gain.linearRampToValueAtTime(level, start + attack);
    // 中間抖一下，像訊號不穩 (a wobble in the middle, like an unstable signal)
    signalGain.gain.linearRampToValueAtTime(level * (0.45 + rand() * 0.4), start + syllable.length * 0.45);
    signalGain.gain.linearRampToValueAtTime(level * 0.8, start + syllable.length * 0.7);
    signalGain.gain.linearRampToValueAtTime(0, start + syllable.length);
  }

  for (const source of sources) {
    source.start(now, source.loopStart);
    source.stop(end + 0.05);
  }
  activeRadioVoice = { lineGain, sources };
  signal.onended = () => {
    lineGain.disconnect();
    if (activeRadioVoice !== null && activeRadioVoice.lineGain === lineGain) activeRadioVoice = null;
  };
}

/**
 * 停止目前的無線電通話（跳過或換下一句時）(stop the current radio line, e.g. on skip or next line)
 */
export function stopRadioVoice() {
  if (activeRadioVoice === null || audioCtx === null) return;
  const { lineGain, sources } = activeRadioVoice;
  activeRadioVoice = null;
  const now = audioCtx.currentTime;
  lineGain.gain.cancelScheduledValues(now);
  lineGain.gain.setValueAtTime(lineGain.gain.value, now);
  lineGain.gain.linearRampToValueAtTime(0, now + 0.04);
  for (const source of sources) {
    try {
      source.stop(now + 0.05);
    } catch {
      // 已經停了就算了 (already stopped)
    }
  }
}
