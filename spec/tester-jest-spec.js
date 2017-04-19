'use babel';

/* @flow */
import * as jestRunner from '../lib/spawn-runner';
import { emptyTextEditor, textEditor } from './fixtures';
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

  it('should provide test function and return empty messages/output if editor is empty', () => {
    expect(provideTester().test()).toEqual(Promise.resolve({ messages: [], output: '' }));
  });

  it('should provide test function and return empty message/output if editor has not text', () => {
    expect(provideTester().test(emptyTextEditor)).toEqual(Promise.resolve({ messages: [], output: '' }));
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
