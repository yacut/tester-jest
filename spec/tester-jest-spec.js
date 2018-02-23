'use babel';

/* @flow */
import Promise from 'bluebird';
import mockRequire from 'mock-require';
import mockFs from 'mock-fs';
import * as jestRunner from '../lib/spawn-runner';
import { textEditor } from './fixtures';
import { provideTester, activate, hasProjectJest } from '../lib/tester-jest';

describe('tester-jest', () => {
  describe('activate', () => {
    beforeEach(() => {
      mockRequire('atom-package-deps', { install() {} });
    });

    it('should set hasProjectJest to false if jest isn\'t provided in package.json', () => {
      atom.project.rootDirectories
        .map(dir => dir.path.concat('/package.json'))
        .forEach((path) => {
          mockRequire(path, { devDependencies: { nojest: '1.0' } });
          mockFs({ [path]: {} });
        });

      activate();

      expect(hasProjectJest()).toEqual(false);
    });

    it('should set hasProjectJest to true if jest is provided in package.json', () => {
      atom.project.rootDirectories
        .map(dir => dir.path.concat('/package.json'))
        .forEach((path) => {
          mockRequire(path, { devDependencies: { jest: '1.0' } });
          mockFs({ [path]: {} });
        });

      activate();

      expect(hasProjectJest()).toEqual(true);
    });

    it('should set hasPorjectJest to true if jest is provided in package.json even if not in devDependencies', () => {
      atom.project.rootDirectories
        .map(dir => dir.path.concat('/package.json'))
        .forEach((path) => {
          mockRequire(path, { dependencies: { jest: '1.0' } });
          mockFs({ [path]: {} });
        });

      activate();

      expect(hasProjectJest()).toEqual(true);
    });
  });

  describe('provideTester', () => {
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
      const result = { ...provideTester(), _hasProjectJest: true }.test();
      expect(jestRunner.run).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(Promise.resolve({ messages: [], output: '' }));
    });

    it('should provide test function and call "spawn-runner.run" if editor is not empty', () => {
      spyOn(jestRunner, 'run').andCallFake(() => Promise.resolve({ messages: [], output: '' }));
      const result = { ...provideTester(), _hasProjectJest: true }.test(textEditor);
      expect(jestRunner.run).toHaveBeenCalledWith(textEditor, undefined);
      expect(result).toEqual(Promise.resolve({ messages: [], output: '' }));
    });

    it('should provide test function and not run project test if jest isn\'t provided', () => {
      spyOn(jestRunner, 'run');
      const result = { ...provideTester(), _hasProjectJest: false }.test();
      expect(jestRunner.run).not.toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual([]);
    });

    it('should provide stop function and call "spawn-runner.stop"', () => {
      spyOn(jestRunner, 'stop');
      provideTester().stop();
      expect(jestRunner.stop).toHaveBeenCalled();
    });
  });
});
