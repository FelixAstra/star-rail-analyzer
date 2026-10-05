#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// 视图字段契约：core/analyze.js 导出的字段 ⊇ web 组件模板实际读取的字段
//
// 为什么需要它（2026-10-05）：
//   分析页「五星角色 × 专属光锥」卡模板走的是 srcTx(c.srcKeys)，而 U5C_VIEW
//   当初漏带了 srcKeys → 模板拿到 undefined → srcTx 兜底成「截图补录」，
//   39 张角色卡的「数据来源」被整体标错 —— 而且**看着完全像真的**。
//
//   这类 bug 的共同形态是「模板读了一个视图没导出的字段」。两边（analyze.js 与
//   组件模板）都在仓库里，不依赖 data/ 或 assets/，所以能在 CI 的干净环境里查；
//   本机有没有数据都拦得住。
//
// 做法：
//   ① 从 core/analyze.js 解析 U5C_VIEW / U5L_VIEW 的顶层字段名
//   ② 从 web/components/analysis.js 的 PairGrid / ConeGrid 组件里，抓模板读到的
//      字段（模板里 c → u5c 条目，x → u5l 条目）
//   ③ 断言 ② ⊆ ①
//
// ⚠️ 解析走的是源码文本（项目零依赖，不引 AST 库），所以加了「提取数量下限」
//    自检：一旦解析失效（源码格式变了），本项会**报错**而不是静默通过。
//
// 用法：node tools/verify-view-contract.js
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (cond, msg, extra) => {
  if (cond) { pass++; return true; }
  fail++;
  console.log('  ✗ ' + msg + (extra != null ? '  → ' + extra : ''));
  return false;
};

// ① 解析 `const <viewName> = <X>.map(... => { return { ... }; });` 的顶层字段
function viewKeys(src, viewName) {
  const m = src.match(new RegExp('const ' + viewName + ' = [A-Za-z_$][\\w$]*\\.map\\([\\s\\S]*?\\n  \\}\\);'));
  if (!m) return null;
  const body = m[0];
  const at = body.indexOf('return {');
  if (at < 0) return null;
  const keys = [];
  for (const line of body.slice(at).split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('return')) continue;
    for (const seg of t.split(',')) {
      const s2 = seg.trim();
      if (!s2) continue;
      // 支持 ES6 简写属性（如 `lcId,` / `isStd,`）：没有冒号，整段就是字段名
      const k = /^[A-Za-z_$][\w$]*$/.test(s2) ? s2 : (s2.match(/^([A-Za-z_$][\w$]*)\s*:/) || [])[1];
      if (k) keys.push(k);
    }
  }
  return keys;
}

// ② 取组件对象切片：`W.<name> = {` → 行首「两空格 + };」
function sliceComponent(src, name) {
  const start = src.indexOf('W.' + name + ' = {');
  if (start < 0) return null;
  const end = src.indexOf('\n  };', start);
  if (end < 0) return null;
  return src.slice(start, end);
}
function compFields(src, name, v) {
  const body = sliceComponent(src, name);
  if (!body) return null;
  const re = new RegExp('\\b' + v + '\\.([A-Za-z_$][\\w$]*)', 'g');
  const set = new Set();
  let m;
  while ((m = re.exec(body))) set.add(m[1]);
  return set;
}

const analyzeSrc = fs.readFileSync(path.join(ROOT, 'core/analyze.js'), 'utf8');
const webSrc = fs.readFileSync(path.join(ROOT, 'web/components/analysis.js'), 'utf8');

// min = 字段数量下限，用来发现「解析静默失效」
const SPECS = [
  { view: 'U5C_VIEW', comp: 'PairGrid', v: 'c', min: 15 },
  { view: 'U5L_VIEW', comp: 'ConeGrid', v: 'x', min: 8 },
];

console.log('视图字段契约（core/analyze.js ← web/components/analysis.js）');
for (const s of SPECS) {
  console.log('\n· ' + s.comp + '  →  ' + s.view);
  const have = viewKeys(analyzeSrc, s.view);
  const need = compFields(webSrc, s.comp, s.v);

  ok(!!have && have.length >= s.min,
    'core/analyze.js 里解析出 ' + s.view + ' 的字段（≥' + s.min + ' 个）',
    have ? '只解析出 ' + have.length + ' 个，格式可能变了' : '解析失败，格式可能变了');
  ok(!!need && need.size > 0,
    'web/components/analysis.js 里解析出 ' + s.comp + ' 模板读取的字段',
    need ? need.size + ' 个' : '解析失败');
  if (!have || !need) continue;

  const has = new Set(have);
  const missing = [...need].filter(f => !has.has(f)).sort();
  ok(missing.length === 0,
    s.comp + ' 模板读取的 ' + need.size + ' 个字段都已被 ' + s.view + ' 导出（共 ' + have.length + ' 个）',
    missing.length ? '漏导出：' + missing.join('、') : '');
  console.log('  · 模板用 ' + need.size + ' 个 · 视图导出 ' + have.length + ' 个');
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 项通过' + (fail ? '，' + fail + ' 项失败' : '，0 项失败'));
process.exitCode = fail ? 1 : 0;
