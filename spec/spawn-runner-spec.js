'use babel';

/* @flow */

import Promise from 'bluebird';
import {
  getJestError,
  getFormattedTesterMessage,
  getMessagesFromAssertionResults,
  getMessagesFromTestLocations,
} from '../lib/spawn-runner';
import { textEditor, pathToFile, assertionResults, testLocations } from './fixtures';

describe('spawn-runner', () => {
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
});
