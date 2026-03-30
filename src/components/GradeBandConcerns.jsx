import { useState } from 'react';

const BANDS = ['K-2', '3-5', '6-8', '9-12'];
const BAND_LABELS = {
  'K-2': 'Grades K–2',
  '3-5': 'Grades 3–5',
  '6-8': 'Grades 6–8',
  '9-12': 'Grades 9–12',
};

function yesPct(topLine) {
  const total = (topLine.Yes || 0) + (topLine.No || 0);
  return total ? Math.round((topLine.Yes / total) * 100) : 0;
}

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

export default function GradeBandConcerns({ concernsByGradeBand, concernsBreakdown, concernsTopLine, totalResponses }) {
  const [selectedBand, setSelectedBand] = useState(null);

  const activeBand = selectedBand ? concernsByGradeBand[selectedBand] : null;
  const activeBreakdown = activeBand ? activeBand.breakdown : concernsBreakdown;
  const activeTopLine = activeBand ? activeBand.topLine : concernsTopLine;
  const activeTotal = activeBand
    ? Object.values(activeBand.breakdown).reduce((a, b) => a + b, 0) || totalResponses
    : totalResponses;

  const entries = Object.entries(activeBreakdown);
  const maxCount = Math.max(1, ...Object.values(activeBreakdown));
  const maxPct = Math.max(1, ...BANDS.map(b => yesPct(concernsByGradeBand[b]?.topLine || { Yes: 0, No: 0 })));

  const totalAnswered = (activeTopLine.Yes || 0) + (activeTopLine.No || 0);
  const pctYes = totalAnswered > 0 ? Math.round((activeTopLine.Yes / totalAnswered) * 100) : 0;

  return (
    <div className="grade-band-wrap">
      <div className="band-tabs">
        <button
          className={`band-tab${!selectedBand ? ' band-tab--active' : ''}`}
          onClick={() => setSelectedBand(null)}
        >
          All grades
        </button>
        {BANDS.map(band => (
          <button
            key={band}
            className={`band-tab${selectedBand === band ? ' band-tab--active' : ''}`}
            onClick={() => setSelectedBand(selectedBand === band ? null : band)}
          >
            {band}
          </button>
        ))}
      </div>

      {!selectedBand && (
        <div className="band-comparison">
          <p className="band-comparison-hint">Select a grade band to see full breakdown</p>
          {BANDS.map(band => {
            const bandData = concernsByGradeBand[band] || { topLine: { Yes: 0, No: 0 } };
            const pct = yesPct(bandData.topLine);
            const total = (bandData.topLine.Yes || 0) + (bandData.topLine.No || 0);
            return (
              <div
                key={band}
                className="hbar-row band-comparison-row"
                onClick={() => setSelectedBand(band)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && setSelectedBand(band)}
              >
                <div className="hbar-label">{BAND_LABELS[band]}</div>
                <div className="hbar-track">
                  <div
                    className="hbar-fill hbar-fill--concern"
                    style={{ width: `${(pct / maxPct) * 100}%` }}
                  />
                </div>
                <div className="hbar-stat">
                  <span className="hbar-count">{pct}%</span>
                  <span className="hbar-pct">have concerns ({total} resp.)</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedBand && (
        <>
          <div className="topline-stat">
            <span className="topline-pct">{pctYes}%</span>
            <span className="topline-label">
              of <strong>{BAND_LABELS[selectedBand]}</strong> parents report concerns
            </span>
            <span className="topline-sub">
              ({activeTopLine.Yes || 0} of {totalAnswered} who answered this question)
            </span>
          </div>

          {entries.length > 0 ? (
            <div className="hbar-list">
              <h3 className="hbar-list-title">What concerns {BAND_LABELS[selectedBand]} parents most</h3>
              {entries.map(([label, count]) => (
                <HorizontalBar
                  key={label}
                  label={label}
                  count={count}
                  maxCount={maxCount}
                  pct={totalAnswered > 0 ? (count / totalAnswered) * 100 : 0}
                />
              ))}
              <p className="hbar-note">
                % of respondents with children in {BAND_LABELS[selectedBand]} who answered this question. Respondents could select multiple concerns.
              </p>
            </div>
          ) : (
            <p className="empty-state">No concern data for this grade band yet.</p>
          )}
        </>
      )}
    </div>
  );
}
