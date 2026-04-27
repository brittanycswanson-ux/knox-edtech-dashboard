import { useState } from 'react';
import { useDashboardData } from './hooks/useDashboardData.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import DistrictFilter from './components/DistrictFilter.jsx';
import CountyMap from './components/CountyMap.jsx';
import CountyTable from './components/CountyTable.jsx';
import GradeBandSentiment from './components/GradeBandSentiment.jsx';
import ConcernBreakdown from './components/ConcernBreakdown.jsx';
import PolicyBreakdown from './components/PolicyBreakdown.jsx';
import ParentVoices from './components/ParentVoices.jsx';
import SchoolTypeComparison from './components/SchoolTypeComparison.jsx';

const SPOTLIGHT_QUOTES = [
  {
    text: "My children have IEPs for ADHD. Since middle school, it’s been a battle to get them off games and YouTube. Despite the many IEP meetings, I keep hearing it’s a requirement to have a Chromebook. They are not learning. What would a child with executive function delays do… Write a paper or play Minecraft? (I’ve requested access to the game be blocked, to which it’s not.)",
    county: "Montgomery County",
  },
  {
    text: "My child’s first device use was at school, first inappropriate content viewed was at school, first exposure to “group chats” was at school, first opportunity for multitasking and digital distraction was at school. I felt that many of my goals as a parent were completely undermined by school-issued devices.",
    county: "Allegheny County",
  },
  {
    text: "Our 15 year old was a straight A student, he is now failing nearly every subject. His attention span is extremely poor and we have extraordinary difficulty setting boundaries with technology because he insists that he needs the computer for schoolwork. He will borrow extra devices from school so that even when we collect his laptop at night, he has an extra device that we’re not aware of. He gets distracted by web-based games constantly. It’s clear based on his tabs/search history that he plays games IN CLASS. He forgets to turn in tests/assignments and teachers don’t seem to notice. Technology is so pervasive; we feel trapped because even if we set rules at home, we have to allow for the access required for assignments. We tried blocking YouTube, but found that the teachers frequently linked to YouTube videos. It feels impossible.",
    county: "Philadelphia County",
  },
  {
    text: "The programs that are intended to remediate and re-teach are all \"cheatable.\" I’m a teacher, and students know how to \"AI\" answers for everything online. Also, screen-work leads to students having less pride and care for their work.",
    county: "Lehigh County",
  },
];

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function statStyle(percentage) {
  // Hue: 120 (green) at 0% → 0 (red) at 100%
  // Background saturation and darkness increase with percentage so shading is perceptible
  const hue = Math.round(120 - (percentage / 100) * 120);
  const bgSat = Math.round(18 + (percentage / 100) * 38);   // 18% → 56%
  const bgL   = Math.round(96 - (percentage / 100) * 9);    // 96% → 87%
  const accentL = Math.round(46 - (percentage / 100) * 8);  // 46% → 38%
  return {
    '--stat-accent': `hsl(${hue}, 58%, ${accentL}%)`,
    '--stat-bg':     `hsl(${hue}, ${bgSat}%, ${bgL}%)`,
    '--stat-border': `hsl(${hue}, 30%, 75%)`,
  };
}

export default function App() {
  const { data, loading, error } = useDashboardData();
  const [selectedDistrict, setSelectedDistrict] = useState(null);

  const active = selectedDistrict && data?.byDistrict?.[selectedDistrict]
    ? data.byDistrict[selectedDistrict]
    : data;

  const activeCounty = selectedDistrict && active?.byCounty
    ? Object.entries(active.byCounty).sort(([, a], [, b]) => b - a)[0]?.[0]
    : null;

  const districtQuotes = selectedDistrict ? data?.quotesByDistrict?.[selectedDistrict] : null;
  const countyQuotes = activeCounty ? data?.quotesByCounty?.[activeCounty] : null;

  const activeQuotes = (districtQuotes?.length >= 6)
    ? districtQuotes
    : (countyQuotes?.length > 0)
      ? countyQuotes
      : data?.featuredQuotes;

  const quotesScope = (districtQuotes?.length >= 6)
    ? selectedDistrict
    : activeCounty
      ? `${activeCounty} County`
      : null;

  const commsPoor = (active?.commsRating?.['Very poorly'] || 0) + (active?.commsRating?.['Poorly'] || 0);
  const commsTotal = Object.values(active?.commsRating || {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <Header />

      <main className="main-content">
        {loading && <div className="loading-state">Loading survey data…</div>}
        {error && <div className="error-state">Failed to load survey data: {error}</div>}

        {data && active && (
          <>
            <DistrictFilter
              districts={data.districts || []}
              selected={selectedDistrict}
              onChange={setSelectedDistrict}
            />

            {selectedDistrict && (
              <div className="print-header">
                <img src="/logo.png" alt="PA Unplugged" className="print-logo" />
                <div>
                  <h1 className="print-title">EdTech Survey Results</h1>
                  <p className="print-district">{selectedDistrict}</p>
                  <p className="print-meta">
                    {active.totalResponses} response{active.totalResponses !== 1 ? 's' : ''} · dashboard.paunplugged.org · {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
            )}

            {selectedDistrict && (
              <button
                className="pdf-button"
                onClick={() => window.print()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download PDF
              </button>
            )}

            <section className="section hero-section">
              {selectedDistrict && (
                <p className="district-context">
                  Showing {active.totalResponses} response{active.totalResponses !== 1 ? 's' : ''} from <strong>{selectedDistrict}</strong>
                </p>
              )}

              <div className="hero-stats">
                {(() => {
                  const tooMuchPct = pct(active.anyTooMuch || 0, active.totalResponses);
                  return (
                    <div className="hero-stat" style={statStyle(tooMuchPct)}>
                      <div className="hero-stat-pct">{tooMuchPct}%</div>
                      <div className="hero-stat-label">say there is <strong>too much</strong> screen time on school-issued devices*</div>
                    </div>
                  );
                })()}

                {(() => {
                  const concernsPct = pct(
                    active.concernsTopLine?.Yes || 0,
                    (active.concernsTopLine?.Yes || 0) + (active.concernsTopLine?.No || 0)
                  );
                  return (
                    <div className="hero-stat" style={statStyle(concernsPct)}>
                      <div className="hero-stat-pct">{concernsPct}%</div>
                      <div className="hero-stat-label">report <strong>concerns</strong> about how school-issued devices are used</div>
                    </div>
                  );
                })()}

                {commsTotal > 0 && (
                  <div className="hero-stat" style={statStyle(pct(commsPoor, commsTotal))}>
                    <div className="hero-stat-pct">{pct(commsPoor, commsTotal)}%</div>
                    <div className="hero-stat-label">say their kids' school <strong>communicates poorly</strong> about screen time & tech use</div>
                  </div>
                )}
              </div>

              {Object.keys(active.concernsBreakdown || {}).length > 0 && (
                <div className="hero-top-concerns">
                  <h3 className="hero-concerns-title">Top concerns</h3>
                  <ol className="hero-concerns-list">
                    {Object.entries(active.concernsBreakdown).slice(0, 4).map(([label, count]) => (
                      <li key={label}>
                        <span className="concern-name">{label}</span>
                        <span className="concern-pct">
                          {pct(count, active.totalResponses)}% of respondents
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <p className="hero-footnote">
                Based on {active.totalResponses.toLocaleString()} survey response{active.totalResponses !== 1 ? 's' : ''}
                {!selectedDistrict && data.districts?.length > 0 && ` from ${data.districts.length} school districts`}
              </p>
              <p className="hero-footnote">
                * Represents % of parents who rated at least one grade band as "Too much." Concerns and communication % are per respondent.
              </p>
            </section>

            <section className="section">
              <h2 className="section-title">Geographic Breakdown</h2>
              <p className="section-desc">Responses by PA county</p>
              <CountyMap byCounty={active.byCounty} />
              <CountyTable byCounty={active.byCounty} />
            </section>

            <section className="section">
              <h2 className="section-title">Screen Time Sentiment</h2>
              <p className="section-desc">How parents feel about the amount of screen time in school — by grade band</p>
              <GradeBandSentiment
                byGradeBand={active.byGradeBand || {}}
                screenTimeSentiment={active.screenTimeSentiment || {}}
              />
            </section>

            <section className="section">
              <h2 className="section-title">Concerns</h2>
              <ConcernBreakdown
                concernsTopLine={active.concernsTopLine}
                concernsBreakdown={active.concernsBreakdown}
                totalResponses={active.totalResponses}
              />
            </section>

            <section className="section">
              <h2 className="section-title">Policy Preferences</h2>
              <p className="section-desc">Which policy changes parents would support (select all that apply)</p>
              <PolicyBreakdown
                policies={active.policies}
                totalResponses={active.totalResponses}
              />
            </section>

            {Object.keys(data.bySchoolType || {}).length >= 2 && (
              <section className="section school-type-section">
                <h2 className="section-title">Traditional Public vs. Private/Independent vs. Charter</h2>
                <p className="section-desc">How responses differ by school type</p>
                <SchoolTypeComparison bySchoolType={data.bySchoolType} />
              </section>
            )}

            {activeQuotes?.length > 0 && (
              <section className="section">
                <h2 className="section-title">Parent Voices</h2>
                <p className="section-desc">
                  {quotesScope
                    ? `In their own words — responses from ${quotesScope}`
                    : 'In their own words — responses from across Pennsylvania'}
                </p>
                <ParentVoices
                  quotes={activeQuotes}
                  scoped={!!quotesScope}
                  spotlights={!quotesScope ? SPOTLIGHT_QUOTES : null}
                />
              </section>
            )}
          </>
        )}

        <details className="methodology">
          <summary className="methodology-toggle">About This Survey</summary>
          <div className="methodology-body">
            <h3>Survey Design</h3>
            <p>
              The survey was designed by the PA Unplugged leadership team, drawing on
              professional backgrounds in education policy, research design, and survey
              methodology. It captures parent perspectives across multiple dimensions: screen
              time volume, specific concerns, school communication, and policy preferences.
              The survey includes both structured questions (multiple choice, rating scales)
              and an open-ended response field for parents to share additional concerns in
              their own words.
            </p>
            <h3>Distribution</h3>
            <p>
              The survey was distributed through PA Unplugged's network of local leads, who shared
              it with parent communities in their regions — both families connected to PA Unplugged's
              work and parents with no prior affiliation. It was also shared in Pennsylvania
              parenting groups on Facebook and relevant subreddits, and promoted through
              paid ads on Instagram and Facebook targeting parents in Pennsylvania. Distribution
              was designed to be as broad as organizational capacity allowed, but was not
              systematic or randomized.
            </p>
            <h3>Fielding Period</h3>
            <p>
              The survey opened on February 17, 2026 and remains open. Results on this dashboard
              update daily as new responses come in.
            </p>
          </div>
        </details>
      </main>

      <Footer generated={data?.generated} />
    </>
  );
}
