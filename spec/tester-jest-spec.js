'use babel';

/* @flow */
import Promise from 'bluebird';
import * as jestRunner from '../lib/spawn-runner';
import { textEditor } from './fixtures';
import { provideTester } from '../lib/tester-jest';

describe('tester-jest', () => {
  it('should provide tester name', () => {
    expect(provideTester().name).toEqual('tester-jest');
  });

  it('should provide tester scopes', () => {
    const scopes = '**.spec.js';
    atom.config.set('tester-jest.scopes', scopes);
    expect(provideTester().scopes).toEqual(scopes);
  });

  it('should provide test function and run project test if editor is empty', () => {
    spyOn(jestRunner, 'run').andCallFake(() => Promise.resolve({ messages: [], output: '' }));
    const result = provideTester().test();
    expect(jestRunner.run).toHaveBeenCalledWith(undefined, undefined);
    expect(result).toEqual(Promise.resolve({ messages: [], output: '' }));
  });

  it('should provide test function and call "spawn-runner.run" if editor is not empty', () => {
    spyOn(jestRunner, 'run').andCallFake(() => Promise.resolve({ messages: [], output: '' }));
    const result = provideTester().test(textEditor);
    expect(jestRunner.run).toHaveBeenCalledWith(textEditor, undefined);
    expect(result).toEqual(Promise.resolve({ messages: [], output: '' }));
  });

  it('should provide stop function and call "spawn-runner.stop"', () => {
    spyOn(jestRunner, 'stop');
    provideTester().stop(textEditor);
    expect(jestRunner.stop).toHaveBeenCalled();
  });
});
