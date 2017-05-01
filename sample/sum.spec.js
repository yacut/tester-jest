const sum = require('./sum');

test('sum of 1 and 2 should be 3', () => {
  expect(sum(1, 2)).toEqual(3);
});

test('sum of 2 and 2 should 4', () => {
  expect(sum(2, 2)).toEqual(3);
});

test.skip('sum of 0 and 0 should be 0', () => {
  expect(sum(0, 0)).toEqual(0);
});
