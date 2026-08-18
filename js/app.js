'use strict';

/* ============================================================
 * 筑灵 · Tulpa Studio — 应用逻辑
 * 纯前端 + localStorage 持久化，无外部依赖，离线可用。
 * ============================================================ */

/* ---------------- 工具 ---------------- */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const todayStr = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const fmtDur = (min) => {
  if (!min) return '0 分钟';
  if (min < 60) return min + ' 分钟';
  const h = Math.floor(min / 60), m = min % 60;
  return h + ' 小时' + (m ? ' ' + m + ' 分钟' : '');
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y + ' 年 ' + +m + ' 月 ' + +d + ' 日';
};

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
};

/* ---------------- 状态管理 ---------------- */
const LS_KEY = 'tulpaStudio.v1';

const DEFAULT_STATE = () => ({
  profile: {
    tulpaName: '',
    hostName: '',
    createdAt: null,
    form: { type: '', height: '', build: '', color: '', appearance: '', clothing: '', symbol: '', images: [] },
    personality: { traitIds: [], customTraits: [], values: '', likes: '', dislikes: '', habits: '', speechStyle: '' },
    voice: { timbre: '', style: '', catchphrase: '' },
    relationship: { hostCall: '', tulpaCall: '', note: '' },
    story: ''
  },
  progress: { milestones: {} },
  journal: [],
  checkins: {},
  settings: { dailyGoal: 30 }
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE();
    const parsed = JSON.parse(raw);
    // 合并默认值，防止结构缺失
    const base = DEFAULT_STATE();
    const merged = Object.assign(base, parsed);
    merged.profile = Object.assign(base.profile, parsed.profile || {});
    merged.profile.form = Object.assign(base.profile.form, (parsed.profile || {}).form || {});
    merged.profile.personality = Object.assign(base.profile.personality, (parsed.profile || {}).personality || {});
    merged.profile.voice = Object.assign(base.profile.voice, (parsed.profile || {}).voice || {});
    merged.profile.relationship = Object.assign(base.profile.relationship, (parsed.profile || {}).relationship || {});
    merged.progress = Object.assign(base.progress, parsed.progress || {});
    merged.settings = Object.assign(base.settings, parsed.settings || {});
    return merged;
  } catch (e) {
    return DEFAULT_STATE();
  }
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); return true; }
  catch (e) { return false; }
}

function setPath(path, value) {
  const keys = path.split('.');
  let obj = state;
  for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
  obj[keys[keys.length - 1]] = value;
}

function getPath(path) {
  const keys = path.split('.');
  let obj = state;
  for (const k of keys) { if (obj == null) return undefined; obj = obj[k]; }
  return obj;
}

/* ---------------- 里程碑辅助 ---------------- */
function ensureMilestones() {
  DATA.milestones.forEach(m => {
    if (!state.progress.milestones[m.id]) {
      state.progress.milestones[m.id] = { status: 'not_started', note: '', date: '' };
    }
  });
  save();
}
ensureMilestones();

const M_STATUS = {
  not_started: { label: '未开始', cls: 'st-not' },
  doing:       { label: '进行中', cls: 'st-doing' },
  done:        { label: '已达成', cls: 'st-done' }
};

function milestonesDone() {
  return DATA.milestones.filter(m => state.progress.milestones[m.id] && state.progress.milestones[m.id].status === 'done');
}

function currentStageIdx() {
  const first = DATA.milestones.findIndex(m => {
    const s = state.progress.milestones[m.id];
    return !s || s.status !== 'done';
  });
  return first === -1 ? DATA.stages.length - 1 : Math.min(first, DATA.stages.length - 1);
}

function daysTogether() {
  if (!state.profile.createdAt) return 0;
  const start = new Date(state.profile.createdAt);
  const now = new Date();
  return Math.max(1, Math.floor((now - start) / 86400000) + 1);
}

/* ---------------- 形象图片辅助 ---------------- */
function formImages() { return state.profile.form.images || []; }
function mainImage() { return formImages()[0] || null; }
function imgSrc(img) { return (img && (img.data || img.url)) || ''; }
function formSummary() {
  const f = state.profile.form;
  const parts = [];
  if (f.type) parts.push(f.type);
  if (f.height) parts.push(f.height);
  if (f.build) parts.push(f.build);
  if (f.color) parts.push('标志色 ' + f.color);
  return parts.length ? parts.join(' · ') : '尚未设定形象，去「设计 · 形象」补全吧';
}
function stateBytes() {
  try { return new Blob([JSON.stringify(state)]).size; }
  catch (e) { return JSON.stringify(state).length * 2; }
}
const STORE_LIMIT = 4600000; // 预留安全余量（localStorage 约 5MB）

function stateBytesWithImages(images) {
  const prev = state.profile.form.images;
  state.profile.form.images = images;
  const b = stateBytes();
  state.profile.form.images = prev;
  return b;
}

function compressImage(file, maxW, quality) {
  maxW = maxW || 720; quality = quality || 0.82;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

/* ============================================================
 * 可视化练习（凝视 → 闭眼回想 → 记录）
 * ============================================================ */
const DRILL_LOOK_SEC = 12;
const DRILL_RECALL_SEC = 25;
let drillTimer = null;

function openDrill() {
  const img = mainImage();
  if (!img) { toast('先上传一张形象参考图吧', 'warn'); return; }
  const src = imgSrc(img);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);

  let phase = 'look';
  let remain = DRILL_LOOK_SEC;
  let total = 0;

  const clearTick = () => { if (drillTimer) { clearInterval(drillTimer); drillTimer = null; } };
  const close = () => { clearTick(); overlay.remove(); };

  const finish = () => { clearTick(); phase = 'done'; paint(); };

  const tick = () => {
    remain--; total++;
    if (remain <= 0) {
      if (phase === 'look') { phase = 'recall'; remain = DRILL_RECALL_SEC; }
      else { finish(); return; }
    }
    paint();
  };

  const paint = () => {
    if (phase === 'look') {
      overlay.innerHTML = `
        <div class="drill">
          <p class="drill-step">第一步 · 凝视</p>
          <p class="drill-sub">用眼睛记住 ta 的轮廓、发色、气质——像第一次见面那样认真</p>
          <div class="drill-img-frame"><img src="${esc(src)}" alt="形象参考"></div>
          <div class="drill-count">${remain}</div>
          <div class="btn-row center">
            <button class="btn ghost" id="drillSkip">已经记住了，跳过</button>
          </div>
        </div>`;
    } else if (phase === 'recall') {
      overlay.innerHTML = `
        <div class="drill dim">
          <p class="drill-step">第二步 · 闭眼回想</p>
          <p class="drill-sub">闭上眼睛，让画面淡去，试着在脑海中"看见" ta……</p>
          <div class="drill-count big">${remain}</div>
          <div class="btn-row center">
            <button class="btn ghost" id="drillEnd">提前结束</button>
          </div>
        </div>`;
    } else {
      overlay.innerHTML = `
        <div class="drill">
          <p class="drill-step">练习完成 ✨</p>
          <p class="drill-sub">你回想起 ta 的样子了吗？写点什么，或直接保存这次练习。</p>
          <textarea id="drillNote" rows="3" placeholder="脑海中浮现的画面、清晰的部分、模糊的部分……"></textarea>
          <div class="btn-row center">
            <button class="btn ghost" id="drillAgain">再来一次</button>
            <button class="btn primary" id="drillSave">保存记录</button>
          </div>
        </div>`;
    }
  };

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { close(); return; }
    const id = e.target.id;
    if (id === 'drillSkip') { phase = 'recall'; remain = DRILL_RECALL_SEC; paint(); }
    else if (id === 'drillEnd') { finish(); }
    else if (id === 'drillAgain') {
      clearTick(); phase = 'look'; remain = DRILL_LOOK_SEC;
      drillTimer = setInterval(tick, 1000); paint();
    }
    else if (id === 'drillSave') {
      const note = ($('#drillNote') || {}).value || '';
      const minutes = Math.max(1, Math.round(total / 60));
      state.journal.push({
        id: uid(), date: todayStr(), kind: 'session',
        title: '可视化练习', body: (note || `凝视并回想共 ${total} 秒，形象：${formSummary()}`).trim(), minutes
      });
      save();
      close();
      toast('可视化练习已记录 🧘');
    }
  });

  drillTimer = setInterval(tick, 1000);
  paint();
}

/* ---------------- 习惯打卡 ---------------- */
const HABITS = [
  { id: 'active',   icon: '🧘', label: '主动强制', hint: '20–60 分钟专注相处' },
  { id: 'narrate',  icon: '💬', label: '叙事陪伴', hint: '把生活讲给 ta 听' },
  { id: 'visual',   icon: '🖼️', label: '可视化',   hint: '想象形象与幻境' },
  { id: 'journal',  icon: '📓', label: '写记录',   hint: '记下今天的相处' }
];

function todayCheckins() {
  const day = todayStr();
  return state.checkins[day] || [];
}

function streakDays() {
  let streak = 0;
  const d = new Date();
  let skippedToday = false; // 今天还没打卡不算断，跳过今天从昨天开始数
  for (;;) {
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const list = state.checkins[key];
    if (list && list.length) { streak++; d.setDate(d.getDate() - 1); }
    else if (!skippedToday) { skippedToday = true; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

/* ---------------- 路由 ---------------- */
const VIEWS = ['dashboard', 'studio', 'guide', 'journal', 'milestones', 'resources'];

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const view = VIEWS.includes(hash) ? hash : 'dashboard';
  VIEWS.forEach(v => {
    const el = $('#view-' + v);
    if (el) el.classList.toggle('active', v === view);
  });
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  document.body.dataset.view = view;
  render(view);
  window.scrollTo({ top: 0 });
}

/* ---------------- 渲染分发 ---------------- */
function render(view) {
  const fn = { dashboard: renderDashboard, studio: renderStudio, guide: renderGuide,
               journal: renderJournal, milestones: renderMilestones, resources: renderResources }[view];
  if (fn) fn();
}

/* ============================================================
 * 仪表盘
 * ============================================================ */
function renderDashboard() {
  const el = $('#dashContent');
  const p = state.profile;
  const first = !p.tulpaName;
  const done = milestonesDone().length;
  const totalMin = state.journal.reduce((a, j) => a + (j.minutes || 0), 0);
  const tip = DATA.tips[Math.floor(Math.random() * DATA.tips.length)];

  el.innerHTML = `
    ${first ? heroWelcome() : heroGreeting()}

    <div class="grid stats-grid">
      ${statCard('📅', daysTogether() + ' 天', '与 ta 相伴')}
      ${statCard('📝', state.journal.length, '条记录')}
      ${statCard('⏱️', fmtDur(totalMin), '累计练习')}
      ${statCard('🏆', done + ' / ' + DATA.milestones.length, '里程碑达成')}
      ${statCard('🔥', streakDays() + ' 天', '连续打卡')}
    </div>

    <div class="grid dash-cols">
      ${formCardHtml()}

      <div class="card">
        <div class="card-head"><h3>📈 当前阶段</h3><span class="pill" id="stagePill">${DATA.stages[currentStageIdx()].title}</span></div>
        <div class="progressbar"><div class="progressbar-fill" style="width:${Math.round(done / DATA.milestones.length * 100)}%"></div></div>
        <p class="muted">${DATA.stages[currentStageIdx()].desc}</p>
        <div class="stage-track">
          ${DATA.stages.map((s, i) => `<span class="stage-dot ${i <= currentStageIdx() ? 'on' : ''}" title="${esc(s.title)}"></span>`).join('')}
        </div>
        <div class="btn-row">
          <a class="btn ghost" href="#/milestones">查看里程碑</a>
          <a class="btn ghost" href="#/guide">阅读教程</a>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>✅ 今日练习</h3><span class="pill">${todayCheckins().length} / ${HABITS.length}</span></div>
        <div class="habits" id="habits">
          ${HABITS.map(h => habitRow(h, todayCheckins().includes(h.id))).join('')}
        </div>
        <p class="muted hint">保持每天一点陪伴，比偶尔猛练更有效</p>
      </div>

      <div class="card tip-card">
        <div class="card-head"><h3>✨ 今日一句</h3><button class="iconbtn" id="tipRefresh" title="换一句">⟳</button></div>
        <p class="tip-text" id="tipText">${esc(tip)}</p>
      </div>

      <div class="card">
        <div class="card-head"><h3>⚡ 快捷操作</h3></div>
        <div class="quick-actions">
          <button class="qa" id="qaTimer"><span>⏱️</span>开始练习计时</button>
          <a class="qa" href="#/journal"><span>📓</span>写一篇日记</a>
          <a class="qa" href="#/studio"><span>🎨</span>完善 ta 的设计</a>
        </div>
      </div>
    </div>

    <div class="card data-card">
      <div class="card-head"><h3>💾 数据管理</h3></div>
      <p class="muted">所有数据仅保存在本浏览器（localStorage）中。建议定期导出备份。</p>
      <div class="btn-row">
        <button class="btn" id="btnExport">导出备份</button>
        <button class="btn ghost" id="btnImport">导入备份</button>
        <button class="btn danger-ghost" id="btnReset">清空数据</button>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
      </div>
    </div>
  `;

  bindDashboard(first);
}

function heroWelcome() {
  return `
    <div class="hero welcome-hero">
      <div class="hero-orb">✦</div>
      <h2>欢迎来到你的创造之旅</h2>
      <p>在这里，你将一步步塑造一位只属于你的心智伙伴——从性格、形象，到每日的陪伴与成长记录。</p>
      <div class="steps">
        <div class="step"><span>1</span>完成 ta 的基础设计</div>
        <div class="step"><span>2</span>跟随教程开始主动强制</div>
        <div class="step"><span>3</span>每天记录相处与感应</div>
      </div>
      <a class="btn primary big" href="#/studio">开始设计 ta ✨</a>
      <button class="btn ghost" id="btnQuickStart">先给 ta 起个名字</button>
    </div>`;
}

function heroGreeting() {
  const p = state.profile;
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const img = mainImage();
  const orb = img
    ? `<div class="hero-orb img"><img src="${esc(imgSrc(img))}" alt="${esc(p.tulpaName)} 的形象" loading="lazy"></div>`
    : `<div class="hero-orb">${esc(p.tulpaName.slice(0, 1))}</div>`;
  return `
    <div class="hero">
      ${orb}
      <div class="hero-text">
        <h2>${greet}，${esc(p.hostName || '创造者')}</h2>
        <p>今天是和 <b class="accent">${esc(p.tulpaName)}</b> 相伴的第 <b>${daysTogether()}</b> 天。先看看 ta 的样子，再开始今天的练习吧。</p>
      </div>
    </div>`;
}

function statCard(icon, num, label) {
  return `<div class="card stat"><span class="stat-icon">${icon}</span><span class="stat-num">${esc(num)}</span><span class="stat-label">${esc(label)}</span></div>`;
}

function habitRow(h, on) {
  return `
    <button class="habit ${on ? 'on' : ''}" data-habit="${h.id}">
      <span class="habit-icon">${h.icon}</span>
      <span class="habit-body"><span class="habit-label">${h.label}</span><span class="habit-hint">${h.hint}</span></span>
      <span class="habit-check">${on ? '✓' : ''}</span>
    </button>`;
}

function formImageSectionHtml() {
  const p = state.profile;
  const imgs = formImages();
  const main = mainImage();
  const bytes = stateBytes();
  const pct = Math.min(100, Math.round(bytes / STORE_LIMIT * 100));
  return `
    <div class="img-section">
      <div class="img-head">
        <h3>形象参考图</h3>
        <p class="muted">上传你喜欢的参考图（自绘、约稿、AI 生成均可）。每天打开仪表盘先看看 ta 的样子，再开始练习；「可视化练习」会带你一步步把它刻进脑海。</p>
      </div>
      <div class="img-main-frame">
        ${main
          ? `<img src="${esc(imgSrc(main))}" alt="主形象参考图" loading="lazy">`
          : `<div class="img-placeholder"><span>🖼️</span><p>还没有参考图<br>上传第一张吧</p></div>`}
      </div>
      <div class="img-thumbs">
        ${imgs.map((im, i) => `
          <div class="img-thumb ${i === 0 ? 'main' : ''}">
            <img src="${esc(imgSrc(im))}" alt="参考图 ${i + 1}" loading="lazy">
            <div class="img-thumb-actions">
              ${i !== 0 ? `<button class="mini-btn" data-img-main="${im.id}" title="设为主图">⭐</button>` : ''}
              <button class="mini-btn del" data-img-del="${im.id}" title="删除">✕</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="img-actions">
        <button class="btn" id="imgUploadBtn">⬆ 上传图片</button>
        <input id="imgFileInput" type="file" accept="image/*" multiple hidden>
        <span class="muted">或粘贴图片链接</span>
        <input id="imgUrlInput" type="text" placeholder="https://…" maxlength="300">
        <button class="btn ghost" id="imgUrlAdd">添加</button>
      </div>
      <div class="storage-bar">
        <div class="storage-fill" style="--fill:${pct}%"></div>
        <span>图片与数据占用约 ${(bytes / 1024).toFixed(0)} KB / ${(STORE_LIMIT / 1024 / 1024).toFixed(1)} MB</span>
      </div>
      <div class="panel-tip">💡 <b>没有图？用 AI 生成：</b>国内可用「即梦」「文心一格」，国外可用 Midjourney / Stable Diffusion。示例提示词：<i>"anime style, a gentle young man with silver hair and cyan eyes, full body character sheet, soft starry background, pastel palette"</i> —— 把结果上传到这里作为参考。</div>
    </div>`;
}

function formCardHtml() {
  const p = state.profile;
  const img = mainImage();
  if (img) {
    return `
      <div class="card form-card">
        <div class="card-head"><h3>🖼️ ta 的样子</h3><span class="pill">形象速览</span></div>
        <div class="form-show">
          <div class="form-img"><img src="${esc(imgSrc(img))}" alt="${esc(p.tulpaName)} 的形象参考" loading="lazy"></div>
          <div class="form-meta">
            <p class="form-desc">${esc(formSummary())}</p>
            <p class="muted">共 ${formImages().length} 张参考图 · 在「设计 · 形象」中管理</p>
            <div class="btn-row">
              <button class="btn primary" id="drillBtn">🧘 可视化练习</button>
              <a class="btn ghost" href="#/studio">管理形象</a>
            </div>
          </div>
        </div>
      </div>`;
  }
  return `
    <div class="card form-card empty-form">
      <div class="card-head"><h3>🖼️ ta 的样子</h3><span class="pill">待补充</span></div>
      <div class="form-show">
        <div class="form-img placeholder">🖼️</div>
        <div class="form-meta">
          <p class="muted">还没有形象参考图。上传一张（或让 AI 生成一张）ta 的样子，每次打开页面都能先看见 ta。</p>
          <a class="btn ghost" href="#/studio">上传形象图</a>
        </div>
      </div>
    </div>`;
}

function bindDashboard(first) {
  $('#habits') && $('#habits').addEventListener('click', e => {
    const b = e.target.closest('[data-habit]');
    if (!b) return;
    const day = todayStr();
    const list = state.checkins[day] || [];
    const i = list.indexOf(b.dataset.habit);
    if (i >= 0) list.splice(i, 1); else list.push(b.dataset.habit);
    state.checkins[day] = list;
    save();
    b.classList.toggle('on', i < 0);
    const chk = b.querySelector('.habit-check');
    if (chk) chk.textContent = i < 0 ? '✓' : '';
    const pill = $('.card .pill');
    if (pill) pill.textContent = list.length + ' / ' + HABITS.length;
  });

  $('#tipRefresh') && $('#tipRefresh').addEventListener('click', () => {
    const t = DATA.tips[Math.floor(Math.random() * DATA.tips.length)];
    $('#tipText').textContent = t;
  });

  $('#qaTimer') && $('#qaTimer').addEventListener('click', () => startTimer());

  $('#drillBtn') && $('#drillBtn').addEventListener('click', () => openDrill());

  $('#btnQuickStart') && $('#btnQuickStart').addEventListener('click', () => openQuickStart());

  $('#btnExport') && $('#btnExport').addEventListener('click', exportData);
  $('#btnImport') && $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile') && $('#importFile').addEventListener('change', importData);
  $('#btnReset') && $('#btnReset').addEventListener('click', () => {
    showModal('清空所有数据？', '这会删除本浏览器中保存的全部 tulpa 设计与记录，且无法恢复。建议先导出备份。', [
      { label: '取消', cls: 'ghost', value: false },
      { label: '确认清空', cls: 'danger', value: true }
    ]).then(ok => { if (ok) { localStorage.removeItem(LS_KEY); location.reload(); } });
  });
}

/* ============================================================
 * 设计工作室
 * ============================================================ */
const STUDIO_TABS = [
  { id: 'base',  icon: '🪪', label: '基础信息' },
  { id: 'traits', icon: '💫', label: '性格' },
  { id: 'form',  icon: '🧬', label: '形象' },
  { id: 'voice', icon: '🎵', label: '声音' },
  { id: 'rel',   icon: '💞', label: '关系' },
  { id: 'story', icon: '📖', label: '背景故事' }
];

let studioTab = 'base';
let traitFilter = 'all';

function renderStudio() {
  const el = $('#studioContent');
  const p = state.profile;
  const done = milestonesDone().length;
  const img = mainImage();

  el.innerHTML = `
    <div class="studio-head card">
      <div class="avatar ${p.tulpaName ? 'has' : ''} ${img ? 'img' : ''}">${img ? `<img src="${esc(imgSrc(img))}" alt="形象">` : esc(p.tulpaName ? p.tulpaName.slice(0, 1) : '?')}</div>
      <div class="studio-head-text">
        <h2>${esc(p.tulpaName || '未命名的心智伙伴')}</h2>
        <p class="muted">${p.form.type ? esc(p.form.type) + ' · ' : ''}性格特质 ${p.personality.traitIds.length + p.personality.customTraits.length} 项 · 参考图 ${formImages().length} 张 · 里程碑 ${done}/${DATA.milestones.length}</p>
      </div>
      <span class="save-hint" id="saveHint">已自动保存 ✓</span>
    </div>

    <div class="studio-tabs">
      ${STUDIO_TABS.map(t => `<button class="stab ${t.id === studioTab ? 'active' : ''}" data-stab="${t.id}">${t.icon} ${t.label}</button>`).join('')}
    </div>

    <div class="card studio-panel" id="studioPanel">${studioPanelHtml()}</div>
  `;

  $$('#studioContent .stab').forEach(b => b.addEventListener('click', () => {
    studioTab = b.dataset.stab;
    renderStudio();
  }));

  bindStudioPanel();
}

function studioPanelHtml() {
  const p = state.profile;
  switch (studioTab) {
    case 'base': return `
      <div class="form-grid">
        ${field('tulpaName', 'ta 的名字', 'text', p.tulpaName, '给 ta 取一个你真心喜欢的名字', 'profile.tulpaName')}
        ${field('hostName', '你的称呼', 'text', p.hostName, '你希望 ta 怎么称呼你', 'profile.hostName')}
        <div class="field full">
          <label>关于这个名字</label>
          <textarea data-bind="profile.form.symbol" rows="3" placeholder="名字的含义、来历，或你们之间的小故事……">${esc(p.form.symbol)}</textarea>
        </div>
      </div>
      <div class="panel-tip">💡 <b>给新手的建议：</b>名字是你们关系的第一个锚点。选一个念起来舒服、对你有意义的名字，每天在心里多叫几遍。</div>`;

    case 'traits': return traitsPanelHtml();

    case 'form': return `
      ${formImageSectionHtml()}
      <div class="form-grid">
        <div class="field">
          <label>形态类型</label>
          <select data-bind="profile.form.type">
            <option value="" ${!p.form.type ? 'selected' : ''}>选择形态类型…</option>
            ${['人形', '类人（兽耳/角等）', '兽形', '幻想种（龙/精灵等）', '抽象存在（光影/元素）', '暂无固定形态'].map(o =>
              `<option value="${o}" ${p.form.type === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        ${field('form.height', '身高 / 体型', 'text', p.form.height, '如：175cm / 小巧', 'profile.form.height')}
        ${field('form.build', '气质 / 体态', 'text', p.form.build, '如：修长、圆润、精瘦', 'profile.form.build')}
        ${field('form.color', '标志色', 'text', p.form.color, '发色、瞳色或代表色', 'profile.form.color')}
        <div class="field full">
          <label>外观描述</label>
          <textarea data-bind="profile.form.appearance" rows="5" placeholder="发型、眼睛、五官、皮肤……越具体，越容易在脑海中"看见" ta">${esc(p.form.appearance)}</textarea>
        </div>
        <div class="field full">
          <label>着装与配饰</label>
          <textarea data-bind="profile.form.clothing" rows="3" placeholder="常穿的服装、标志性饰品（项链、耳环、披风……）">${esc(p.form.clothing)}</textarea>
        </div>
      </div>
      <div class="panel-tip">💡 <b>可视化小技巧：</b>先找一张最接近的参考图，每天看几遍；再闭上眼睛，在幻境里从脚到头"扫描" ta 的细节。</div>`;

    case 'voice': return `
      <div class="form-grid">
        ${field('voice.timbre', '声音质感', 'text', p.voice.timbre, '如：清亮、低沉、软糯、沙哑', 'profile.voice.timbre')}
        ${field('voice.style', '说话风格', 'text', p.voice.style, '如：慢条斯理、干脆利落、爱开玩笑', 'profile.voice.style')}
        <div class="field full">
          <label>口头禅 / 常用语</label>
          <textarea data-bind="profile.voice.catchphrase" rows="3" placeholder='"喂，想我了吗？"——一句口头禅能让声音更鲜活'>${esc(p.voice.catchphrase)}</textarea>
        </div>
      </div>
      <div class="panel-tip">💡 <b>练习：</b>想象 ta 说出这句口头禅，注意语气和语速。心智之声会随着练习逐渐"定型"。</div>`;

    case 'rel': return `
      <div class="form-grid">
        ${field('rel.hostCall', 'ta 对你的称呼', 'text', p.relationship.hostCall, '如：哥哥 / 主人 / 老师 / 名字', 'profile.relationship.hostCall')}
        ${field('rel.tulpaCall', '你对 ta 的昵称', 'text', p.relationship.tulpaCall, '只属于你们的小称呼', 'profile.relationship.tulpaCall')}
        <div class="field full">
          <label>你们的关系</label>
          <textarea data-bind="profile.relationship.note" rows="4" placeholder="挚友、家人、恋人、搭档……你希望这段关系是什么模样？">${esc(p.relationship.note)}</textarea>
        </div>
      </div>
      <div class="panel-tip">💡 <b>相处原则：</b>无论何种关系，核心都是相互尊重。ta 是独立的伙伴，不是你的附属品。</div>`;

    case 'story': return `
      <div class="form-grid">
        <div class="field full">
          <label>ta 的故事</label>
          <textarea data-bind="profile.story" rows="10" placeholder="ta 从哪里来？有怎样的过往？你们是怎么相遇的？写下你们的故事，它会成为 ta 灵魂的一部分……">${esc(p.story)}</textarea>
        </div>
      </div>
      <div class="panel-tip">💡 <b>叙事的力量：</b>背景故事不是"设定文档"，而是你每天与 ta 相处的记忆积累。故事越丰满，ta 越鲜活。</div>`;
  }
  return '';
}

function traitsPanelHtml() {
  const p = state.profile;
  const sel = p.personality.traitIds;
  const cats = Object.keys(DATA.traitCats);
  const list = DATA.traits.filter(t => traitFilter === 'all' || t.cat === traitFilter);
  return `
    <div class="traits-head">
      <p class="muted">已选 <b class="accent">${sel.length + p.personality.customTraits.length}</b> 项特质。新手建议选 8–15 项，能自然想象 ta 展现的即可。</p>
      <div class="filter-chips">
        <button class="chip ${traitFilter === 'all' ? 'on' : ''}" data-filter="all">全部</button>
        ${cats.map(c => `<button class="chip ${traitFilter === c ? 'on' : ''}" data-filter="${c}">${DATA.traitCats[c].name}</button>`).join('')}
      </div>
    </div>
    <div class="trait-grid" id="traitGrid">
      ${list.map(t => traitCard(t, sel.includes(t.id))).join('')}
      ${traitFilter === 'all' ? customTraitCards(p) : ''}
    </div>`;
}

function traitCard(t, on) {
  return `
    <button class="trait ${on ? 'on' : ''}" data-trait="${t.id}">
      <span class="trait-emoji">${t.emoji}</span>
      <span class="trait-name">${t.name}</span>
      <span class="trait-desc">${t.desc}</span>
      <span class="trait-check">${on ? '✓ 已选择' : '+ 添加'}</span>
    </button>`;
}

function customTraitCards(p) {
  const customs = p.personality.customTraits || [];
  return customs.map((c, i) => `
    <button class="trait custom on" data-custom="${i}">
      <span class="trait-emoji">✨</span>
      <span class="trait-name">${esc(c)}</span>
      <span class="trait-desc">自定义特质</span>
      <span class="trait-check">✕ 移除</span>
    </button>`).join('');
}

function bindStudioPanel() {
  // 自动保存所有 data-bind 字段
  const panel = $('#studioPanel');
  if (!panel) return;

  panel.addEventListener('input', e => {
    const el = e.target;
    const bind = el.dataset.bind;
    if (!bind) return;
    const val = el.type === 'checkbox' ? el.checked : el.value;
    setPath(bind, val);
    save();
    flashSaveHint();
    if (bind.startsWith('profile.tulpaName') || bind.startsWith('profile.form.type')) {
      // 更新头部摘要
      renderStudioHead();
    }
  });

  // 特质切换
  panel.addEventListener('click', e => {
    const tb = e.target.closest('[data-trait]');
    if (tb) {
      const id = tb.dataset.trait;
      const arr = state.profile.personality.traitIds;
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
      save();
      // 只刷新特质区
      const grid = $('#traitGrid');
      if (grid) grid.outerHTML = `<div class="trait-grid" id="traitGrid">${traitsGridHtml()}</div>`;
      renderStudioHead();
      flashSaveHint();
      return;
    }
    const cb = e.target.closest('[data-custom]');
    if (cb) {
      const i = +cb.dataset.custom;
      state.profile.personality.customTraits.splice(i, 1);
      save();
      const grid = $('#traitGrid');
      if (grid) grid.outerHTML = `<div class="trait-grid" id="traitGrid">${traitsGridHtml()}</div>`;
      renderStudioHead();
      flashSaveHint();
      return;
    }
    const chip = e.target.closest('[data-filter]');
    if (chip) {
      traitFilter = chip.dataset.filter;
      $$('.chip', panel).forEach(c => c.classList.toggle('on', c.dataset.filter === traitFilter));
      const grid = $('#traitGrid');
      if (grid) grid.outerHTML = `<div class="trait-grid" id="traitGrid">${traitsGridHtml()}</div>`;
      return;
    }
    // 形象图：设为主图
    const mb = e.target.closest('[data-img-main]');
    if (mb) {
      const id = mb.dataset.imgMain;
      const arr = formImages();
      const i = arr.findIndex(x => x.id === id);
      if (i > 0) { const [it] = arr.splice(i, 1); arr.unshift(it); }
      save();
      renderStudio();
      flashSaveHint();
      return;
    }
    // 形象图：删除
    const db = e.target.closest('[data-img-del]');
    if (db) {
      const id = db.dataset.imgDel;
      state.profile.form.images = formImages().filter(x => x.id !== id);
      save();
      renderStudio();
      flashSaveHint();
      toast('已删除参考图');
    }
  });

  // 形象图：文件上传
  const fileInput = $('#imgFileInput', panel);
  if (fileInput) {
    $('#imgUploadBtn', panel).addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []).slice(0, 6);
      let added = 0;
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        try {
          const data = await compressImage(f);
          const next = [...formImages(), { id: uid(), data }];
          if (stateBytesWithImages(next) > STORE_LIMIT) {
            toast('存储空间不足：图片太大或太多，请删除部分图片', 'warn');
            break;
          }
          state.profile.form.images = next;
          added++;
        } catch (err) {
          toast('图片处理失败：' + err.message, 'warn');
        }
      }
      fileInput.value = '';
      if (added) { save(); renderStudio(); flashSaveHint(); toast('已添加 ' + added + ' 张参考图 ✓'); }
    });
  }

  // 形象图：链接添加
  const urlInput = $('#imgUrlInput', panel);
  if (urlInput) {
    const addUrl = () => {
      const u = urlInput.value.trim();
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) { toast('链接需以 http(s):// 开头', 'warn'); return; }
      state.profile.form.images.push({ id: uid(), url: u });
      save(); renderStudio(); flashSaveHint();
      toast('已添加图片链接 ✓');
    };
    $('#imgUrlAdd', panel).addEventListener('click', addUrl);
    urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addUrl(); });
  }

  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'customTraitInput') {
      const v = e.target.value.trim();
      if (v) {
        state.profile.personality.customTraits.push(v);
        save();
        const grid = $('#traitGrid');
        if (grid) grid.outerHTML = `<div class="trait-grid" id="traitGrid">${traitsGridHtml()}</div>`;
        renderStudioHead();
        flashSaveHint();
      }
    }
  });
}

function traitsGridHtml() {
  const p = state.profile;
  const sel = p.personality.traitIds;
  const list = DATA.traits.filter(t => traitFilter === 'all' || t.cat === traitFilter);
  return list.map(t => traitCard(t, sel.includes(t.id))).join('') +
    (traitFilter === 'all' ? `
      <div class="trait add-trait">
        <span class="trait-emoji">➕</span>
        <input id="customTraitInput" type="text" maxlength="12" placeholder="添加自定义特质，回车确认…">
      </div>
      ${customTraitCards(p)}` : '');
}

function renderStudioHead() {
  const p = state.profile;
  const done = milestonesDone().length;
  const head = $('.studio-head');
  if (!head) return;
  const av = $('.avatar', head);
  if (av) {
    const img = mainImage();
    if (img) { av.innerHTML = `<img src="${esc(imgSrc(img))}" alt="形象">`; av.classList.add('img'); }
    else { av.innerHTML = p.tulpaName ? esc(p.tulpaName.slice(0, 1)) : '?'; av.classList.remove('img'); }
    av.classList.toggle('has', !!p.tulpaName);
  }
  const h = $('h2', head);
  if (h) h.textContent = p.tulpaName || '未命名的心智伙伴';
  const sub = $('.studio-head-text p', head);
  if (sub) sub.textContent = (p.form.type ? p.form.type + ' · ' : '') + '性格特质 ' + (p.personality.traitIds.length + p.personality.customTraits.length) + ' 项 · 参考图 ' + formImages().length + ' 张 · 里程碑 ' + done + '/' + DATA.milestones.length;
}

let saveHintTimer = null;
function flashSaveHint() {
  const el = $('#saveHint');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(saveHintTimer);
  saveHintTimer = setTimeout(() => el.classList.remove('show'), 1200);
}

function field(id, label, type, value, ph, bind) {
  const tag = type === 'textarea'
    ? `<textarea id="${id}" data-bind="${bind}" rows="${ph.rows || 3}" placeholder="${ph}">${esc(value)}</textarea>`
    : `<input id="${id}" type="${type}" data-bind="${bind}" value="${esc(value)}" placeholder="${esc(ph)}">`;
  return `<div class="field"><label for="${id}">${label}</label>${tag}</div>`;
}

/* ============================================================
 * 教程中心
 * ============================================================ */
let guideTab = 'lessons';
let currentLesson = 0;

function renderGuide() {
  const tabs = $$('#guideTabs .gtab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.gtab === guideTab));
  const el = $('#guideContent');

  if (guideTab === 'lessons') {
    const l = DATA.lessons[currentLesson];
    el.innerHTML = `
      <div class="guide-layout">
        <aside class="card lesson-list">
          <h4>课程目录</h4>
          ${DATA.lessons.map((x, i) => `
            <button class="lesson-item ${i === currentLesson ? 'on' : ''}" data-lesson="${i}">
              <span class="lesson-num">${x.num}</span>
              <span>${x.title}</span>
            </button>`).join('')}
        </aside>
        <article class="card lesson-body">
          <div class="lesson-head">
            <span class="pill">第 ${l.num} 章</span>
            <h2>${l.title}</h2>
            <p class="muted">${l.intro}</p>
          </div>
          ${l.blocks.map(blockHtml).join('')}
          <div class="lesson-nav">
            <button class="btn ghost" id="lessonPrev" ${currentLesson === 0 ? 'disabled' : ''}>← 上一章</button>
            <span class="muted">${currentLesson + 1} / ${DATA.lessons.length}</span>
            <button class="btn primary" id="lessonNext" ${currentLesson === DATA.lessons.length - 1 ? 'disabled' : ''}>下一章 →</button>
          </div>
        </article>
      </div>`;
    $$('.lesson-item', el).forEach(b => b.addEventListener('click', () => {
      currentLesson = +b.dataset.lesson;
      renderGuide();
    }));
    $('#lessonPrev') && $('#lessonPrev').addEventListener('click', () => { currentLesson = Math.max(0, currentLesson - 1); renderGuide(); });
    $('#lessonNext') && $('#lessonNext').addEventListener('click', () => { currentLesson = Math.min(DATA.lessons.length - 1, currentLesson + 1); renderGuide(); });
  } else if (guideTab === 'glossary') {
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>📖 术语表</h3><span class="pill">${DATA.glossary.length} 个术语</span></div>
        <div class="glossary">
          ${DATA.glossary.map(g => `
            <div class="gloss-item">
              <div class="gloss-term">${g.term}<em>${g.en}</em></div>
              <p>${g.def}</p>
            </div>`).join('')}
        </div>
      </div>`;
  } else if (guideTab === 'faq') {
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>❓ 常见问题</h3></div>
        <div class="faq">
          ${DATA.faq.map((f, i) => `
            <details class="faq-item" ${i === 0 ? 'open' : ''}>
              <summary>${f.q}</summary>
              <p>${f.a}</p>
            </details>`).join('')}
        </div>
      </div>`;
  } else if (guideTab === 'mistakes') {
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>⚠️ 常见误区</h3></div>
        <div class="mistake-grid">
          ${DATA.mistakes.map(m => `
            <div class="mistake-card">
              <h4>${m.title}</h4>
              <p class="muted">${m.why}</p>
              <p class="fix">→ ${m.fix}</p>
            </div>`).join('')}
        </div>
      </div>`;
  }
}

function blockHtml(b) {
  if (b.p) return `<p class="lesson-p">${b.p}</p>`;
  if (b.list) return `<ul class="lesson-list-ul">${b.list.map(x => `<li>${x}</li>`).join('')}</ul>`;
  if (b.h) return `<h3 class="lesson-h">${b.h}</h3>`;
  return '';
}

/* ============================================================
 * 记录日志
 * ============================================================ */
let journalFilter = 'all';

const KIND = {
  session:    { label: '练习', icon: '⏱️', cls: 'k-session' },
  note:       { label: '日记', icon: '📓', cls: 'k-note' },
  milestone:  { label: '感应', icon: '✨', cls: 'k-milestone' }
};

function renderJournal() {
  const el = $('#journalContent');
  const entries = [...state.journal].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const shown = journalFilter === 'all' ? entries : entries.filter(j => j.kind === journalFilter);

  el.innerHTML = `
    <div class="grid journal-cols">
      <div class="card">
        <div class="card-head"><h3>⏱️ 练习计时</h3></div>
        <div class="timer-card">
          <div class="timer-display" id="timerDisplay">00:00</div>
          <div class="timer-sub muted" id="timerSub">开始一段专注的主动强制</div>
          <div class="btn-row center">
            <button class="btn primary" id="timerStart">开始</button>
            <button class="btn ghost" id="timerReset">重置</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>✍️ 快速记录</h3></div>
        <form id="journalForm" class="journal-form">
          <div class="form-row">
            <select id="jKind">
              <option value="note">📓 日记</option>
              <option value="session">⏱️ 练习</option>
              <option value="milestone">✨ 感应/里程碑</option>
            </select>
            <input type="date" id="jDate" value="${todayStr()}">
          </div>
          <div class="form-row" id="jMinRow" hidden>
            <input type="number" id="jMinutes" min="1" max="600" placeholder="时长（分钟）">
          </div>
          <input type="text" id="jTitle" maxlength="40" placeholder="标题（可选）">
          <textarea id="jBody" rows="4" placeholder="写点什么吧……今天和 ta 发生了什么？感受到了什么？"></textarea>
          <button class="btn primary full" type="submit">保存记录</button>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>📜 时间线</h3>
        <div class="filter-chips">
          <button class="chip ${journalFilter === 'all' ? 'on' : ''}" data-jf="all">全部 ${entries.length}</button>
          ${Object.keys(KIND).map(k => `<button class="chip ${journalFilter === k ? 'on' : ''}" data-jf="${k}">${KIND[k].icon} ${KIND[k].label} ${entries.filter(j => j.kind === k).length}</button>`).join('')}
        </div>
      </div>
      ${shown.length
        ? `<div class="timeline">${shown.map(journalCard).join('')}</div>`
        : `<div class="empty"><p>还没有记录。从一段练习或一篇日记开始吧 ✨</p></div>`}
    </div>
  `;

  bindJournal();
}

function journalCard(j) {
  const k = KIND[j.kind] || KIND.note;
  return `
    <div class="journal-item ${k.cls}">
      <div class="j-date">
        <span class="j-dot"></span>
        <span>${j.date}</span>
        ${j.minutes ? `<span class="pill">${j.minutes} 分钟</span>` : ''}
      </div>
      <div class="j-body">
        <div class="j-title"><span class="j-kind">${k.icon} ${k.label}</span>${j.title ? esc(j.title) : ''}</div>
        ${j.body ? `<p>${esc(j.body)}</p>` : ''}
      </div>
      <button class="iconbtn del" data-del="${j.id}" title="删除">✕</button>
    </div>`;
}

function bindJournal() {
  const form = $('#journalForm');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const kind = $('#jKind').value;
    const entry = {
      id: uid(),
      date: $('#jDate').value || todayStr(),
      kind,
      title: $('#jTitle').value.trim(),
      body: $('#jBody').value.trim(),
      minutes: kind === 'session' ? Math.max(1, +$('#jMinutes').value || 0) : 0
    };
    if (!entry.title && !entry.body) { toast('写点内容再保存吧～', 'warn'); return; }
    state.journal.push(entry);
    save();
    $('#jTitle').value = ''; $('#jBody').value = '';
    toast('已保存 ✓');
    renderJournal();
  });

  $('#jKind') && $('#jKind').addEventListener('change', e => {
    $('#jMinRow').hidden = e.target.value !== 'session';
  });

  $$('.chip[data-jf]').forEach(c => c.addEventListener('click', () => {
    journalFilter = c.dataset.jf;
    renderJournal();
  }));

  $$('#journalContent [data-del]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.del;
    showModal('删除这条记录？', '删除后无法恢复。', [
      { label: '取消', cls: 'ghost', value: false },
      { label: '删除', cls: 'danger', value: true }
    ]).then(ok => {
      if (!ok) return;
      state.journal = state.journal.filter(j => j.id !== id);
      save();
      renderJournal();
      toast('已删除');
    });
  }));

  // 计时器
  const startBtn = $('#timerStart');
  const resetBtn = $('#timerReset');
  if (startBtn) startBtn.addEventListener('click', () => {
    if (timerRunning) { pauseTimer(); startBtn.textContent = '继续'; }
    else { startTimer(); startBtn.textContent = '暂停'; }
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    resetTimer();
    startBtn.textContent = '开始';
  });
  tickTimerDisplay();
}

/* ---------------- 计时器 ---------------- */
let timerRunning = false;
let timerElapsed = 0;   // 秒
let timerStartTs = 0;
let timerTick = null;

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerStartTs = Date.now() - timerElapsed * 1000;
  timerTick = setInterval(tickTimerDisplay, 1000);
  const fab = $('#timerFab');
  if (fab) fab.hidden = false;
  const b = $('#timerFabBtn');
  if (b) b.textContent = '⏸';
  tickTimerDisplay();
  toast('练习开始，享受与 ta 的时光 🌙');
}

function pauseTimer() {
  timerRunning = false;
  if (timerTick) clearInterval(timerTick);
  const b = $('#timerFabBtn');
  if (b) b.textContent = '▶';
}

function resetTimer() {
  pauseTimer();
  timerElapsed = 0;
  tickTimerDisplay();
}

function tickTimerDisplay() {
  if (timerRunning) timerElapsed = Math.floor((Date.now() - timerStartTs) / 1000);
  const t = fmtTime(timerElapsed);
  const dis = $('#timerDisplay');
  if (dis) dis.textContent = t;
  const fab = $('#timerFabTime');
  if (fab) fab.textContent = t;
  const sub = $('#timerSub');
  if (sub) sub.textContent = timerElapsed >= 60 ? '已持续 ' + fmtDur(Math.floor(timerElapsed / 60)) : '开始一段专注的主动强制';
}

function stopTimerToLog() {
  pauseTimer();
  const minutes = Math.max(1, Math.round(timerElapsed / 60));
  const body = `完成了 ${fmtDur(minutes)} 的主动强制练习。`;
  showModal('结束练习？', `
    <p>本次练习时长约 <b>${fmtDur(minutes)}</b>，将保存为一条练习记录。</p>
    <textarea id="modalNote" rows="3" placeholder="补充一点感受（可选）……"></textarea>`, [
    { label: '继续练习', cls: 'ghost', value: false },
    { label: '保存记录', cls: 'primary', value: true,
      read: (ov) => ($('.modal textarea[id="modalNote"]', ov).value || '').trim() }
  ]).then(ok => {
    if (!ok) { startTimer(); return; }
    state.journal.push({
      id: uid(), date: todayStr(), kind: 'session',
      title: '主动强制练习', body: (ok || body).trim(), minutes
    });
    save();
    timerElapsed = 0;
    tickTimerDisplay();
    const fab = $('#timerFab');
    if (fab) fab.hidden = true;
    toast('练习已记录，干得漂亮 💪');
    renderJournal();
  });
}

/* ============================================================
 * 里程碑
 * ============================================================ */
function renderMilestones() {
  const el = $('#milestonesContent');
  const done = milestonesDone().length;
  const pct = Math.round(done / DATA.milestones.length * 100);

  el.innerHTML = `
    <div class="card m-overview">
      <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
      <div class="m-overview-text">
        <h3>已达成 ${done} / ${DATA.milestones.length} 项里程碑</h3>
        <p class="muted">这些节点来自社区多年经验的总结，但请记住：每个人的旅程都不一样，顺序与时间都不必强求。</p>
        <div class="progressbar"><div class="progressbar-fill" style="width:${pct}%"></div></div>
      </div>
    </div>
    <div class="milestone-grid">
      ${DATA.milestones.map(m => milestoneCard(m)).join('')}
    </div>
  `;
  bindMilestones();
}

function milestoneCard(m) {
  const s = state.progress.milestones[m.id];
  const st = M_STATUS[s.status] || M_STATUS.not_started;
  return `
    <div class="card milestone ${s.status}">
      <div class="m-head">
        <span class="m-emoji">${m.emoji}</span>
        <div>
          <h4>${m.name}</h4>
          <p class="muted">${m.desc}</p>
        </div>
        <span class="pill ${st.cls}">${st.label}</span>
      </div>
      <div class="m-status">
        ${['not_started', 'doing', 'done'].map(v => `
          <button class="ms-btn ${s.status === v ? 'on' : ''}" data-ms="${m.id}" data-status="${v}">${M_STATUS[v].label}</button>`).join('')}
      </div>
      <div class="m-tip">💡 ${m.tips}</div>
      <textarea class="m-note" data-mnote="${m.id}" rows="2" placeholder="记录与这个里程碑相关的体验…">${esc(s.note)}</textarea>
      ${s.date ? `<p class="m-date">达成于 ${fmtDate(s.date)}</p>` : ''}
    </div>`;
}

function bindMilestones() {
  const el = $('#milestonesContent');
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ms]');
    if (!b) return;
    const id = b.dataset.ms;
    const s = state.progress.milestones[id];
    s.status = b.dataset.status;
    if (s.status === 'done' && !s.date) s.date = todayStr();
    if (s.status !== 'done') s.date = '';
    save();
    renderMilestones();
    const st = M_STATUS[s.status];
    toast(`${DATA.milestones.find(m => m.id === id).name}：${st.label}`);
  });
  el.addEventListener('input', e => {
    const t = e.target.dataset.mnote;
    if (!t) return;
    state.progress.milestones[t].note = e.target.value;
    save();
  });
}

/* ============================================================
 * 资源库
 * ============================================================ */
function renderResources() {
  const el = $('#resourcesContent');
  el.innerHTML = `
    <div class="res-grid">
      ${DATA.resources.map(r => `
        <a class="card res-card" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">
          <span class="res-tag">${esc(r.tag)}</span>
          <h3>${esc(r.name)}</h3>
          <p>${esc(r.desc)}</p>
          <span class="res-link">访问 ↗</span>
        </a>`).join('')}
    </div>
    <div class="card disclaimer">
      <h3>🧭 使用须知</h3>
      <ul>
        <li>本工具提供的方法论综合自 tulpa 社区的公开教程与经验，供学习参考。</li>
        <li>tulpa 实践建立在自身心智之上，请保持理性与适度，不因此影响现实生活。</li>
        <li>若你正经历严重的心理困扰，请优先寻求专业心理帮助。</li>
        <li>所有数据仅保存在你的浏览器本地，不会上传到任何服务器。</li>
      </ul>
    </div>`;
}

/* ============================================================
 * 弹窗 / Toast / 快速起名
 * ============================================================ */
function showModal(title, bodyHtml, buttons) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal card">
        <h3>${esc(title)}</h3>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-btns">
          ${buttons.map((b, i) => `<button class="btn ${b.cls || 'primary'}" data-i="${i}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>`;
    // read: 可选，在弹窗关闭前从 overlay 中收集值（如输入框内容）
    const collect = (b) => (b.read ? b.read(overlay) : b.value);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        const last = buttons[buttons.length - 1];
        const v = collect(last);
        close(v === false ? false : true);
      }
    });
    $$('.modal-btns button', overlay).forEach(btn => btn.addEventListener('click', () => {
      close(collect(buttons[+btn.dataset.i]));
    }));
    document.body.appendChild(overlay);
    const first = $('.modal textarea, .modal input', overlay);
    if (first) first.focus();
  });
}

let toastTimer = null;
function toast(msg, type) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function openQuickStart() {
  showModal('给 ta 起个名字', `
    <p>名字是你们缘分的开始。可以现在决定，也可以先起个临时称呼。</p>
    <input id="qsName" type="text" maxlength="20" placeholder="ta 的名字" value="${esc(state.profile.tulpaName || '')}">
    <input id="qsHost" type="text" maxlength="20" placeholder="你的称呼（可选）">`, [
    { label: '跳过', cls: 'ghost', value: false },
    { label: '就这样', cls: 'primary', value: true,
      read: (ov) => ({
        name: $('.modal input[id="qsName"]', ov).value.trim(),
        host: $('.modal input[id="qsHost"]', ov).value.trim()
      }) }
  ]).then(ok => {
    if (!ok || !ok.name) { toast('名字可以之后再取，先去看看吧～'); return; }
    state.profile.tulpaName = ok.name;
    if (ok.host) state.profile.hostName = ok.host;
    if (!state.profile.createdAt) state.profile.createdAt = new Date().toISOString();
    save();
    toast(`欢迎 ${ok.name} ✨`);
    renderDashboard();
  });
}

/* ============================================================
 * 数据导出 / 导入
 * ============================================================ */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tulpa-studio-backup-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('备份已导出 ✓');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.profile || !Array.isArray(data.journal)) throw new Error('bad');
      state = data;
      ensureMilestones();
      save();
      toast('导入成功 ✓');
      route();
    } catch (err) {
      toast('导入失败：文件格式不正确', 'warn');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ============================================================
 * 背景星尘 & 初始化
 * ============================================================ */
function makeStars() {
  const box = $('#stars');
  if (!box) return;
  let html = '';
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 100, y = Math.random() * 100;
    const s = Math.random() * 2 + 0.5;
    const d = Math.random() * 6 + 3;
    const o = Math.random() * 0.5 + 0.3;
    html += `<i style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${s.toFixed(2)}px;height:${s.toFixed(2)}px;opacity:${o.toFixed(2)};animation-duration:${d.toFixed(2)}s"></i>`;
  }
  box.innerHTML = html;
}

function init() {
  makeStars();

  // 路由
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  route();

  // 移动端菜单
  const toggle = $('#navToggle');
  toggle.addEventListener('click', () => $('#nav').classList.toggle('open'));

  // 教程中心 tab 切换
  $$('#guideTabs .gtab').forEach(b => b.addEventListener('click', () => {
    guideTab = b.dataset.gtab;
    renderGuide();
  }));

  // 计时器悬浮窗
  const fabBtn = $('#timerFabBtn');
  fabBtn.addEventListener('click', () => {
    if (timerRunning) pauseTimer(); else startTimer();
    fabBtn.textContent = timerRunning ? '⏸' : '▶';
  });
  $('#timerFabStop').addEventListener('click', stopTimerToLog);

  // 确保第一天有 createdAt
  if (state.profile.tulpaName && !state.profile.createdAt) {
    state.profile.createdAt = new Date().toISOString();
    save();
  }
}

document.addEventListener('DOMContentLoaded', init);

/* 测试钩子：供自动化测试注入数据（正常使用无影响） */
window.__tulpaTest = {
  setFormImages(images) { state.profile.form.images = images; save(); },
  renderStudio: () => renderStudio()
};
