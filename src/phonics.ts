/**
 * phonics.ts — 轻量自然拼读提示（不依赖额外数据）。
 *
 * 4-6 岁是音素意识敏感期。这里用最简单的 onset-rime（首音+韵脚）拆分：
 *   bear → "b" + "ear"，并给出可朗读的拼读串 "b... bear"。
 * 不追求语言学精确（辅音丛/元音组合仅作近似），目的是建立"字母—声音"的连接感。
 */

export interface PhonicsHint {
  /** 首音字母（近似，取首个字母） */
  onset: string;
  /** 剩余部分（韵脚） */
  rime: string;
  /** 展示用：b + ear */
  display: string;
  /** 朗读用：慢速字母名 + 完整词，例如 "b... bear" */
  speak: string;
}

/** 把单词拆成首音+韵脚，生成拼读提示 */
export function phonicsOf(word: string): PhonicsHint {
  const w = word.trim();
  if (w.length <= 1) {
    return { onset: w, rime: "", display: w, speak: w };
  }
  const onset = w[0];
  const rime = w.slice(1);
  return {
    onset,
    rime,
    display: `${onset} + ${rime}`,
    speak: `${onset}... ${w}`,
  };
}

/** 难度排序：短词优先、同长按字母序（4-6 岁短词通常更具体更易认） */
export function byDifficulty(a: { word: string }, b: { word: string }): number {
  const la = a.word.replace(/[^a-z]/gi, "").length;
  const lb = b.word.replace(/[^a-z]/gi, "").length;
  return la - lb || a.word.localeCompare(b.word);
}
