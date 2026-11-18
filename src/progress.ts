/**
 * progress.ts — 跨课程、跨天的学习进度持久化。
 *
 * 与 lesson.ts 的分工：
 *   lesson.ts   存"今天的课程包"（家长导入的 JSON）
 *   progress.ts 存"孩子的学习档案"——每个单词的熟练度、错词、复习到期时间、
 *               每日学习记录、连续天数。两者都用 localStorage，但 key 不同，
 *               导入新课后学习档案不丢失。
 *
 * 间隔复习采用简化的 SM-2 / Leitner 盒子：
 *   答对 → 熟练度 +1，复习间隔按 1天/2天/4天/7天/15天 递增
 *   答错 → 熟练度 -1，进入错词本，并安排 10 分钟后短期重试
 */

/** 单个单词的学习记录（用 word 文本作为全局唯一 key） */
export interface WordProgress {
  word: string;
  emoji: string;
  zh: string;
  /** 熟练度等级 0~5，>=3 视为已掌握 */
  level: number;
  /** 累计答对次数（跨天） */
  correct: number;
  /** 累计答错次数（跨天） */
  wrong: number;
  /** 跟读识别通过次数 */
  spoken: number;
  /** 预习次数 */
  previewed: number;
  /** 下次该复习的时间戳 ms；到期后该词会重新进入 quiz */
  dueAt: number;
  /** 上次复习时间戳 ms */
  lastAt: number;
}

/** 某一天的学习小结 */
export interface DayStat {
  date: string;
  /** 当天新预习的词数 */
  previewed: number;
  /** 当天 quiz 答题数 */
  answered: number;
  /** 当天答对数 */
  correct: number;
  /** 当天跟读通过数 */
  spoken: number;
}

export interface ProgressData {
  version: 1;
  words: Record<string, WordProgress>;
  days: Record<string, DayStat>;
  /** 连续学习天数 */
  streak: number;
  /** 最近一次学习日期 YYYY-MM-DD */
  lastDay: string;
  /** 首次使用日期 */
  firstDay: string;
}

const STORAGE_KEY = "a-little-step.progress";
const DAY_MS = 24 * 60 * 60 * 1000;
/** 答对后，按新的 level 决定间隔（天） */
const INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30];
/** 答错后短期重试间隔 */
const RETRY_MS = 10 * 60 * 1000;

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayDiff(a: string, b: string): number {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / DAY_MS);
}

function emptyData(): ProgressData {
  const t = today();
  return { version: 1, words: {}, days: {}, streak: 0, lastDay: "", firstDay: t };
}

/** 读取学习档案；坏数据/旧版本安全回退为空 */
export function loadProgress(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const data = JSON.parse(raw) as ProgressData;
    if (data.version !== 1 || typeof data.words !== "object" || typeof data.days !== "object") {
      return emptyData();
    }
    return data;
  } catch {
    return emptyData();
  }
}

export function saveProgress(data: ProgressData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* 存储不可用（隐私模式/配额满）时静默降级，不影响游戏 */
  }
}

/** 标记"今天来学了"，更新连续天数与当日记录槽。返回是否跨天（当天首次） */
export function touchToday(data: ProgressData): DayStat {
  const t = today();
  if (!data.days[t]) data.days[t] = { date: t, previewed: 0, answered: 0, correct: 0, spoken: 0 };
  if (data.lastDay !== t) {
    const diff = data.lastDay ? dayDiff(data.lastDay, t) : 999;
    data.streak = diff === 1 ? data.streak + 1 : 1;
    data.lastDay = t;
    saveProgress(data);
  }
  // 只保留最近 60 天，避免无限膨胀
  const keys = Object.keys(data.days).sort();
  while (keys.length > 60) delete data.days[keys.shift()!];
  return data.days[t];
}

/** 确保课程里的词都在档案里建了档（不覆盖已有进度） */
export function ensureWords(
  data: ProgressData,
  words: Array<{ word: string; emoji: string; zh: string }>
): void {
  let dirty = false;
  for (const w of words) {
    if (!w.word || data.words[w.word]) continue;
    data.words[w.word] = {
      word: w.word,
      emoji: w.emoji,
      zh: w.zh,
      level: 0,
      correct: 0,
      wrong: 0,
      spoken: 0,
      previewed: 0,
      dueAt: 0,
      lastAt: 0,
    };
    dirty = true;
  }
  if (dirty) saveProgress(data);
}

function bump(data: ProgressData, word: string, fn: (p: WordProgress, stat: DayStat) => void): void {
  const stat = touchToday(data);
  const p = data.words[word];
  if (p) fn(p, stat);
  saveProgress(data);
}

/** 预习了一个词 */
export function recordPreview(data: ProgressData, word: string): void {
  bump(data, word, (p, s) => {
    p.previewed++;
    s.previewed++;
  });
}

/** quiz 答对：熟练度 +1，安排递增间隔；level>=3 视为掌握 */
export function recordCorrect(data: ProgressData, word: string): void {
  bump(data, word, (p, s) => {
    p.correct++;
    p.level = Math.min(5, p.level + 1);
    p.lastAt = Date.now();
    const days = INTERVAL_DAYS[Math.min(p.level, INTERVAL_DAYS.length - 1)];
    p.dueAt = Date.now() + days * DAY_MS;
    s.answered++;
    s.correct++;
  });
}

/** quiz 答错：进入错词本，熟练度 -1，安排短期重试 */
export function recordWrong(data: ProgressData, word: string): void {
  bump(data, word, (p, s) => {
    p.wrong++;
    p.level = Math.max(0, p.level - 1);
    p.lastAt = Date.now();
    p.dueAt = Date.now() + RETRY_MS;
    s.answered++;
  });
}

/** 跟读识别通过 */
export function recordSpoken(data: ProgressData, word: string): void {
  bump(data, word, (p, s) => {
    p.spoken++;
    s.spoken++;
  });
}

/** 已掌握（熟练度 >=3）的单词数 */
export function masteredCount(data: ProgressData): number {
  return Object.values(data.words).filter((w) => w.level >= 3).length;
}

/** 错词本：答错过且尚未掌握的词，按错次降序 */
export function wrongWords(data: ProgressData): WordProgress[] {
  return Object.values(data.words)
    .filter((w) => w.wrong > 0 && w.level < 3)
    .sort((a, b) => b.wrong - a.wrong || a.word.localeCompare(b.word));
}

/** 当前到期、需要复习的词（错词优先） */
export function dueWords(data: ProgressData, limit = 4): WordProgress[] {
  const now = Date.now();
  return Object.values(data.words)
    .filter((w) => w.lastAt > 0 && w.dueAt <= now && w.level < 5)
    .sort((a, b) => b.wrong - a.wrong || a.dueAt - b.dueAt)
    .slice(0, limit);
}

/** 今日小结（只读，不写入——避免"清空档案"后被报告页立即重建） */
export function todayStat(data: ProgressData): DayStat {
  const t = today();
  return data.days[t] ?? { date: t, previewed: 0, answered: 0, correct: 0, spoken: 0 };
}

/** 最近 N 天的活跃日期（用于报告里的"最近学习"） */
export function recentDays(data: ProgressData, n = 7): DayStat[] {
  const out: DayStat[] = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * DAY_MS);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(data.days[key] ?? { date: key, previewed: 0, answered: 0, correct: 0, spoken: 0 });
  }
  return out;
}

/** 清空全部学习档案（家长面板"重置进度"用） */
export function clearProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
