function formatQuoteText(text) {
  // Split on bullet-point dashes (handles both \n- and ^-)
  const parts = text.split(/(?=^- |\n+-)/m).filter(Boolean);
  if (parts.length <= 1) return <p className="quote-text">{'\u201c'}{text}{'\u201d'}</p>;
  return (
    <div className="quote-text">
      {parts.map((part, i) => {
        const trimmed = part.replace(/^\n+/, '').trim();
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('-');
        const content = isBullet ? trimmed.replace(/^-\s*/, '') : trimmed;
        const open = i === 0 ? '\u201c' : '';
        const close = i === parts.length - 1 ? '\u201d' : '';
        return <p key={i} className={isBullet ? 'quote-bullet' : 'quote-paragraph'}>{open}{content}{close}</p>;
      })}
    </div>
  );
}

export default function ParentVoices({ quotes, scoped }) {
  if (!quotes || quotes.length === 0) return null;

  return (
    <div className="quotes-grid">
      {quotes.map((q, i) => (
        <blockquote key={i} className={`quote-card${q.wide ? ' quote-card--wide' : ''}`}>
          {q.wide ? formatQuoteText(q.text) : (
            <p className="quote-text">{'\u201c'}{q.text}{'\u201d'}</p>
          )}
          {q.county && !scoped && <footer className="quote-attr">{q.county} County</footer>}
        </blockquote>
      ))}
    </div>
  );
}
