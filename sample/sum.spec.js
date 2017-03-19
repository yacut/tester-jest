const sum = require('./sum');

test('sum 1 + 2', () => {
  expect(sum(1, 2)).toEqual(3);
});
