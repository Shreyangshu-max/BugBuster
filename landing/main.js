/* ══════════════════════════════════════════════════════════
   BugBuster — main.js
   Responsive navigation, hero carousel, interactive modules
   and subpage interactivity (Community, Challenges, Leaderboard)
   ══════════════════════════════════════════════════════════ */

'use strict';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ══════════════════════════════════════════════════════
// 1. NAV — Scroll shadow & Mobile Drawer
// ══════════════════════════════════════════════════════
const nav = document.getElementById('nav');
const hamburger = document.getElementById('hamburger');
const drawer = document.getElementById('nav-drawer');

if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 8);
  }, { passive: true });
}

if (hamburger && drawer) {
  hamburger.addEventListener('click', () => {
    const open = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', String(!open));
    drawer.classList.toggle('open', !open);
    drawer.setAttribute('aria-hidden', String(open));
  });

  drawer.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.setAttribute('aria-expanded', 'false');
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    });
  });
}

// ══════════════════════════════════════════════════════
// 2. LANDING HERO CAROUSEL (Safely scoped)
// ══════════════════════════════════════════════════════
const hcTrack = document.getElementById('hc-track');
const hcPager = document.getElementById('hc-pager');
const hcPauseBtn = document.getElementById('hc-pause');
const heroCarousel = document.getElementById('hero-carousel');
const heroSection = document.getElementById('hero');

if (hcTrack && hcPager && heroCarousel && heroSection) {
  const cards = Array.from(hcTrack.querySelectorAll('.hc__card'));
  const CARD_COUNT = cards.length;
  let hcActive = 0;
  let hcPlaying = !prefersReducedMotion;
  let hcDotTimer = null;
  let dotProgress = 0;

  if (cards.length > 0) {
    cards.forEach((card, i) => {
      const dot = document.createElement('button');
      dot.className = 'hc__dot';
      dot.role = 'tab';
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      if (i === 0) dot.classList.add('active');
      dot.addEventListener('click', () => goTo(i));
      hcPager.appendChild(dot);
    });

    function goTo(idx) {
      if (!cards[hcActive]) return;
      cards[hcActive].classList.remove('active');
      const dots = hcPager.querySelectorAll('.hc__dot');
      if (dots[hcActive]) {
        dots[hcActive].classList.remove('active');
        dots[hcActive].setAttribute('aria-selected', 'false');
      }

      hcActive = (idx + CARD_COUNT) % CARD_COUNT;

      if (cards[hcActive]) cards[hcActive].classList.add('active');
      if (dots[hcActive]) {
        dots[hcActive].classList.add('active');
        dots[hcActive].setAttribute('aria-selected', 'true');
      }

      layoutCards();
      resetDotProgress();
    }

    function layoutCards() {
      cards.forEach((card, i) => {
        const offset = ((i - hcActive + CARD_COUNT) % CARD_COUNT);
        const visual = offset <= CARD_COUNT / 2 ? offset : offset - CARD_COUNT;
        card.style.order = String(visual + 4);
      });
    }

    function resetDotProgress() {
      dotProgress = 0;
      clearInterval(hcDotTimer);
      if (hcPlaying) startDotTimer();
    }

    function startDotTimer() {
      const TOTAL = 9000;
      const TICK = 50;
      dotProgress = 0;
      hcDotTimer = setInterval(() => {
        dotProgress += TICK;
        if (dotProgress >= TOTAL) {
          goTo(hcActive + 1);
        }
      }, TICK);
    }

    if (hcPauseBtn) {
      hcPauseBtn.addEventListener('click', () => {
        hcPlaying = !hcPlaying;
        hcPauseBtn.setAttribute('aria-pressed', String(!hcPlaying));
        if (hcPlaying) startDotTimer(); else clearInterval(hcDotTimer);
      });
    }

    heroCarousel.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { hcPlaying = false; goTo(hcActive - 1); }
      if (e.key === 'ArrowRight') { hcPlaying = false; goTo(hcActive + 1); }
    });

    cards.forEach((card, i) => {
      card.addEventListener('click', () => {
        if (i !== hcActive) { hcPlaying = false; goTo(i); }
      });
    });

    layoutCards();
    if (!prefersReducedMotion) startDotTimer();
  }
}


// ══════════════════════════════════════════════════════
// SCROLL REVEAL — applies .revealed to elements with
// .reveal-left, .reveal-right, .reveal-title, .reveal-up
// Runs after DOM is ready to guarantee elements exist
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function initScrollReveal() {
  const revealEls = document.querySelectorAll(
    '.reveal-title, .reveal-left, .reveal-right, .reveal-up'
  );

  if (!revealEls.length) return;

  // Add stagger delays: mock columns come in 150ms after text columns
  document.querySelectorAll('.feature-row__mock').forEach(el => {
    el.style.transitionDelay = '0.15s';
  });
  document.querySelectorAll('.s5-card').forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.1}s`;
  });

  // If user prefers reduced motion, reveal immediately without animation
  if (prefersReducedMotion) {
    revealEls.forEach(el => {
      el.style.transitionDelay = '0s';
      el.classList.add('revealed');
    });
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealEls.forEach(el => observer.observe(el));
});


// ══════════════════════════════════════════════════════
// 3. COMMUNITY SUBPAGE INTERACTION
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Filter status buttons
  const statusBtns = document.querySelectorAll('#status-filter .filter-btn');
  const postCards = document.querySelectorAll('.post-card');

  statusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      statusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');

      postCards.forEach(card => {
        const statusEl = card.querySelector('.post-status');
        if (!statusEl) return;
        const status = statusEl.textContent.trim().toLowerCase().replace(' ', '-');
        if (filter === 'all' || status === filter) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // Language filter buttons
  const langBtns = document.querySelectorAll('#lang-filter .filter-btn');
  langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Topic tags
  const topicTags = document.querySelectorAll('.topic-tag');
  topicTags.forEach(tag => {
    tag.addEventListener('click', () => {
      topicTags.forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
    });
  });

  // Reply thread expanders
  document.querySelectorAll('.post-action-btn.discuss').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.post-card');
      if (!card) return;
      const thread = card.querySelector('.post-thread');
      if (thread) {
        thread.classList.toggle('hidden');
      }
    });
  });

  // Inline comment senders
  document.querySelectorAll('.thread-send').forEach(btn => {
    btn.addEventListener('click', () => {
      const compose = btn.closest('.thread-compose');
      if (!compose) return;
      const input = compose.querySelector('.thread-input');
      if (input && input.value.trim()) {
        const thread = compose.closest('.post-thread');
        const replyDiv = document.createElement('div');
        replyDiv.className = 'thread-reply';
        replyDiv.innerHTML = `
          <div class="reply-avatar" style="background:linear-gradient(135deg,#1D72E8,#22D3EE)">You</div>
          <div class="reply-bubble">
            <span class="reply-author">You</span>
            <span class="reply-time">Just now</span>
            <p>${input.value.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          </div>
        `;
        thread.insertBefore(replyDiv, compose);
        input.value = '';
      }
    });
  });

  // Try Fix CTA buttons -> navigate to Editor with problem query
  document.querySelectorAll('.post-action-btn.trying').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.post-card');
      const title = card ? card.querySelector('.post-card__title').textContent : '';
      window.location.href = `/editor?problem=${encodeURIComponent(title)}`;
    });
  });

  // ══════════════════════════════════════════════════════
  // 4. CHALLENGES SUBPAGE INTERACTION
  // ══════════════════════════════════════════════════════
  const challengeTiles = document.querySelectorAll('.challenge-tile');
  challengeTiles.forEach(tile => {
    tile.addEventListener('click', () => {
      const id = tile.getAttribute('data-id') || '1';
      const isLocked = tile.classList.contains('locked');
      if (isLocked) {
        alert('Complete earlier levels to unlock this challenge!');
      } else {
        window.location.href = `/editor?challenge=${id}`;
      }
    });
  });

  // Challenge Language tabs
  const challengeLangTabs = document.querySelectorAll('.lang-tab');
  challengeLangTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      challengeLangTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    });
  });

  // Difficulty Filters
  const levelFilterBtns = document.querySelectorAll('.level-filter-btn');
  const levelSections = document.querySelectorAll('.level-section');
  levelFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      levelFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lvl = btn.getAttribute('data-level');

      levelSections.forEach(sec => {
        if (lvl === 'all') {
          sec.style.display = 'block';
        } else {
          const badge = sec.querySelector('.level-badge');
          if (badge && badge.classList.contains(`lvl${lvl}`)) {
            sec.style.display = 'block';
          } else {
            sec.style.display = 'none';
          }
        }
      });
    });
  });

  // ══════════════════════════════════════════════════════
  // 5. LEADERBOARD SUBPAGE INTERACTION
  // ══════════════════════════════════════════════════════
  const scopeToggles = document.querySelectorAll('.lb-toggle');
  scopeToggles.forEach(tog => {
    tog.addEventListener('click', () => {
      const parent = tog.closest('.lb-toggle-group');
      if (!parent) return;
      parent.querySelectorAll('.lb-toggle').forEach(t => t.classList.remove('active'));
      tog.classList.add('active');
    });
  });
});

console.log('[BugBuster] Shared JS initialized ✓');
