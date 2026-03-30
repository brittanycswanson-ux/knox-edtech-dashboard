function HorizontalBar({ label, count, maxCount, pct }) {
  return (
    <div className="hbar-row">
      <div className="hbar-label">{label}</div>
      <div className="hbar-track">
        <div
          className="hbar-fill hbar-fill--concern"
          style={{ width: `${(count / maxCount) * 100}%` }}
        />
      </div>
      <div className="hbar-stat">
        <span className="hbar-count">{count}</span>
        <span className="hbar-pct">({pct.toFixed(0)}%)</span>
      </div>
    </div>
  );
}

export default function ConcernBreakdown({ concernsTopLine, concernsBreakdown, totalResponses }) {
  const totalAnswered = (concernsTopLine.Yes || 0) + (concernsTopLine.No || 0);
  const yesPct = totalAnswered > 0
    ? ((concernsTopLine.Yes || 0) / totalAnswered) * 100
    : 0;

  const maxCount = Math.max(1, ...Object.values(concernsBreakdown));
  const entries = Object.entries(concernsBreakdown);

  return (
    <div className="concern-wrap">
      <div className="topline-stat">
        <span className="topline-pct">{yesPct.toFixed(0)}%</span>
        <span className="topline-label">
          of parents report having concerns about how school devices are used
        </span>
        <span className="topline-sub">
          ({concernsTopLine.Yes || 0} of {totalAnswered} who answered this question)
        </span>
      </div>

      {entries.length > 0 ? (
        <div className="hbar-list">
          <h3 className="hbar-list-title">What concerns parents most</h3>
          {entries.map(([label, count]) => (
            <HorizontalBar
              key={label}
              label={label}
              count={count}
              maxCount={maxCount}
              pct={(concernsTopLine.Yes || 0) > 0 ? (count / concernsTopLine.Yes) * 100 : 0}
            />
          ))}
          <p className="hbar-note">
            % of parents who reported concerns ({concernsTopLine.Yes || 0}). Respondents could select multiple.
          </p>
        </div>
      ) : (
        <p className="empty-state">No concern breakdown data yet.</p>
      )}
    </div>
  );
}
