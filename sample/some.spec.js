test('string are equals', () => {
  expect('stringA').toBe('stringA');
});

it('snapshot test', () => {
  expect({ a: 1, b: 2 }).toMatchSnapshot();
});
