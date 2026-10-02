import { useId, useState } from 'react';

/*
 * Small SVG chart primitives.
 *
 * Hand-rolled rather than a charting library: this dashboard needs four
 * shapes, and a library would add more to the bundle than the whole
 * admin page currently weighs.
 *
 * Series colours come from a validated three-slot categorical palette
 * (blue / orange / aqua). Three is the cap for safety under colour-vision
 * deficiency — a fourth slot puts yellow next to orange, which fails. The
 * aqua sits under 3:1 contrast on a white card, so every series also
 * carries a visible label; colour is never the only thing distinguishing
 * them.
 */

export const SERIES = {
  one: '#2a78d6',
  two: '#eb6834',
  three: '#1baf7a',
} as const;

const GRID = 'rgba(0,0,0,0.07)';
const AXIS_TEXT = 'rgba(0,0,0,0.45)';

function fmt(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

// ----------------------------------------------------------- stat tile

export function StatTile({
  value,
  label,
  hint,
  tone = 'plain',
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: 'plain' | 'attention';
}) {
  return (
    <div
      className={`bg-white border rounded-[14px] px-4 py-4 ${
        tone === 'attention' && value !== '0' ? 'border-[#C6602B]/40' : 'border-black/10'
      }`}
    >
      <div className="text-[26px] font-bold text-ink tabular-nums leading-none">{value}</div>
      <div className="text-[12px] text-black/45 mt-1.5">{label}</div>
      {hint && <div className="text-[11.5px] text-black/35 mt-1">{hint}</div>}
    </div>
  );
}

// ------------------------------------------------------------ line pair

interface LinePoint {
  day: string;
  a: number;
  b: number;
}

export function LinePair({
  points,
  labelA,
  labelB,
  height = 170,
}: {
  points: LinePoint[];
  labelA: string;
  labelB: string;
  height?: number;
}) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const W = 640;
  const padL = 30;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const max = Math.max(1, ...points.map((p) => Math.max(p.a, p.b)));
  const innerW = W - padL - padR;
  const innerH = height - padT - padB;

  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (key: 'a' | 'b') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

  const ticks = [0, Math.round(max / 2), max].filter((v, i, arr) => arr.indexOf(v) === i);
  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <div className="flex items-center gap-4 mb-2 text-[12px]">
        <span className="flex items-center gap-1.5 text-ink">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: SERIES.one }} />
          {labelA}
        </span>
        <span className="flex items-center gap-1.5 text-ink">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: SERIES.two }} />
          {labelB}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${labelA} and ${labelB} per day`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={padL} y={0} width={innerW} height={height} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
              {fmt(t)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clip})`}>
          <path d={path('a')} fill="none" stroke={SERIES.one} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path('b')} fill="none" stroke={SERIES.two} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {active && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(active.a)} r={4} fill={SERIES.one} stroke="#fff" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(active.b)} r={4} fill={SERIES.two} stroke="#fff" strokeWidth={2} />
          </g>
        )}

        {/* Hit targets wider than the marks, so hovering is forgiving. */}
        {points.map((p, i) => (
          <rect
            key={p.day}
            x={x(i) - innerW / points.length / 2}
            y={0}
            width={innerW / points.length}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        <text x={padL} y={height - 6} fontSize={10} fill={AXIS_TEXT}>
          {points[0].day.slice(5)}
        </text>
        <text x={W - padR} y={height - 6} fontSize={10} fill={AXIS_TEXT} textAnchor="end">
          {points[points.length - 1].day.slice(5)}
        </text>
      </svg>

      {active && (
        <div className="absolute top-0 right-0 bg-ink text-white text-[11.5px] rounded-[8px] px-2.5 py-1.5 pointer-events-none">
          <div className="text-white/60">{active.day}</div>
          <div>{labelA}: <strong className="tabular-nums">{active.a}</strong></div>
          <div>{labelB}: <strong className="tabular-nums">{active.b}</strong></div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- bar rows

export function BarRows({
  rows,
  color = SERIES.one,
  unit = '',
}: {
  rows: { label: string; value: number }[];
  color?: string;
  unit?: string;
}) {
  if (!rows.length) return <p className="text-[13px] text-black/40">Nothing yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <div className="w-[120px] shrink-0 text-[12.5px] text-ink truncate" title={row.label}>
            {row.label}
          </div>
          <div className="flex-1 h-[18px] bg-black/[0.04] rounded-[4px] overflow-hidden">
            <div
              className="h-full rounded-[4px]"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: color }}
            />
          </div>
          <div className="w-[52px] shrink-0 text-right text-[12.5px] text-ink tabular-nums">
            {fmt(row.value)}
            {unit}
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------- funnel

export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  if (!steps.length) return null;
  const top = Math.max(1, steps[0].value);

  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((step, i) => {
        const pctOfTop = (step.value / top) * 100;
        const previous = i === 0 ? null : steps[i - 1].value;
        const drop = previous && previous > 0 ? (step.value / previous) * 100 : null;
        return (
          <div key={step.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[12.5px] text-ink">{step.label}</span>
              <span className="text-[12.5px] text-ink tabular-nums">
                {step.value}
                {drop !== null && (
                  <span className="text-black/40"> · {drop.toFixed(0)}% of previous</span>
                )}
              </span>
            </div>
            <div className="h-[22px] bg-black/[0.04] rounded-[4px] overflow-hidden">
              <div
                className="h-full rounded-[4px]"
                style={{ width: `${Math.max(2, pctOfTop)}%`, background: SERIES.three }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
