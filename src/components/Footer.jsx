export default function Footer({ generated }) {
  const date = generated
    ? new Date(generated).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : null;

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        {date && <p className="footer-updated">Data last updated: {date}</p>}
        <p className="footer-links">
          <a href="https://www.knoxschools.org" target="_blank" rel="noopener noreferrer">
            Knox County Schools
          </a>
          {' · '}
          <a href="https://survey.knoxschools.org" target="_blank" rel="noopener noreferrer">
            Take the Survey
          </a>
          {' · '}
          <a href="https://www.knoxschools.org/about/regions" target="_blank" rel="noopener noreferrer">
            School Districts
          </a>
        </p>
        <p className="footer-links" style={{ marginTop: '8px', fontSize: '0.85em', opacity: 0.7 }}>
          This is an independent parent-led initiative and is not an official Knox County Schools publication.
        </p>
      </div>
    </footer>
  );
}