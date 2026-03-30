import { useState } from 'react';

const BANDS = ['K-2', '3-5', '6-8', '9-12'];
const BAND_LABELS = {
  'K-2': 'Grades K–2',
  '3-5': 'Grades 3–5',
  '6-8': 'Grades 6–8',
  '9-12': 'Grades 9–12',
};

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

export default function GradeBandConcerns({ concernsByGradeBand }) {
  const [selectedBand, setSelectedBand] = useState('K-2');

  const bandData = concernsByGradeBand[selectedBand] || { topLine: { Yes: 0, No: 0 }, breakdown: {} };
  const entries = Object.entries(bandData.breakdown);
  const maxCount = Math.max(1, ...Object.values(bandData.breakdown));
  const totalWithConcerns = bandData.topLine.Yes || 0;

  return (
    <div className="grade-band-wrap">
      <div className="band-tabs">
        {BANDS.map(band => (
          <button
            key={band}
            className={`band-tab${selectedBand === band ? ' band-tab--active' : ''}`}
            onClick={() => setSelectedBand(band)}
          >
            {band}
          </button>
        ))}
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
              pct={totalWithConcerns > 0 ? (count / totalWithConcerns) * 100 : 0}
            />
          ))}
          <p className="hbar-note">
            % of {BAND_LABELS[selectedBand]} respondents who reported concerns ({totalWithConcerns}). Respondents could select multiple.
          </p>
        </div>
      ) : (
        <p className="empty-state">No concern data for this grade band yet.</p>
      )}
    </div>
  );
}
