import { createContext, ReactNode, useContext, useState } from 'react';

export type Bike = { year: number; model_code: string; model_name: string | null };

const Ctx = createContext<{ bike: Bike | null; setBike: (b: Bike | null) => void }>({ bike: null, setBike: () => {} });

// The selected bike for this session. Saved garage is Phase 4.
export function BikeProvider({ children }: { children: ReactNode }) {
  const [bike, setBike] = useState<Bike | null>(null);
  return <Ctx.Provider value={{ bike, setBike }}>{children}</Ctx.Provider>;
}

export const useBike = () => useContext(Ctx);

export const bikeLabel = (b: Bike) => `${b.year} ${b.model_name ? titleCase(b.model_name) : b.model_code}`;

// Model-name tokens that stay uppercase (seen in vehicles.model_name).
const KEEP_UPPER = new Set(['CVO', 'CH', 'KH', 'KHK', 'KR', 'ST', 'C', 'S', 'I', 'II', 'III', '883R']);

export function titleCase(s: string) {
  return s
    .split(' ')
    .map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.toLowerCase().replace(/^([a-z])/, (m) => m.toUpperCase())))
    .join(' ');
}
