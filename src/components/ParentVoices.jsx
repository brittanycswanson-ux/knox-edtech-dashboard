function formatQuoteText(text) {
  const parts = text.split(/(?=^- |\n+-)/m).filter(Boolean);
  if (parts.length <= 1) return <p className="quote-text">{'“'}{text}{'”'}</p>;
  return (
    <div className="quote-text">
      {parts.map((part, i) => {
        const trimmed = part.replace(/^\n+/, '').trim();
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('-');
        const content = isBullet ? trimmed.replace(/^-\s*/, '') : trimmed;
        const open = i === 0 ? '“' : '';
        const close = i === parts.length - 1 ? '”' : '';
        return <p key={i} className={isBullet ? 'quote-bullet' : 'quote-paragraph'}>{open}{content}{close}</p>;
      })}
    </div>
  );
}

function Spotlight({ quote }) {
  if (!quote) return null;
  return (
    <blockquote className="quote-spotlight">
      <p className="quote-spotlight-text">
        {'“'}{quote.text}{'”'}
      </p>
      {quote.county && (
        <footer className="quote-spotlight-attr">{quote.county}</footer>
      )}
    </blockquote>
  );
}

function QuoteCard({ q, scoped }) {
  return (
    <blockquote className={`quote-card${q.wide ? ' quote-card--wide' : ''}`}>
      {q.wide ? formatQuoteText(q.text) : (
        <p className="quote-text">{'“'}{q.text}{'”'}</p>
      )}
      {q.county && !scoped && <footer className="quote-attr">{q.county} County</footer>}
    </blockquote>
  );
}

export default function ParentVoices({ quotes, scoped, spotlights }) {
  if (!quotes || quotes.length === 0) return null;

  if (!spotlights || spotlights.length === 0) {
    return (
      <div className="quotes-grid">
        {quotes.map((q, i) => (
          <QuoteCard key={i} q={q} scoped={scoped} />
        ))}
      </div>
    );
  }

  const rowSize = 4;
  const sections = [];
  let offset = 0;

  spotlights.forEach((sq, si) => {
    if (si > 0) {
      const chunk = quotes.slice(offset, offset + rowSize);
      if (chunk.length > 0) {
        sections.push(
          <div key={`g${si}`} className="quotes-grid">
            {chunk.map((q, i) => <QuoteCard key={offset + i} q={q} scoped={scoped} />)}
          </div>
        );
        offset += rowSize;
      }
    }
    sections.push(<Spotlight key={`s${si}`} quote={sq} />);
  });

  if (offset < quotes.length) {
    sections.push(
      <div key="g-rest" className="quotes-grid">
        {quotes.slice(offset).map((q, i) => <QuoteCard key={offset + i} q={q} scoped={scoped} />)}
      </div>
    );
  }

  return <>{sections}</>;
}
