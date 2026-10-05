#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// core/roster.json 生成器
//
// 为什么需要它：
//   「专属光锥表」（core/pools.js 的 SIG）是**手工维护**的。新角色上线时漏登记，
//   页面会把它显示成「专属光锥未获得」—— 看着像真数据，其实是配错表
//   （2026-10-05 真珠）。verify-dashboard ⑨ 节能查出来，但它要读
//   assets/index/（米哈游解包索引，因版权不随仓库分发），CI 里没有 →
//   断言只能「跳过」，等于没拦。于是把一个只会静默空转的断言误当成防线。
//
//   这里把「校验所需的最小事实」——5★ 角色与 5★ 光锥的 id / 名称 / 命途 ——
//   抽成 core/roster.json 入库。它是纯事实数据（不是美术素材、不含立绘），
//   给 CI 当校验基准，让 ⑨ 节在干净环境里也能真校验。
//
// 什么时候要重跑：
//   游戏出新 5★ 角色 / 光锥之后（本地 assets/index 已更新）。重跑本脚本，
//   再跑 node tools/verify-dashboard.js —— 新角色若漏了 SIG，会直接报出来。
//   （本机跑 verify 时若检测到索引比名册新，⑨ 节也会提示你重跑。）
//
// 用法：node tools/build-roster.js [--force]
//   --force  即使名册会「缩水」也照写（默认保护：条目变少时拒绝，防误删）
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const FORCE = process.argv.includes('--force');
const IDX = path.join(ROOT, 'assets/index');
const OUT = path.join(ROOT, 'core/roster.json');

const readJSON = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; } };

const CH = readJSON(path.join(IDX, 'cn_characters.json'), null);
const LC = readJSON(path.join(IDX, 'cn_light_cones.json'), null);
if (!CH || !LC) {
  console.error('✗ 找不到 assets/index/cn_characters.json 或 cn_light_cones.json。');
  console.error('  名册是从本地解包索引生成的（索引因版权不随仓库分发）。');
  console.error('  请先把索引放到 assets/index/ 再重跑。');
  process.exit(1);
}

const byId = (a, b) => String(a.id).localeCompare(String(b.id));
const brief = x => ({ id: String(x.id), name: x.name, path: x.path });

// 5★ 角色：排除开拓者（8001~8010，各命途一份，本来就没有专属光锥）
const chars = Object.entries(CH)
  .map(([id, v]) => Object.assign({ id }, v))
  .filter(x => x.rarity === 5 && !/^80/.test(x.id))
  .map(brief).sort(byId);

// 5★ 光锥（常驻 7 张 + 各角色专属，都在内）
const cones = Object.entries(LC)
  .map(([id, v]) => Object.assign({ id }, v))
  .filter(x => x.rarity === 5)
  .map(brief).sort(byId);

const prev = readJSON(OUT, null);
if (prev && Array.isArray(prev.chars)) {
  const shrink = prev.chars.filter(p => !chars.some(c => c.id === p.id));
  if (shrink.length && !FORCE) {
    console.error('✗ 名册会少掉 ' + shrink.length + ' 个角色：' + shrink.map(x => x.id + ' ' + x.name).join('、'));
    console.error('  这通常是索引不全或解析出错，不是真的下架。确认无误请加 --force。');
    process.exit(1);
  }
  const added = chars.filter(c => !prev.chars.some(p => p.id === c.id));
  if (added.length) console.log('  + 新增 ' + added.length + ' 位 5★ 角色：' + added.map(x => x.name).join('、'));
}

const doc = {
  _note: '由 tools/build-roster.js 生成，勿手改。仅为「专属光锥表覆盖校验」提供最小事实数据'
    + '（5★ 角色 / 光锥的 id、名称、命途），让 CI 在没有 assets/index（版权数据）时也能真校验。'
    + '游戏出新 5★ 后请重跑本脚本并跑 node tools/verify-dashboard.js。',
  chars,
  cones,
};

fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
console.log('✓ 写入 core/roster.json：' + chars.length + ' 位 5★ 角色 · ' + cones.length + ' 张 5★ 光锥');
