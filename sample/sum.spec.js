const sum = require('./sum');
const assert = require('assert');

test('sum 1 + 2 to equal 3', () => {
  expect(sum(1, 2)).toBe(3);
});

test('should assert wo strings and shows strings diff on console output', () => {
  assert.equal('stringA', 'stringB');
});

test.skip('should skip this test', () => {
  // whatever
  expect.anything();
});

describe('when test has a describe suite and tester ran', () => {
  it('should hightlight correct file line', () => {
    expect('line above').toBeTruthy();
  });
});
