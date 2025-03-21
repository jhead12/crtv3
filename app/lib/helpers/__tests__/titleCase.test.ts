import { titleCase } from '../helpers';

describe('titleCase', () => {
  it('should throw on empty string', () => {
    expect(() => titleCase('')).toThrow('Can not parse empty string');
  });

  it('should return first letter capitalised', () => {
    const res = titleCase('not over yet');
    expect(res).toBe('Not over yet');
  });
});
