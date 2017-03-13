test('timeout is occured', (done) => {
  expect('stringA').toBe('stringA');
  setTimeout(done, 10000);
});
