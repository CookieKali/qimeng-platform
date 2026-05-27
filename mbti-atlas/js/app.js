/**
 * MBTI Atlas — UI controller
 */
(function () {
  const typeList = Object.keys(MBTI_TYPES);

  function createAvatarSvg(hue, size = 88) {
    const id = `av-${hue}-${size}`;
    return `<svg class="detail-avatar" width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(${hue},70%,58%)"/>
          <stop offset="100%" style="stop-color:hsl(${hue + 35},75%,42%)"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#${id})" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
      <ellipse cx="50" cy="72" rx="28" ry="8" fill="rgba(0,0,0,0.15)"/>
      <circle cx="38" cy="42" r="5" fill="#fff" opacity="0.9"/>
      <circle cx="62" cy="42" r="5" fill="#fff" opacity="0.9"/>
      <circle cx="40" cy="44" r="2" fill="#1a1a2e"/>
      <circle cx="64" cy="44" r="2" fill="#1a1a2e"/>
      <path d="M 38 58 Q 50 68 62 58" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
      <ellipse cx="35" cy="52" rx="6" ry="4" fill="rgba(255,150,180,0.35)"/>
      <ellipse cx="65" cy="52" rx="6" ry="4" fill="rgba(255,150,180,0.35)"/>
    </svg>`;
  }

  function renderDetail(code) {
    const type = MBTI_TYPES[code];
    if (!type) return;

    const temp = TEMPERAMENTS[type.temperament];
    const panel = document.getElementById('detail-panel');
    const empty = panel.querySelector('.detail-empty');
    const content = panel.querySelector('.detail-content');

    empty.style.display = 'none';
    content.classList.add('active');
    content.style.setProperty('--type-color', temp.color);
    content.style.setProperty('--type-glow', temp.glow);

    content.innerHTML = `
      <div class="detail-hero">
        ${createAvatarSvg(type.avatarHue)}
        <div class="detail-code">${type.code}</div>
        <div class="detail-name">${type.name} · ${type.nameEn}</div>
        <div class="detail-tagline">「${type.tagline}」</div>
        <div class="dim-tags">
          ${type.dimensions.map((d) => `<span class="dim-tag">${DIMENSION_LABELS[d]}</span>`).join('')}
        </div>
      </div>
      <div class="detail-scroll">
        <div class="detail-section">
          <h3>🎌 动漫 archetype</h3>
          <p class="detail-text"><strong>${type.animeArchetype}</strong></p>
          ${type.animeRefs.map((r) => `<span class="anime-pill">${r}</span>`).join('')}
        </div>
        <div class="detail-section">
          <h3>📖 人格画像</h3>
          <p class="detail-text">${type.description}</p>
          <p class="detail-text" style="margin-top:8px"><small>认知功能：${type.cognitive}</small></p>
        </div>
        <div class="detail-section">
          <h3>✨ 优点 · ⚡ 缺点</h3>
          <div class="pros-cons">
            <ul class="pros">${type.strengths.map((s) => `<li>${s}</li>`).join('')}</ul>
            <ul class="cons">${type.weaknesses.map((w) => `<li>${w}</li>`).join('')}</ul>
          </div>
        </div>
        <div class="detail-section">
          <h3>💕 恋爱风格</h3>
          <p class="detail-text">${type.loveStyle}</p>
          <p class="detail-text" style="margin-top:8px"><strong>情感需求：</strong>${type.loveNeeds.join(' · ')}</p>
        </div>
        <div class="detail-section">
          <h3>💑 最佳伴侣</h3>
          <div class="match-row">
            ${type.bestPartner.map((c) => `<span class="match-badge best" data-code="${c}">${c} ${MBTI_TYPES[c].name}</span>`).join('')}
          </div>
        </div>
        <div class="detail-section">
          <h3>🤝 默契拍档</h3>
          <div class="match-row">
            ${type.goodMatch.map((c) => `<span class="match-badge good" data-code="${c}">${c}</span>`).join('')}
          </div>
        </div>
        <div class="detail-section">
          <h3>⚔️ 需要磨合</h3>
          <div class="match-row">
            ${type.challenging.map((c) => `<span class="match-badge challenge" data-code="${c}">${c}</span>`).join('')}
          </div>
        </div>
        <div class="detail-section">
          <h3>👥 友谊 · 💼 职业 · 🌱 成长</h3>
          <p class="detail-text">${type.friendship}</p>
          <p class="detail-text" style="margin-top:8px"><strong>适合领域：</strong>${type.career.join('、')}</p>
          <p class="detail-text" style="margin-top:8px"><strong>压力源：</strong>${type.stress}</p>
          <p class="detail-text" style="margin-top:8px"><strong>成长建议：</strong>${type.growth}</p>
        </div>
        <div class="detail-section">
          <h3>🌟 名人参考</h3>
          <p class="detail-text">${type.famous.join(' · ')}</p>
        </div>
      </div>
    `;

    content.querySelectorAll('.match-badge').forEach((badge) => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const c = badge.dataset.code;
        GraphView.focusType(c);
        renderDetail(c);
        scrollToGraph();
      });
    });
  }

  function scrollToGraph() {
    document.getElementById('spectrum')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderCards() {
    const grid = document.getElementById('cards-grid');
    if (!grid) return;

    grid.innerHTML = typeList
      .map((code) => {
        const t = MBTI_TYPES[code];
        const temp = TEMPERAMENTS[t.temperament];
        const miniAvatar = createAvatarSvg(t.avatarHue, 52).replace('class="detail-avatar"', 'class="type-card-avatar"');
        return `
          <article class="type-card" data-code="${code}" style="--card-accent:${temp.color};--card-glow:${temp.glow}">
            <div class="type-card-header">
              ${miniAvatar}
              <div>
                <div class="type-card-code">${code}</div>
                <div class="type-card-sub">${t.name} · ${temp.icon} ${temp.name}</div>
              </div>
            </div>
            <p class="type-card-desc">${t.tagline}</p>
            <div class="type-card-matches">最佳伴侣：<span>${t.bestPartner.join(' · ')}</span></div>
          </article>
        `;
      })
      .join('');

    grid.querySelectorAll('.type-card').forEach((card) => {
      card.addEventListener('click', () => {
        const code = card.dataset.code;
        GraphView.focusType(code);
        renderDetail(code);
        scrollToGraph();
      });
    });
  }

  function renderLegendaryPairs() {
    const strip = document.getElementById('pairs-strip');
    if (!strip) return;

    strip.innerHTML = LEGENDARY_PAIRS.map((p) => `
      <div class="pair-card" data-pair-a="${p.a}" data-pair-b="${p.b}" role="button" tabindex="0" title="点击查看 ${p.a} 详情">
        <div class="pair-types">
          <span>${p.a}</span>
          <span class="pair-heart">♥</span>
          <span>${p.b}</span>
        </div>
        <h4 style="margin-bottom:8px;color:var(--gold)">${p.title}</h4>
        <p class="detail-text">${p.desc}</p>
      </div>
    `).join('');

    strip.querySelectorAll('.pair-card').forEach((card) => {
      const go = () => {
        const a = card.dataset.pairA;
        GraphView.focusType(a);
        renderDetail(a);
        document.getElementById('compare-a').value = a;
        document.getElementById('compare-b').value = card.dataset.pairB;
      };
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  }

  function getCompatTier(a, b) {
    if (a === b) return 'self';
    const ta = MBTI_TYPES[a];
    if (!ta) return 'neutral';
    if (ta.bestPartner.includes(b)) return 'best';
    if (ta.goodMatch.includes(b)) return 'good';
    if (ta.challenging.includes(b)) return 'challenge';
    const tb = MBTI_TYPES[b];
    if (tb?.bestPartner.includes(a)) return 'best';
    if (tb?.goodMatch.includes(a)) return 'good';
    if (tb?.challenging.includes(a)) return 'challenge';
    return 'neutral';
  }

  function renderMatrix() {
    const table = document.getElementById('compat-matrix');
    if (!table) return;

    let html = '<thead><tr><th></th>';
    typeList.forEach((c) => { html += `<th>${c}</th>`; });
    html += '</tr></thead><tbody>';

    typeList.forEach((row) => {
      html += `<tr><th class="row-header">${row}</th>`;
      typeList.forEach((col) => {
        const tier = getCompatTier(row, col);
        const sym = tier === 'self' ? '★' : tier === 'best' ? '♥' : tier === 'good' ? '◆' : tier === 'challenge' ? '△' : '·';
        html += `<td class="cell-${tier}" title="${row} × ${col}">${sym}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }

  function computeCompareScore(a, b) {
    let score = 50;
    const ta = MBTI_TYPES[a];
    const tb = MBTI_TYPES[b];
    if (ta.bestPartner.includes(b) || tb.bestPartner.includes(a)) score = 92;
    else if (ta.goodMatch.includes(b) || tb.goodMatch.includes(a)) score = 78;
    else if (ta.challenging.includes(b) || tb.challenging.includes(a)) score = 48;
    else {
      if (ta.temperament === tb.temperament) score += 8;
      const diffE = a[0] !== b[0];
      const diffSN = a[1] !== b[1];
      const diffTF = a[2] !== b[2];
      const diffJP = a[3] !== b[3];
      if (diffE && !diffSN) score += 10;
      if (diffTF && !diffJP) score += 8;
      if (diffSN && diffTF) score += 5;
    }
    return Math.min(98, Math.max(35, score));
  }

  function updateCompare() {
    const selA = document.getElementById('compare-a');
    const selB = document.getElementById('compare-b');
    const result = document.getElementById('compare-result');
    if (!selA || !selB || !result) return;

    const a = selA.value;
    const b = selB.value;
    const score = computeCompareScore(a, b);
    const ta = MBTI_TYPES[a];
    const tb = MBTI_TYPES[b];

    let tierText = '中等默契 — 差异带来成长空间';
    if (ta.bestPartner.includes(b) || tb.bestPartner.includes(a)) tierText = '黄金搭档 — 经典高兼容组合';
    else if (ta.goodMatch.includes(b)) tierText = '默契拍档 — 相处融洽';
    else if (ta.challenging.includes(b) || tb.challenging.includes(a)) tierText = '磨合组合 — 需要更多理解与沟通';

    result.innerHTML = `
      <div class="compare-score">
        <div class="score-num">${score}</div>
        <div>兼容指数 / 100</div>
        <p style="margin-top:12px;color:var(--gold)">${tierText}</p>
      </div>
      <p><strong>${a} ${ta.name}</strong> 与 <strong>${b} ${tb.name}</strong></p>
      <p style="margin-top:12px">${ta.loveStyle}</p>
      <p style="margin-top:12px">${tb.loveStyle}</p>
      <p style="margin-top:16px;font-size:0.85rem">提示：MBTI 仅供参考，真诚沟通与相互尊重才是关系的核心。</p>
    `;
  }

  function initSakura() {
    const canvas = document.getElementById('sakura-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let petals = [];
    const count = 40;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      petals.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 2 + Math.random() * 4,
        speed: 0.3 + Math.random() * 0.8,
        sway: Math.random() * Math.PI * 2,
        hue: 330 + Math.random() * 30,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      petals.forEach((p) => {
        p.y += p.speed;
        p.sway += 0.02;
        p.x += Math.sin(p.sway) * 0.5;
        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, 0.5)`;
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, p.sway, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  function initFilters() {
    document.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const temp = chip.dataset.temp || 'all';
        GraphView.setTemperamentFilter(temp);
      });
    });

    document.querySelectorAll('[data-edge]').forEach((input) => {
      input.addEventListener('change', () => {
        const filters = {};
        document.querySelectorAll('[data-edge]').forEach((el) => {
          filters[el.dataset.edge] = el.checked;
        });
        GraphView.setEdgeFilters(filters);
      });
    });

    const search = document.getElementById('search-input');
    if (search) {
      search.addEventListener('input', () => {
        const q = search.value.trim();
        if (q.length >= 2) GraphView.searchHighlight(q);
        else if (q.length === 0) GraphView.setTemperamentFilter(
          document.querySelector('.filter-chip.active')?.dataset.temp || 'all'
        );
      });
    }
  }

  function initViewTabs() {
    document.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.hero-actions [data-view]').forEach((b) => {
          b.classList.toggle('btn-primary', b === btn);
          b.classList.toggle('btn', b !== btn);
        });
        document.querySelectorAll('.view-section').forEach((s) => {
          s.classList.toggle('active', s.id === `view-${view}`);
        });
        if (view === 'spectrum') {
          setTimeout(() => GraphView.resize?.() || window.dispatchEvent(new Event('resize')), 100);
        }
      });
    });
  }

  function initCompareModal() {
    const modal = document.getElementById('compare-modal');
    const openBtn = document.getElementById('btn-compare');
    const closeBtn = document.getElementById('modal-close');

    const opts = typeList.map((c) => `<option value="${c}">${c} - ${MBTI_TYPES[c].name}</option>`).join('');
    document.getElementById('compare-a').innerHTML = opts;
    document.getElementById('compare-b').innerHTML = opts;
    document.getElementById('compare-a').value = 'INTJ';
    document.getElementById('compare-b').value = 'ENFP';

    openBtn?.addEventListener('click', () => {
      modal.classList.add('open');
      updateCompare();
    });
    closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.getElementById('compare-a')?.addEventListener('change', updateCompare);
    document.getElementById('compare-b')?.addEventListener('change', updateCompare);
  }

  function init() {
    initSakura();
    renderCards();
    renderLegendaryPairs();
    renderMatrix();
    initFilters();
    initViewTabs();
    initCompareModal();

    GraphView.init('graph-container', (code) => {
      renderDetail(code);
    });

    document.querySelector('.filter-chip[data-temp="all"]')?.classList.add('active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
