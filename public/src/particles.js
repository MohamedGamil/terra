/**
 * Dynamic Visual Juiciness & Particle Engine for Terra.
 * Manages an optimized 60 FPS object pool for shockwave rings,
 * kinetic combat sparks, and floating combat text overlays.
 */

export class ParticleSystem {
  constructor(maxParticles = 500) {
    this.maxParticles = maxParticles;
    this.pool = [];
    this.activeParticles = [];

    // Pre-allocate fixed pool to prevent GC frame stutter
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push({
        active: false,
        type: 'SHOCKWAVE', // 'SHOCKWAVE' | 'SPARK' | 'TEXT'
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 0,
        maxRadius: 18,
        color: '#00f2fe',
        text: '',
        life: 0,
        maxLife: 1.0,
        alpha: 1.0
      });
    }
  }

  getParticle() {
    if (this.pool.length > 0) {
      const p = this.pool.pop();
      p.active = true;
      return p;
    }
    // Recycle oldest active particle if pool exhausted
    if (this.activeParticles.length > 0) {
      const p = this.activeParticles.shift();
      return p;
    }
    return null;
  }

  recycleParticle(p) {
    p.active = false;
    this.pool.push(p);
  }

  spawnShockwave(x, y, color = '#00f2fe', maxRadius = 20) {
    const p = this.getParticle();
    if (!p) return;

    p.type = 'SHOCKWAVE';
    p.x = x;
    p.y = y;
    p.radius = 2;
    p.maxRadius = maxRadius;
    p.color = color;
    p.life = 0;
    p.maxLife = 0.35; // 350ms
    p.alpha = 1.0;

    this.activeParticles.push(p);
  }

  spawnSpark(x, y, color = '#ff0055', vx = 0, vy = 0) {
    const p = this.getParticle();
    if (!p) return;

    p.type = 'SPARK';
    p.x = x;
    p.y = y;
    p.vx = vx + (Math.random() - 0.5) * 30;
    p.vy = vy + (Math.random() - 0.5) * 30;
    p.color = color;
    p.life = 0;
    p.maxLife = 0.25; // 250ms
    p.alpha = 1.0;

    this.activeParticles.push(p);
  }

  spawnFloatingText(x, y, text, color = '#ffffff') {
    const p = this.getParticle();
    if (!p) return;

    p.type = 'TEXT';
    p.x = x;
    p.y = y;
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = -25; // Float upward
    p.text = text;
    p.color = color;
    p.life = 0;
    p.maxLife = 0.6; // 600ms
    p.alpha = 1.0;

    this.activeParticles.push(p);
  }

  update(deltaSec) {
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += deltaSec;

      if (p.life >= p.maxLife) {
        this.activeParticles.splice(i, 1);
        this.recycleParticle(p);
        continue;
      }

      const progress = p.life / p.maxLife;
      p.alpha = Math.max(0, 1.0 - progress);

      if (p.type === 'SHOCKWAVE') {
        p.radius = 2 + progress * (p.maxRadius - 2);
      } else if (p.type === 'SPARK' || p.type === 'TEXT') {
        p.x += p.vx * deltaSec;
        p.y += p.vy * deltaSec;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }
  }

  render(ctx, camera) {
    if (this.activeParticles.length === 0) return;

    const zoom = camera ? camera.zoom || 1 : 1;
    const panX = camera ? camera.panX || 0 : 0;
    const panY = camera ? camera.panY || 0 : 0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const p of this.activeParticles) {
      // Transform world coordinates (p.x, p.y) to screen coordinates
      const screenX = (p.x - panX) * zoom;
      const screenY = (p.y - panY) * zoom;

      if (p.type === 'SHOCKWAVE') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, 2.5 * p.alpha);
        ctx.globalAlpha = p.alpha * 0.8;

        ctx.beginPath();
        ctx.arc(screenX, screenY, p.radius * zoom, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'SPARK') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;

        const size = Math.max(1, 3 * p.alpha * zoom);
        ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
      } else if (p.type === 'TEXT') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.font = `bold ${Math.max(10, Math.round(12 * zoom))}px sans-serif`;
        ctx.textAlign = 'center';

        ctx.fillText(p.text, screenX, screenY);
      }
    }

    ctx.restore();
  }
}
