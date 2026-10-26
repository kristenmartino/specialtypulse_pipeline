function tableRows(data, { sortCol, sortDir = 'desc', page = 0, pageSize = 0 } = {}) {
  const sorted = [...data];
  if (sortCol) sorted.sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const order = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? order : -order;
  });
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : Math.max(data.length, 1);
  const pages = Math.max(1, Math.ceil(sorted.length / size));
  const currentPage = Math.min(Math.max(0, page), pages - 1);
  const offset = currentPage * size;
  return { rows: sorted.slice(offset, offset + size), page: currentPage, pages,
    start: sorted.length ? offset + 1 : 0, end: Math.min(offset + size, sorted.length), total: sorted.length };
}

module.exports = { tableRows };
