import { playRadioVoice, stopRadioVoice } from './audio.js';

// 指揮官的聲音：他是從無線電講話，所以只播 audio.js 合成的「無線電雜訊」，跟著說話的節奏起伏，字幕才是重點。
// (the commander talks over the radio, so we only play the radio noise synthesized in audio.js, following the rhythm of speech;
//  the subtitles carry the words)
// 卡車機槍手不出聲，只有頭上的對話框。(the truck gunner is silent: speech bubbles only)

/**
 * 能不能說話：合成的聲音在任何支援 Web Audio 的瀏覽器都能用 (the radio noise works anywhere Web Audio does)
 * @returns {boolean}
 */
export function canSpeak() {
  return true;
}

/**
 * 指揮官說一句話（無線電雜訊）；靜音時不出聲 (the commander says a line as radio noise; silent when muted)
 * @param {string} text 台詞
 */
export function speakAsCommander(text) {
  playRadioVoice(text);
}

/**
 * 停止說話（換下一句或跳過時）(stop talking, e.g. on the next line or skip)
 */
export function stopSpeaking() {
  stopRadioVoice();
}
