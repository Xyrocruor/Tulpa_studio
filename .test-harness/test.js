/* 筑灵 · Tulpa Studio — jsdom 端到端冒烟测试 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SINGLE = !!process.env.TULPA_HTML; // 单文件模式：脚本已内联，由 jsdom 直接执行
const html = fs.readFileSync(process.env.TULPA_HTML || path.join(ROOT, 'index.html'), 'utf8');
const dataJs = SINGLE ? '' : fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8');
const appJs = SINGLE ? '' : fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // 环境垫片
    window.scrollTo = () => {};
    window.URL.createObjectURL = () => 'blob:fake';
    window.URL.revokeObjectURL = () => {};
    if (!SINGLE) window.eval(dataJs + '\n' + appJs);
  }
});

const { window } = dom;
const { document } = window;

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra || '' });
  process.stdout.write((cond ? 'ok  ' : 'FAIL') + ' ' + name + '\n');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const click = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error('missing element: ' + sel);
  el.click();
};
const setVal = (sel, v) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error('missing element: ' + sel);
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const routeTo = (hash) => {
  window.location.hash = hash;
  window.dispatchEvent(new window.Event('hashchange'));
};

(async () => {
  await sleep(120);

  // ---- 1. 初始渲染：仪表盘 ----
  check('stars rendered (130)', document.querySelectorAll('#stars i').length === 130);
  check('dashboard active', document.body.dataset.view === 'dashboard');
  check('welcome hero shown', document.getElementById('dashContent').textContent.includes('欢迎来到你的创造之旅'));
  check('nav has 6 links', document.querySelectorAll('#nav a').length === 6);
  check('stage pill exists', !!document.getElementById('stagePill'));
  check('today habits count', document.querySelectorAll('#habits .habit').length === 4);
  check('data buttons', !!document.getElementById('btnExport') && !!document.getElementById('btnImport'));

  // ---- 2. 快速起名向导 ----
  click('#btnQuickStart');
  await sleep(50);
  check('quick-start modal opens', !!document.getElementById('qsName'));
  setVal('#qsName', '星尘');
  setVal('#qsHost', '阿澈');
  click('.modal-btns .btn[data-i="1"]');
  await sleep(80);
  const saved = JSON.parse(window.localStorage.getItem('tulpaStudio.v1'));
  check('profile saved', saved.profile.tulpaName === '星尘' && saved.profile.hostName === '阿澈');
  check('greeting hero shows name', document.getElementById('dashContent').textContent.includes('星尘'));

  // ---- 3. 打卡与每日一句 ----
  click('#habits .habit[data-habit="active"]');
  await sleep(30);
  check('habit toggled on', document.querySelector('#habits .habit[data-habit="active"]').classList.contains('on'));
  click('#tipRefresh');

  // ---- 4. 设计工作室 ----
  routeTo('studio');
  await sleep(50);
  check('studio head shows name', document.getElementById('studioContent').textContent.includes('星尘'));
  check('studio has 6 tabs', document.querySelectorAll('.stab').length === 6);
  // 基础 tab：填名字含义
  setVal('#studioPanel textarea[data-bind="profile.form.symbol"]', '生于星尘，归于星尘。');
  await sleep(30);
  check('form.symbol saved', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).profile.form.symbol.includes('星尘'));
  // 切到性格 tab
  click('.stab[data-stab="traits"]');
  await sleep(40);
  const traitCount = document.querySelectorAll('#traitGrid .trait').length;
  check('trait grid rendered (' + traitCount + ')', traitCount >= 60);
  click('#traitGrid .trait[data-trait="gentle"]');
  click('#traitGrid .trait[data-trait="brave"]');
  await sleep(40);
  check('traits selected (2)', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).profile.personality.traitIds.length === 2);
  check('trait card highlighted', document.querySelector('#traitGrid .trait[data-trait="gentle"]').classList.contains('on'));
  // 自定义特质
  setVal('#customTraitInput', '爱啃月亮');
  document.getElementById('customTraitInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(40);
  check('custom trait added', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).profile.personality.customTraits.includes('爱啃月亮'));
  // 分类筛选
  click('.chip[data-filter="qing"]');
  await sleep(40);
  check('trait filter works', document.querySelectorAll('#traitGrid .trait').length === 10);
  // 形象 tab
  click('.stab[data-stab="form"]');
  await sleep(30);
  setVal('#studioPanel select', '人形');
  await sleep(30);
  check('form.type saved', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).profile.form.type === '人形');

  // ---- 4b. 形象参考图 ----
  check('form image section rendered', !!document.getElementById('imgUploadBtn') && !!document.getElementById('imgUrlInput'));
  check('storage bar rendered', !!document.querySelector('.storage-bar'));
  // jsdom 无 canvas，无法走真实上传；通过测试钩子注入两张图（data 字段）验证图库逻辑
  dom.window.__tulpaTest.setFormImages([
    { id: 'i1', data: 'data:image/png;base64,AAAA' },
    { id: 'i2', data: 'data:image/png;base64,BBBB' }
  ]);
  dom.window.__tulpaTest.renderStudio();
  await sleep(50);
  check('image gallery rendered (2 thumbs)', document.querySelectorAll('.img-thumb').length === 2);
  check('main frame shows image', !!document.querySelector('.img-main-frame img'));
  check('studio head avatar shows image', !!document.querySelector('.avatar.img img'));
  // 删除第二张
  document.querySelector('.img-thumb-actions [data-img-del="i2"]').click();
  await sleep(50);
  check('image deleted', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).profile.form.images.length === 1);
  // 链接添加
  setVal('#imgUrlInput', 'https://example.com/t.png');
  document.getElementById('imgUrlAdd').click();
  await sleep(50);
  check('image url added', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).profile.form.images.length === 2);
  check('url image listed', document.querySelectorAll('.img-thumb').length === 2);

  // ---- 5. 教程中心 ----
  routeTo('guide');
  await sleep(50);
  check('lesson list 8 items', document.querySelectorAll('.lesson-item').length === 8);
  check('lesson body rendered', document.getElementById('guideContent').textContent.includes('认识 Tulpa'));
  click('#lessonNext');
  await sleep(30);
  check('lesson next works', document.getElementById('guideContent').textContent.includes('准备与心态'));
  click('.gtab[data-gtab="glossary"]');
  await sleep(30);
  check('glossary rendered', document.querySelectorAll('.gloss-item').length >= 20);
  click('.gtab[data-gtab="faq"]');
  await sleep(30);
  check('faq rendered', document.querySelectorAll('.faq-item').length >= 10);
  click('.gtab[data-gtab="mistakes"]');
  await sleep(30);
  check('mistakes rendered', document.querySelectorAll('.mistake-card').length >= 8);

  // ---- 6. 记录日志 ----
  routeTo('journal');
  await sleep(50);
  check('journal form rendered', !!document.getElementById('journalForm'));
  setVal('#jTitle', '第一次散步');
  setVal('#jBody', '今天带星尘去幻境的森林走了走，感觉她好奇极了。');
  document.getElementById('journalForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(60);
  check('note entry saved', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).journal.length === 1);
  check('timeline shows entry', document.getElementById('journalContent').textContent.includes('第一次散步'));
  // 练习条目
  setVal('#jTitle', '主动强制 20 分钟');
  setVal('#jBody', '专注想象她说话的样子。');
  setVal('#jKind', 'session');
  document.getElementById('jKind').dispatchEvent(new window.Event('change', { bubbles: true }));
  setVal('#jMinutes', '20');
  document.getElementById('journalForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(60);
  const st = JSON.parse(window.localStorage.getItem('tulpaStudio.v1'));
  check('session entry with minutes', st.journal.length === 2 && st.journal[1].minutes === 20);
  // 筛选
  click('.chip[data-jf="session"]');
  await sleep(40);
  check('journal filter works', document.querySelectorAll('.journal-item').length === 1);

  // ---- 7. 计时器流程（FAB 悬浮计时 → 结束保存） ----
  routeTo('dashboard');
  await sleep(50);
  check('timer fab hidden initially', document.getElementById('timerFab').hidden === true);
  click('#qaTimer');
  await sleep(1300);
  check('timer fab visible', document.getElementById('timerFab').hidden === false);
  const t1 = document.getElementById('timerFabTime').textContent;
  check('timer ticking (not 00:00)', t1 !== '00:00');
  click('#timerFabStop');
  await sleep(60);
  check('stop modal opens', !!document.getElementById('modalNote'));
  setVal('#modalNote', '今天状态不错');
  click('.modal-btns .btn[data-i="1"]');
  await sleep(80);
  const after = JSON.parse(window.localStorage.getItem('tulpaStudio.v1'));
  check('session logged via timer', after.journal.length === 3 && after.journal[2].kind === 'session');
  check('fab hidden after save', document.getElementById('timerFab').hidden === true);

  // ---- 7b. 仪表盘形象卡 + 可视化练习 ----
  check('dashboard form card shown', !!document.getElementById('drillBtn'));
  check('form image on dashboard', document.querySelectorAll('.form-img img').length === 1);
  check('form summary on dashboard', document.getElementById('dashContent').textContent.includes('形象速览'));
  click('#drillBtn');
  await sleep(60);
  check('drill phase 1 (凝视)', !!document.querySelector('.modal-overlay .drill') && document.querySelector('.modal-overlay').textContent.includes('凝视'));
  click('#drillSkip');
  await sleep(30);
  check('drill phase 2 (回想)', document.querySelector('.modal-overlay').textContent.includes('回想'));
  click('#drillEnd');
  await sleep(30);
  check('drill phase 3 (记录)', !!document.getElementById('drillNote'));
  setVal('#drillNote', '在脑海里看到了她银色的头发');
  click('#drillSave');
  await sleep(60);
  const dv = JSON.parse(window.localStorage.getItem('tulpaStudio.v1'));
  check('drill logged as session', dv.journal.some(j => j.title === '可视化练习'));
  check('drill overlay closed', !document.querySelector('.modal-overlay'));

  // ---- 8. 里程碑 ----
  routeTo('milestones');
  await sleep(50);
  check('milestone grid 10 items', document.querySelectorAll('.milestone').length === 10);
  click('.ms-btn[data-ms="form_visual"][data-status="doing"]');
  await sleep(40);
  check('milestone status saved', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).progress.milestones.form_visual.status === 'doing');
  click('.ms-btn[data-ms="first_resp"][data-status="done"]');
  await sleep(40);
  check('milestone done + date', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).progress.milestones.first_resp.date !== '');
  const ring = document.querySelector('.ring span');
  check('overview ring 10%', ring && ring.textContent.trim() === '10%');
  // 里程碑笔记
  setVal('.m-note[data-mnote="form_visual"]', '已经能稳定看见她站在幻境里了');
  await sleep(40);
  check('milestone note saved', JSON.parse(window.localStorage.getItem('tulpaStudio.v1')).progress.milestones.form_visual.note.includes('稳定看见'));

  // ---- 9. 资源库 ----
  routeTo('resources');
  await sleep(50);
  const resCards = document.querySelectorAll('.res-card');
  check('resources rendered (' + resCards.length + ')', resCards.length >= 10);
  check('tulpa.cn link present', document.querySelector('.res-card').getAttribute('href') === 'https://tulpa.cn/');

  // ---- 10. 数据管理 ----
  routeTo('dashboard');
  await sleep(50);
  check('export button works', (() => { try { click('#btnExport'); return true; } catch (e) { return false; } })());

  // ---- 输出 ----
  const failed = results.filter(r => !r.pass);
  console.log('==========================================');
  console.log('PASS: ' + (results.length - failed.length) + ' / ' + results.length);
  failed.forEach(f => console.log('  FAIL: ' + f.name + (f.extra ? ' [' + f.extra + ']' : '')));
  if (errors.length) {
    console.log('--- runtime errors ---');
    errors.slice(0, 10).forEach(e => console.log('  ' + e));
  }
  console.log('==========================================');
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch(e => {
  console.error('HARNESS CRASH:', e);
  process.exit(2);
});
