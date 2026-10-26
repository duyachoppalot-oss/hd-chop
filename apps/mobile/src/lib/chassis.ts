import type { Chassis } from './api';

// Stock wheel / tire / axle / fork tube / handlebar sizes -> labelled lines for
// the bike header ("Wheels: 19 x 2.15 in front, 16 x 3.00 in rear"). Values come
// worded by the API; several values = more than one stock size that year, shown
// as "a or b". Front/rear lists are not paired by index. Empty fields are skipped.
const either = (v: string[]) => v.join(' or ');

function pair(front: string[], rear: string[]): string | null {
  const parts = [front.length ? `${either(front)} front` : null, rear.length ? `${either(rear)} rear` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function chassisLines(c: Chassis | null | undefined): { label: string; value: string }[] {
  if (!c) return [];
  const rows: [string, string | null][] = [
    ['Wheels', pair(c.wheel_front, c.wheel_rear)],
    ['Tires', pair(c.tire_front, c.tire_rear)],
    ['Axles', pair(c.axle_front, c.axle_rear)],
    ['Fork', c.fork_tube.length ? `${either(c.fork_tube)} tubes` : null],
    ['Bars', c.handlebar.length ? either(c.handlebar) : null],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, value]) => ({ label, value }));
}
