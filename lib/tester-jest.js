'use babel';

/* @flow */
import type { TextEditor } from 'atom';
import * as jestRunner from './spawn-runner';

export function activate() {
  require('atom-package-deps').install();
}

export function deactivate() {
  // Fill something here, optional
}

export function provideTester() {
  return {
    name: 'tester-jest',
    options: {},
    scopes: atom.config.get('tester-jest.scopes'),
    test(textEditor :TextEditor, additionalArgs :?string) {
      // Note, a Promise may be returned as well!
      return jestRunner.run(textEditor, additionalArgs);
    },
    stop() {
      jestRunner.stop();
    },
  };
}
