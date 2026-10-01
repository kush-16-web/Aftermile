import { damp } from '../core/math.ts';

export class Companion {
  context: CanvasRenderingContext2D;
  pulse = 0;
  sweepAngle = 0;
  dangerLevel = 0;
  statusText = 'CLEAR';

  constructor(public canvas: HTMLCanvasElement) {
    canvas.width = 160;
    canvas.height = 100;
    this.context = canvas.getContext('2d')!;
  }

  update(dt: number, time: number, danger: number, fuel: number, weather: string, clean: number, reduced: boolean) {
    this.dangerLevel = damp(this.dangerLevel, danger, 4, dt);
    this.sweepAngle = (this.sweepAngle + dt * (danger > 0.2 ? 4.5 : 2.0)) % (Math.PI * 2);
    this.pulse = (this.pulse + dt * (danger > 0.2 ? 6.0 : 1.5)) % (Math.PI * 2);

    const ctx = this.context;
    ctx.clearRect(0, 0, 160, 100);

    const cx = 80;
    const cy = 48;
    const radius = 34;

    const isAlert = this.dangerLevel > 0.25;
    const primaryColor = isAlert ? '#f1727c' : '#88bec4';
    const subtleColor = isAlert ? 'rgba(241, 114, 124, 0.25)' : 'rgba(136, 190, 196, 0.2)';
    const ringPulse = Math.sin(this.pulse) * 0.5 + 0.5;

    // Background circular radar grid
    ctx.save();
    ctx.lineWidth = 1;

    // Outer horizon arc
    ctx.strokeStyle = subtleColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner concentric ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cx - radius - 6, cy);
    ctx.lineTo(cx + radius + 6, cy);
    ctx.moveTo(cx, cy - radius - 6);
    ctx.lineTo(cx, cy + radius + 6);
    ctx.stroke();

    // Sweeping radar beam
    if (!reduced) {
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
      grad.addColorStop(0, primaryColor);
      grad.addColorStop(1, 'transparent');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, this.sweepAngle - 0.4, this.sweepAngle);
      ctx.closePath();
      ctx.fillStyle = isAlert ? 'rgba(241, 114, 124, 0.18)' : 'rgba(136, 190, 196, 0.12)';
      ctx.fill();
      ctx.restore();
    }

    // Danger / Proximity pulse rings
    if (isAlert) {
      ctx.strokeStyle = `rgba(241, 114, 124, ${0.4 + ringPulse * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.7 + ringPulse * 0.45), 0, Math.PI * 2);
      ctx.stroke();

      // Flashing alert chevrons
      ctx.fillStyle = '#f1727c';
      ctx.font = '600 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PROXIMITY ALERT', cx, cy + radius + 18);
    } else {
      // Normal state indicator
      ctx.fillStyle = 'rgba(180, 205, 215, 0.65)';
      ctx.font = '600 8px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const label = weather === 'snow' ? 'SURFACE: ICY' : weather === 'storm' ? 'SURFACE: WET' : fuel < 20 ? 'FUEL LOW' : 'ROAD: OPTIMAL';
      ctx.fillText(label, cx, cy + radius + 18);
    }

    // Center focal point (car beacon)
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(cx, cy, isAlert ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Road lane guides (forward perspective preview)
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy + 18);
    ctx.lineTo(cx - 3, cy + 4);
    ctx.moveTo(cx + 10, cy + 18);
    ctx.lineTo(cx + 3, cy + 4);
    ctx.stroke();

    ctx.restore();
  }
}

