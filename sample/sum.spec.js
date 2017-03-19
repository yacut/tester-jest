const sum = require('./sum');

test('sum of 1 and 2', () => {
  expect(sum(1, 2)).toEqual(3);
});
