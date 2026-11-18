/**
 * settings.ts — 家长可配置项（用眼休息间隔、是否隐藏中文释义）。
 * 单独一个 localStorage key，与课程包/学习档案解耦。
 */

export interface Settings {
  /** 每隔多少分钟提醒休息眼睛 */
  restMinutes: number;
  /** 练习时隐藏中文释义，鼓励"图→音→义"直接连接 */
  hideZh: boolean;
}

const STORAGE_KEY = "a-little-step.settings";
const DEFAULT: Settings = { restMinutes: 15, hideZh: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const data = JSON.parse(raw) as Partial<Settings>;
    return {
      restMinutes:
        typeof data.restMinutes === "number" && data.restMinutes >= 3 && data.restMinutes <= 60
          ? data.restMinutes
          : DEFAULT.restMinutes,
      hideZh: typeof data.hideZh === "boolean" ? data.hideZh : DEFAULT.hideZh,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式等场景静默降级 */
  }
}
