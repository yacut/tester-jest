'use babel';

/* @flow */

import {
  getJestError,
  getFormattedTesterMessage,
  getMessagesFromAssertionResults,
  getMessagesFromTestLocations,
  getMessagesFromTestResults,
  removeBadArgs,
  convertPathToPattern,
} from '../lib/spawn-runner';
import { textEditor, pathToFile, assertionResults, testLocations, testResults } from './fixtures';

describe('spawn-runner', () => {
  describe('removeBadArgs', () => {
    it('should return clear array with args', () => {
      expect(removeBadArgs(['--my-arg', '--watch'])).toEqual(['--my-arg']);
    });
  });

  describe('formatJestError', () => {
    it('should format jest error', () => {
      const jestError = 'Error: expect(received).toEqual(expected)\n\nExpected value to equal:\n  2\nReceived:\n  3\n' +
      '    at Object.<anonymous>.test (/github/tester-jest/sample/sum.spec.js:4:21)\n' +
      '    at Object.<anonymous> (/github/tester-jest/node_modules/jest-jasmine2/build/jasmine-async.js:42:32)\n' +
      '    at runTest (/github/tester-jest/node_modules/jest-cli/build/runTest.js:53:10)\n' +
      '    at promise.then (/github/tester-jest/node_modules/jest-cli/build/TestRunner.js:307:14)';
      const assertionResult = Object.assign({}, assertionResults[0]);
      assertionResult.failureMessages = [jestError];
      const formatedJestError = 'expect(received).toEqual(expected)\n\nExpected value to equal:\n  2\nReceived:\n  3';
      expect(getJestError(assertionResult)).toEqual(formatedJestError);
    });
  });

  describe('getFormattedTesterMessage', () => {
    it('should return formated tester message', () => {
      expect(getFormattedTesterMessage('passed', 'title', 'errorMessage', 0, 0, 'filePath'))
        .toEqual({
          state: 'passed',
          title: 'title',
          error: {
            name: '',
            message: 'errorMessage',
          },
          duration: 0,
          lineNumber: 0,
          filePath: 'filePath',
        });
    });
  });

  describe('getMessagesFromAssertionResults', () => {
    it('should return promise with tester messages', async () => {
      expect(await getMessagesFromAssertionResults(textEditor, assertionResults, 0))
        .toEqual([getFormattedTesterMessage('failed', 'test', 'Error', 0, 0, pathToFile)]);
    });
  });

  describe('getMessagesFromTestLocations', () => {
    it('should return promise with tester messages', async () => {
      expect(await getMessagesFromTestLocations(textEditor, testLocations, assertionResults, 0))
        .toEqual([getFormattedTesterMessage('failed', 'test', 'Error', 0, 0, pathToFile)]);
    });
  });

  describe('getMessagesFromTestResults', () => {
    it('should return promise with tester messages', async () => {
      expect(await getMessagesFromTestResults(testResults))
        .toEqual([
          getFormattedTesterMessage('failed', 'test', 'Error', 0, 0, pathToFile),
          getFormattedTesterMessage('failed', 'test', 'Error', 0, 0, pathToFile),
        ]);
    });
  });

  describe('convertPathToPattern', () => {
    it('should return pattern with unix path', () => {
      const path = '/path/to/spec/some.spec.js';
      const pattern = convertPathToPattern(path, 'unix');
      expect((new RegExp(pattern)).test(path)).toBe(true);
    });

    it('should return pattern with windows path', () => {
      const path = 'C:\\path\\to\\spec\\some.spec.js';
      const pattern = convertPathToPattern(path, 'win32');
      expect((new RegExp(pattern)).test(path)).toBe(true);
    });
  });
});
