function formatQuoteText(text) {
  const parts = text.split(/(?=^- |\n+-)/m).filter(Boolean);
  if (parts.length <= 1) return <p className="quote-text">{'"'}{text}{'"'}</p>;
  return (
    <div className="quote-text">
      {parts.map((part, i) => {
        const trimmed = part.replace(/^\n+/, '').trim();
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('-');
        const content = isBullet ? trimmed.replace(/^-\s*/, '') : trimmed;
        const open = i === 0 ? '"' : '';
        const close = i === parts.length - 1 ? '"' : '';
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
        {'"'}{quote.text}{'"'}
      </p>
      {quote.county && (
        <footer className="quote-spotlight-attr">{quote.county}</footer>
      )}
    </blockquote>
  );
}

export default function ParentVoices({ quotes, scoped, spotlights }) {
  if (!spotlights || spotlights.length === 0) return null;
  return (
    <>
      {spotlights.map((sq, i) => (
        <Spotlight key={i} quote={sq} />
      ))}
    </>
  );
}
