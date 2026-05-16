export default function CountyMap({ byCounty }) {
  const entries = Object.entries(byCounty);
  if (entries.length === 0) return null;

  const maxCount = Math.max(1, ...entries.map(([, c]) => c));
  const total = entries.reduce((s, [, c]) => s + c, 0);

  const sorted = [...entries].sort(([, a], [, b]) => b - a);

  return (
    <div className="district-chart">
      {sorted.map(([district, count]) => {
        const pct = Math.round((count / total) * 100);
        const barWidth = Math.round((count / maxCount) * 100);
        return (
          <div key={district} className="district-row">
            <div className="district-name">{district}</div>
            <div className="district-bar-wrap">
              <div
                className="district-bar"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="district-count">{count} <span className="district-pct">({pct}%)</span></div>
          </div>
        );
      })}
    </div>
  );
}