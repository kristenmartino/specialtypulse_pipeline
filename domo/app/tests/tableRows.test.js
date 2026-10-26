const test = require('node:test');
const assert = require('node:assert/strict');
const { tableRows } = require('../src/data/tableRows');

test('pagination sorts all records before slicing and preserves every opportunity', () => {
  const data = Array.from({ length: 23 }, (_, i) => ({ id: i, age: (i * 7) % 23 }));
  const pages = [0, 1, 2].map(page => tableRows(data, { sortCol: 'age', page, pageSize: 10 }));
  assert.deepEqual(pages.map(p => [p.start, p.end, p.total]), [[1, 10, 23], [11, 20, 23], [21, 23, 23]]);
  assert.deepEqual(pages.flatMap(p => p.rows.map(r => r.age)), Array.from({ length: 23 }, (_, i) => 22 - i));
  assert.equal(new Set(pages.flatMap(p => p.rows.map(r => r.id))).size, 23);
  assert.deepEqual(data.map(r => r.id), Array.from({ length: 23 }, (_, i) => i));
});

test('page boundaries clamp after data shrinks, with empty data handled', () => {
  assert.equal(tableRows([{ age: 1 }], { page: 4, pageSize: 10 }).page, 0);
  assert.equal(tableRows([{ age: 1 }], { page: -2, pageSize: 10 }).page, 0);
  assert.deepEqual(tableRows([], { page: 4, pageSize: 10 }), { rows: [], page: 0, pages: 1, start: 0, end: 0, total: 0 });
});

test('ascending numeric and string sorts keep missing values last across pages', () => {
  const numbers = [{ age: null }, { age: 90 }, { age: 2 }, { age: 151.5 }, { age: undefined }];
  assert.deepEqual(tableRows(numbers, { sortCol: 'age', sortDir: 'asc', pageSize: 2 }).rows.map(r => r.age), [2, 90]);
  assert.deepEqual(tableRows([{ name: 'Z' }, { name: null }, { name: 'A' }], { sortCol: 'name', sortDir: 'asc' }).rows.map(r => r.name), ['A', 'Z', null]);
});
