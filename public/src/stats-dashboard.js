/**
 * Interactive Post-Match Statistics & Replay Chart Dashboard for Terra.
 * Renders glassmorphic post-game summary modal, leaderboard standings,
 * and 2D canvas time-series territory expansion chart with interactive tooltips.
 */

import { TerritorySimulation } from './simulation.js';

export class StatsDashboard {
  constructor(overlayId = 'post-match-overlay', canvasId = 'chart-canvas') {
    this.overlay = document.getElementById(overlayId);
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.summaryData = null;
    this.hoverX = null;

    if (this.canvas) {
      this.initEvents();
    }
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverX = e.clientX - rect.left;
      this.renderChart();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverX = null;
      this.renderChart();
    });
  }

  show(summaryData, onPlayAgain, onBackLobby) {
    this.summaryData = summaryData;

    if (!this.overlay) {
      console.log('Post-Match Summary Data:', summaryData);
      return;
    }

    // Populate Modal Elements
    const winnerNameEl = document.getElementById('match-winner-name');
    const rankEl = document.getElementById('match-human-rank');
    const timeEl = document.getElementById('match-duration-val');
    const apmEl = document.getElementById('match-apm-val');
    const landEl = document.getElementById('match-peak-land-val');

    if (winnerNameEl && summaryData.winner) {
      winnerNameEl.textContent = summaryData.winner.name;
      winnerNameEl.style.color = summaryData.winner.color;
    }

    if (rankEl && summaryData.humanRank) {
      rankEl.textContent = `#${summaryData.humanRank} of ${summaryData.totalPlayers}`;
    }

    if (timeEl) {
      const mins = Math.floor(summaryData.durationSeconds / 60);
      const secs = summaryData.durationSeconds % 60;
      timeEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    if (apmEl) apmEl.textContent = `${summaryData.humanAPM} APM`;

    const humanStats = summaryData.standings.find(s => s.isHuman);
    if (landEl && humanStats) {
      landEl.textContent = `${humanStats.peakLandPct}%`;
    }

    // Populate Leaderboard Table
    const tbody = document.getElementById('leaderboard-tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const topPlayers = summaryData.standings.slice(0, 10);
      for (const p of topPlayers) {
        const tr = document.createElement('tr');
        if (p.isHuman) tr.classList.add('human-row');
        tr.innerHTML = `
          <td><strong>#${p.rank}</strong></td>
          <td style="color: ${p.color}; font-weight: 600;">${p.name} ${p.isHuman ? ' (You)' : ''}</td>
          <td>${p.peakLandPct}%</td>
          <td>${TerritorySimulation.formatTroops(p.peakTroops)}</td>
          <td>${p.eliminationTime !== null ? `${Math.round(p.eliminationTime)}s` : 'Survived'}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    // Bind Button Handlers
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnLobby = document.getElementById('btn-back-lobby');

    if (btnPlayAgain) {
      btnPlayAgain.onclick = () => {
        this.hide();
        if (onPlayAgain) onPlayAgain();
      };
    }

    if (btnLobby) {
      btnLobby.onclick = () => {
        this.hide();
        if (onBackLobby) onBackLobby();
      };
    }

    // Display Overlay and Render Canvas Chart
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => this.renderChart());
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
  }

  renderChart() {
    if (!this.canvas || !this.ctx || !this.summaryData || !this.summaryData.timeline) return;

    const width = this.canvas.clientWidth || 800;
    const height = this.canvas.clientHeight || 280;
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.ctx;
    const timeline = this.summaryData.timeline;
    if (timeline.length < 2) return;

    const padding = { top: 25, right: 30, bottom: 35, left: 45 };
    const graphW = width - padding.left - padding.right;
    const graphH = height - padding.top - padding.bottom;

    // Clear Canvas Background
    ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
    ctx.fillRect(0, 0, width, height);

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.textAlign = 'right';

    // Y Axis (0% to 100% Territory)
    for (let yPct = 0; yPct <= 100; yPct += 25) {
      const y = padding.top + graphH - (yPct / 100) * graphH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${yPct}%`, padding.left - 8, y + 4);
    }

    // X Axis Time Labels
    const maxTime = timeline[timeline.length - 1].timestamp || 1;
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) {
      const tVal = (maxTime * (i / 4)).toFixed(0);
      const x = padding.left + (i / 4) * graphW;
      ctx.fillText(`${tVal}s`, x, height - padding.bottom + 18);
    }

    // Identify Top 5 Competitors to Plot
    const topPlayerIds = this.summaryData.standings.slice(0, 5).map(s => s.id);

    // Plot Lines for Top Competitors
    for (const pid of topPlayerIds) {
      const pMeta = this.summaryData.standings.find(s => s.id === pid);
      if (!pMeta) continue;

      ctx.beginPath();
      ctx.strokeStyle = pMeta.color;
      ctx.lineWidth = pMeta.isHuman ? 3 : 2;

      let firstPoint = true;

      for (let idx = 0; idx < timeline.length; idx++) {
        const snap = timeline[idx];
        const pSnap = snap.players.find(p => p.id === pid);
        const landPct = pSnap ? pSnap.landPct : 0;

        const x = padding.left + (snap.timestamp / maxTime) * graphW;
        const y = padding.top + graphH - (landPct / 100) * graphH;

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // Interactive Hover Crosshair & Tooltip
    if (this.hoverX !== null && this.hoverX >= padding.left && this.hoverX <= width - padding.right) {
      const normX = (this.hoverX - padding.left) / graphW;
      const hoverTimestamp = normX * maxTime;

      // Find closest timeline sample
      let closestSnap = timeline[0];
      let minDiff = Math.abs(timeline[0].timestamp - hoverTimestamp);

      for (const snap of timeline) {
        const diff = Math.abs(snap.timestamp - hoverTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closestSnap = snap;
        }
      }

      const snapX = padding.left + (closestSnap.timestamp / maxTime) * graphW;

      // Draw Vertical Crosshair Line
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(snapX, padding.top);
      ctx.lineTo(snapX, height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Hover Tooltip Card
      const topSnaps = closestSnap.players
        .filter(p => topPlayerIds.includes(p.id))
        .sort((a, b) => b.landPct - a.landPct);

      const ttW = 160;
      const ttH = 24 + topSnaps.length * 18;
      let ttX = snapX + 12;
      if (ttX + ttW > width - padding.right) ttX = snapX - ttW - 12;
      const ttY = padding.top + 10;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(ttX, ttY, ttW, ttH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00f2fe';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Time: ${closestSnap.timestamp}s`, ttX + 10, ttY + 16);

      let lineY = ttY + 34;
      for (const p of topSnaps) {
        ctx.fillStyle = p.color;
        ctx.font = p.isHuman ? 'bold 11px sans-serif' : '11px sans-serif';
        ctx.fillText(`${p.name}: ${p.landPct}%`, ttX + 10, lineY);
        lineY += 18;
      }
    }
  }
}
