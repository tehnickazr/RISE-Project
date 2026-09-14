/**
 * One scenario's attempts over time, as a small multiple.
 *
 * Deliberately *not* one line across everything a student has practised.
 * Measured on our own content, the same answer standard scored 4.25 / 3.72 /
 * 3.19 across three trades, because the depth of the expected answers differs
 * by partner. A single line would read as improvement when the student merely
 * moved to a shallower scenario. Comparison is only valid inside one chart.
 */
export default function ProgressChart({ points, locale = 'en' }) {
  const w = 280;
  const h = 104;
  const padL = 22;
  const padR = 10;
  const padT = 10;
  const padB = 20;

  const x = (i) =>
    padL + (points.length === 1
      ? (w - padL - padR) / 2
      : (i * (w - padL - padR)) / (points.length - 1));
  const y = (v) => h - padB - ((v - 1) / 4) * (h - padT - padB);

  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="progress-chart" role="img"
         aria-label={points.map((p) => `${p.attempt}: ${p.score}`).join(', ')}>
      {[2, 3, 4].map((v) => (
        <g key={v}>
          <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#eaedff" strokeWidth="1" />
          <text x={padL - 6} y={y(v) + 3} fontSize="9" fill="#737785" textAnchor="end">{v}</text>
        </g>
      ))}
      {points.length > 1 && (
        <path d={path} fill="none" stroke="#0056d2" strokeWidth="2" strokeLinejoin="round" />
      )}
      {points.map((p, i) => (
        <g key={p.attempt}>
          <circle
            cx={x(i)} cy={y(p.score)} r="4"
            fill={i === points.length - 1 ? '#0056d2' : '#ffffff'}
            stroke="#0056d2" strokeWidth="2"
          />
          <text x={x(i)} y={h - 4} fontSize="9" fill="#737785" textAnchor="middle">
            {p.attempt}.
          </text>
        </g>
      ))}
    </svg>
  );
}
