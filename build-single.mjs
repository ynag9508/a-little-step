// 把 dist 构建产物打包成单个自包含 index.html：
// 内联 CSS + JS，移除一切外部/子资源请求，适配 sharecode 鉴权的静态托管。
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const outDir = path.resolve("../a-little-step-site");
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");

// 1) 内联 CSS
const cssMatch = html.match(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/);
if (!cssMatch) throw new Error("未找到 CSS 引用");
const cssPath = path.join(dist, cssMatch[1].replace(/^\//, ""));
const css = fs.readFileSync(cssPath, "utf8");
html = html.replace(cssMatch[0], () => `<style>${css}</style>`);

// 2) 内联 JS（module 脚本内联后 type=module 保留即可）
const jsMatch = html.match(/<script type="module"[^>]*src="([^"]+\.js)"[^>]*><\/script>/);
if (!jsMatch) throw new Error("未找到 JS 引用");
const jsPath = path.join(dist, jsMatch[1].replace(/^\//, ""));
const js = fs.readFileSync(jsPath, "utf8");
// 防止 JS 内容里出现 </script> 提前闭合
// 注意：replace 的替换值必须用函数返回，否则 js 里的 $& / $' / $` 等序列会被
// 当成特殊替换模式，把 HTML 片段插进脚本，导致 JS 语法错误完全不执行。
const jsSafe = js.replace(/<\/script/gi, () => "<\\/script");
html = html.replace(jsMatch[0], () => `<script type="module">${jsSafe}</script>`);

// 3) 移除 Google Fonts 外链（会被网络环境拦截，降级到系统字体；视觉基本一致）
html = html.replace(/<link rel="preconnect"[^>]*>/g, "");
html = html.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/g, "");

fs.mkdirSync(outDir, { recursive: true });
// 清空旧产物
for (const f of fs.readdirSync(outDir)) {
  fs.rmSync(path.join(outDir, f), { recursive: true, force: true });
}
fs.writeFileSync(path.join(outDir, "index.html"), html);
console.log(`单文件生成成功: ${path.join(outDir, "index.html")} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
console.log("剩余外部引用检查:", (html.match(/(?:src|href)="(?!data:)[^"]+"/g) || []));
