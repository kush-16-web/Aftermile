import { clamp, mod, smooth } from '../core/math.ts';
import type { WeatherMode, WeatherState } from './Weather.ts';

export type EnvironmentTime = 'morning' | 'noon' | 'evening' | 'night';
export const ENVIRONMENTS = ['live', 'autumn', 'snow'] as const;
export const ENVIRONMENT_TIMES: Record<EnvironmentTime, number> = { morning: 8.5, noon: 12, evening: 17.65, night: 23 };
export function exposedEnvironment(mode: WeatherMode): 'live' | 'autumn' | 'snow' {
  return mode === 'live' || mode === 'snow' ? mode : 'autumn';
}
export function nearestEnvironmentTime(hour: number): EnvironmentTime {
  return hour < 5 || hour >= 20 ? 'night' : hour < 10 ? 'morning' : hour < 16 ? 'noon' : 'evening';
}
export function starVisibility(hour: number, theme: string, time: EnvironmentTime, cloud: number, fog = 0, snow = 0) {
  const elevation = Math.sin((hour - 6) * Math.PI / 12);
  const darkness = theme === 'autumn' ? (time === 'night' ? .85 : time === 'evening' ? .16 : 0)
    : 1 - smooth((elevation + .25) / .29);
  return clamp(darkness * (1 - smooth((cloud - .28) / .65)) * (1 - fog * .7) * (1 - snow * .9), 0, 1);
}

// Continuous keyframes: dawn/dusk never swap entire palettes at an hour boundary.
export const SKY_KEYS = [
  {h:0, top:0x050914, mid:0x0d1528, horizon:0x192336, sun:0xaec5e6},
  {h:4.8, top:0x10152c, mid:0x363251, horizon:0x795767, sun:0xe8baa1},
  {h:6.3, top:0x475577, mid:0x9d93ac, horizon:0xeab79a, sun:0xffc39a},
  {h:8.5, top:0x487eaa, mid:0x9dc1d5, horizon:0xdde0d4, sun:0xffe9cf},
  {h:12, top:0x346f9c, mid:0x8db6cf, horizon:0xd7dfe0, sun:0xfff5e8},
  {h:16, top:0x497197, mid:0xa5b7c8, horizon:0xe6ccb8, sun:0xffddb2},
  {h:17.65, top:0x37294f, mid:0xa96988, horizon:0xf0a06c, sun:0xffb171},
  {h:18.5, top:0x201b38, mid:0x705777, horizon:0xc68080, sun:0xffa16b},
  {h:19.6, top:0x101529, mid:0x2b3456, horizon:0x525579, sun:0xaec5e6},
  {h:21, top:0x050914, mid:0x0d1528, horizon:0x192336, sun:0xaec5e6},
  {h:24, top:0x050914, mid:0x0d1528, horizon:0x192336, sun:0xaec5e6},
];
export function skyKeyframe(hour: number) {
  const h = mod(hour, 24);
  const i = Math.max(0, SKY_KEYS.findIndex(k => k.h > h) - 1);
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
  return {a, b, blend:smooth((h - a.h) / (b.h - a.h))};
}
export function atmosphere(hour: number, weather: WeatherState) {
  const elevation = Math.sin((hour - 6) * Math.PI / 12);
  const night = 1 - smooth((elevation + .22) / .30);
  const daylight = smooth((elevation + .06) / .62);
  const direct = clamp(1 - weather.cloud * .77 - weather.storm * .4 - weather.fog * .42, .04, 1);
  return {elevation, night, sunIntensity:(.25 + daylight * 2.35) * (1 - night) * direct + night * .085 * direct,
    ambientIntensity:(.16 + daylight * .86 + (1 - night) * .16) * (1 - weather.cloud * .26),
    fogDensity:.00030 + weather.fog * .0015 + weather.wet * .00055 + weather.snow * .00085};
}
