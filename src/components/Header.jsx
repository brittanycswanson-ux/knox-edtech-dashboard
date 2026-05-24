export default function Header() {
  return (
    <header className="site-header">
      <a href="https://knoxschools.org" className="home-link" title="Knox County Schools Home">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12L12 3l9 9"/><path d="M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"/></svg>
      </a>
      <div className="header-inner">
        <div className="header-main">
          <h1 className="header-title">
            <span className="header-title-line1">Screen Time &amp; Technology&nbsp;Use</span>
            <span className="header-title-line2">in Knox County, Tennessee K-12 Schools</span>
          </h1>
          <p className="header-subtitle">Parent/Caregiver Survey Results</p>
        </div>
        <div className="header-right">
          <a href="https://www.knoxschools.org" target="_blank" rel="noopener noreferrer">
            <img src="/logo.png" alt="Knox County Schools" className="header-logo" />
          </a>
          <a className="header-cta" href="https://parent-edtech-survey-virid.vercel.app" target="_blank" rel="noopener noreferrer">
            Take the Survey
          </a>
        </div>
      </div>
    </header>
  );
}