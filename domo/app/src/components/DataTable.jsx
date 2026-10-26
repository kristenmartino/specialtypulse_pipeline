import React, { useState, useMemo, useEffect } from "react";

import { tableRows } from "../data/tableRows";

export default function DataTable({ columns, data, defaultSort, className = "", onRowClick, pageSize = 0 }) {
  const [sortCol, setSortCol] = useState(defaultSort || (columns[0] && columns[0].key));
  const [sortDir, setSortDir] = useState("desc");

  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [data, pageSize]);
  const result = useMemo(() => tableRows(data, { sortCol, sortDir, page, pageSize }), [data, sortCol, sortDir, page, pageSize]);

  const toggleSort = (key) => {
    setPage(0);
    if (sortCol === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(key);
      setSortDir("desc");
    }
  };

  return (
    <div className={`data-table-block ${pageSize ? "paginated-table" : ""}`}>
    <div className={`data-table-wrap ${className}`}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(col.key); } }}
                tabIndex={0}
                aria-sort={sortCol === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                className={sortCol === col.key ? `sorted ${sortDir}` : ""}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
                {sortCol === col.key && (
                  <span className="sort-arrow">{sortDir === "asc" ? " \u25B2" : " \u25BC"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr
              key={i}
              className={onRowClick ? "clickable" : ""}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {pageSize > 0 && <nav className="table-pagination" aria-label="Table pagination">
      <span role="status">{result.start}–{result.end} of {result.total} opportunities</span>
      <div>
        <button type="button" disabled={result.page === 0} onClick={() => setPage(result.page - 1)}>Previous</button>
        <span className="table-page-count">Page {result.page + 1} of {result.pages}</span>
        <button type="button" disabled={result.page >= result.pages - 1} onClick={() => setPage(result.page + 1)}>Next</button>
      </div>
    </nav>}
    </div>
  );
}
