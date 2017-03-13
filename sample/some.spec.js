test('timeout occurred', (done) => {
  expect('stringA').toBe('stringA');
  setTimeout(done, 10000);
});
