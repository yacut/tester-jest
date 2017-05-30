'use babel';

/* @flow*/
import { join } from 'path';
import { homedir } from 'os';

export const pathToFile = join(homedir(), 'some/file');

export const assertionResults = [{
  name: 'name',
  status: 'failed',
  title: 'test',
  failureMessages: ['Error'],
}];

export const testResults = [
  {
    assertionResults,
    endTime: 1492939947235,
    message: '',
    name: pathToFile,
    startTime: 1492939947235,
    status: 'failed',
    summary: '',
  },
  {
    assertionResults,
    endTime: 1492939947235,
    message: '',
    name: pathToFile,
    startTime: 1492939947235,
    status: 'failed',
    summary: '',
  },
];

export const testLocations = [{
  file: pathToFile,
  name: 'test',
  start: {
    line: 1,
    column: 0,
  },
  end: {
    line: 1,
    column: 0,
  },
}];

export const emptyTextEditor = {
  getText() {
    return '';
  },
};

export const textEditor = {
  getPath() {
    return pathToFile;
  },
  getURI() {
    return pathToFile;
  },
  getText() {
    return 'text';
  },
  scan(regex/* :string|RegExp*/, callback/* :()=>void*/) {
    callback();
  },
  onDidDestroy(destroy/* :any*/) {
    this.destroy = destroy;
    return {
      dispose() {},
    };
  },
  onDidSave(save/* :any*/) {
    this.save = save;
    return {
      dispose() {
        return undefined;
      },
    };
  },
};
