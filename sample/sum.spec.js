const sum = require('./sum');
const assert = require('assert');

test('adds 1 + 2 to equal 3?', () => {
  expect(sum(1, 2)).toBe(3);
});

test('should return console log text and shows strings diff', () => {
  assert.equal('stringA', 'stringB');
});

test.skip('should skip this test', () => {
  // whatever
});
