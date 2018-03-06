'use babel';

/* @flow */
import fs from 'fs';
import type { TextEditor } from 'atom';
import * as jestRunner from './spawn-runner';

let _hasProjectJest;

export const hasProjectJest = () => _hasProjectJest;

export function activate() {
  require('atom-package-deps').install();

  _hasProjectJest = atom.project.rootDirectories
    .map(dir => dir.path.concat('/package.json'))
    .filter((pkgFile) => {
      try {
        fs.accessSync(pkgFile);
        return true;
      } catch (error) {
        return false;
      }
    })
    // eslint-disable-next-line import/no-dynamic-require
    .map(pkg => Object.keys(require(pkg).devDependencies || require(pkg).dependencies || {})
      .find(pkgName => pkgName === 'jest'))
    .reduce((output, jest) => !!jest, false);
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
      if (!this._hasProjectJest) return [];
      // Note, a Promise may be returned as well!
      return jestRunner.run(textEditor, additionalArgs);
    },
    stop() {
      jestRunner.stop();
    },
    _hasProjectJest,
  };
}
