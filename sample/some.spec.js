const assert = require('assert');

test('strings are equals', (done) => {
  assert.equal('stringA', 'stringA');
  setTimeout(done, 100000000);
});
