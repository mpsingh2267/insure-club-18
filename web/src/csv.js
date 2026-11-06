const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

function parseCsv(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function toCsv(records, columns) {
  return stringify(records, {
    header: true,
    columns,
  });
}

module.exports = {
  parseCsv,
  toCsv,
};
