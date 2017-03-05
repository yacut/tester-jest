const sum = require('./sum');
const assert = require('assert');

describe('mocha runner', () => {
  it('adds 1 + 2 to equal 3', () => {
    expect(sum(1, 2)).toBe(3);
  });

  it('should return console log text and shows strings diff', () => {
    console.info('test#string');
    assert.equal('stringA', 'stringB');
  });
});
