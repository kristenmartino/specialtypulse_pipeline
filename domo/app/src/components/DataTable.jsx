import React, { useState, useMemo } from "react";

export default function DataTable({ columns, data, defaultSort, className = "" }) {
  const [sortCol, setSortCol] = useState(defaultSort || (columns[0] && columns[0].key));
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    if (!sortCol) return data;
    return [...data].sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [data, sortCol, sortDir]);

  const toggleSort = (key) => {
    if (sortCol === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(key);
      setSortDir("desc");
    }
  };

  return (
    <div className={`data-table-wrap ${className}`}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
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
          {sorted.map((row, i) => (
            <tr key={i}>
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
  );
}
