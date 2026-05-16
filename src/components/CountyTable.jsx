import { useState } from 'react';

export default function CountyTable({ byCounty }) {
  const [sortBy, setSortBy] = useState('count');
  const [sortDir, setSortDir] = useState('desc');

  const entries = Object.entries(byCounty);

  const sorted = [...entries].sort(([nameA, cntA], [nameB, cntB]) => {
    if (sortBy === 'count') {
      return sortDir === 'desc' ? cntB - cntA : cntA - cntB;
    }
    const cmp = nameA.localeCompare(nameB);
    return sortDir === 'desc' ? -cmp : cmp;
  });

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  }

  const arrow = (col) => {
    if (sortBy !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  if (entries.length === 0) {
    return <p className="empty-state">No district data yet.</p>;
  }

  return (
    <div className="county-table-wrap">
      <table className="county-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort('name')} className="sortable">
              District{arrow('name')}
            </th>
            <th onClick={() => toggleSort('count')} className="sortable">
              Responses{arrow('count')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([district, count]) => (
            <tr key={district}>
              <td>{district}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}