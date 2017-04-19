'use babel';

/* @flow */
import { existsSync, readFile } from 'fs';
import { basename, dirname, join } from 'path';
import { forEach, find, get, indexOf, remove, subtract, union } from 'lodash';
import { EOL, tmpdir } from 'os';
import { BufferedProcess } from 'atom';
import { parse as babylonParse } from 'jest-editor-support';
import { parse as typescriptParse } from 'jest-test-typescript-parser';
import type { TextEditor } from 'atom';

const ERROR_TEXT = 'Error: ';

type assertionResult = {
  state: 'passed'|'failed'|'skipped'|'unknown',
  title: string,
  name: string,
};

type itBlock = {
  file: string,
  name: string,
  start:{
    line: number,
    column: number
  },
  end:{
    line: number,
    column: number
  }
};

type TestState = 'passed'|'failed'|'skipped'|'unknown';

type message = {
  state: TestState,
  title: string,
  error: { name: string, message: string },
  duration?: number,
  lineNumber: number,
  filePath: string,
};

// eslint-disable-next-line arrow-parens
const wrapWithPromise = (wrappedFunction :Function) => (...args :any) => (
  new Promise((resolve, reject) => {
    wrappedFunction(...args, (err, result) => err ? reject(err) : resolve(result));
  })
);
const readFilePromise = wrapWithPromise(readFile);

export function formatJestError(content :string) :string {
  let errorMessage = '';
  if (content) {
    const messageMatch = content.match(/(^(.|\n)*?(?=\n\s*at\s.*\:\d*\:\d*))/);
    errorMessage = messageMatch ? messageMatch[0] : 'Error';
    if (errorMessage.startsWith(ERROR_TEXT)) {
      errorMessage = errorMessage.substr(ERROR_TEXT.length);
    }
  }
  return errorMessage;
}

export function getFormattedTesterMessage(state :TestState,
  title :string,
  errorMessage :string,
  duration :number,
  lineNumber :number,
  filePath :string) :message {
  return {
    state,
    title,
    error: {
      name: '',
      message: errorMessage,
    },
    duration,
    lineNumber,
    filePath,
  };
}

export function getMessagesFromAssertionResults(textEditor :TextEditor,
  assertionResults :Array<assertionResult>,
  duration :number) :Promise<Array<message>> {
  return new Promise((resolve) => {
    const messages = [];
    const filePath = textEditor.getPath();
    forEach(assertionResults, (testResult) => {
      textEditor.scan(new RegExp(testResult.title.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')),
        (scanResult) => {
          if (testResult.status === 'pending') {
            testResult.status = 'skipped';
          }
          const errorMessage = formatJestError(get(testResult, 'failureMessages[0]'));
          const state = testResult.status;
          const title = testResult.title;
          const lineNumber = scanResult.row;
          messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
        });
    });
    resolve(messages);
  });
}

export function getMessagesFromTestLocations(textEditor :TextEditor,
  testLocations :?Array<itBlock>,
  assertionResults :Array<assertionResult>,
  duration :number) :Promise<Array<message>> {
  return new Promise((resolve) => {
    const messages = [];
    const filePath = textEditor.getPath();
    forEach(testLocations, (testLocation) => {
      const testResult = find(assertionResults, t => t.title === testLocation.name);
      if (assertionResults && assertionResults.length > 0 && testResult) {
        if (testResult.status === 'pending') {
          testResult.status = 'skipped';
        }
        let errorMessage = '';
        const content = get(testResult, 'failureMessages[0]');
        if (content) {
          const messageMatch = content.match(/(^(.|\n)*?(?=\n\s*at\s.*\:\d*\:\d*))/);
          errorMessage = messageMatch ? messageMatch[0] : 'Error';
          if (errorMessage.startsWith(ERROR_TEXT)) {
            errorMessage = errorMessage.substr(ERROR_TEXT.length);
          }
        }
        const state = testResult.status;
        const title = testResult.title;
        const lineNumber = testLocation.start.line - 1;
        messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
      } else {
        const state = 'unknown';
        const title = testLocation.title;
        const lineNumber = testLocation.start.line - 1;
        const errorMessage = '';
        messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
      }
    });
    resolve(messages);
  });
}

export function getMessagesFromTestResults(testResults :Array<Object>) {
  return new Promise((resolve) => {
    const messages = [];
    forEach(testResults, (testResult) => {
      const filePath = testResult.name;
      forEach(testResult.assertionResults, (result) => {
        if (result.status === 'pending') {
          result.status = 'skipped';
        }
        let errorMessage = '';
        const content = get(result, 'failureMessages[0]');
        if (content) {
          const messageMatch = content.match(/(^(.|\n)*?(?=\n\s*at\s.*\:\d*\:\d*))/);
          errorMessage = messageMatch ? messageMatch[0] : 'Error';
          if (errorMessage.startsWith(ERROR_TEXT)) {
            errorMessage = errorMessage.substr(ERROR_TEXT.length);
          }
        }
        const state = result.status;
        const title = result.title;
        const lineNumber = 0;
        const duration = subtract(get(testResult, 'endTime') - get(testResult, 'startTime'));
        messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
      });
    });
    resolve(messages);
  });
}

export async function parseReporterOutput(data :string,
  filePath :string,
  textEditor :TextEditor,
  testLocations :?Array<itBlock>,
  output : string) :Promise<{messages: Array<message>, output: string}> {
  let messages = [];
  let dataJSON;
  try {
    dataJSON = await JSON.parse(data);
  } catch (error) {
    atom.notifications.addError('Tester Jest: Could not parse data to JSON.');
  }
  const duration = subtract(get(dataJSON, 'testResults[0].endTime') - get(dataJSON, 'testResults[0].startTime'));
  const processError = get(dataJSON, 'testResults[0].message');
  if (filePath && textEditor) {
    const assertionResults = get(dataJSON, 'testResults[0].assertionResults');

    if (testLocations && testLocations.length > 0) {
      messages = await getMessagesFromTestLocations(textEditor, testLocations, assertionResults, duration);
    } else if (assertionResults) {
      messages = await getMessagesFromAssertionResults(textEditor, assertionResults, duration);
    }
  } else {
    // Project test
    const testResults = get(dataJSON, 'testResults');
    if (testResults && testResults.length > 0) {
      messages = await getMessagesFromTestResults(testResults);
    }
  }
  if (!messages.length) {
    messages.push(getFormattedTesterMessage('unknown', 'No results', processError, duration, 0, filePath));
  }
  return { messages, output };
}

export async function getTestLocations(filePath :string) :Promise<?Array<itBlock>> {
  if (!filePath) {
    return Promise.resolve(null);
  }
  const isTypeScript = filePath.match(/.(ts|tsx)$/);
  const parser = isTypeScript ? typescriptParse : babylonParse;
  try {
    const parseResults :{itBlocks:Array<itBlock>} = await parser(filePath);
    return parseResults.itBlocks;
  } catch (e) {
    console.warn('Tester Jest: Failed to parse with babel.', e);
  }
}

export function run(textEditor :?TextEditor, additionalArgs :?string) {
  return new Promise((resolve) => {
    let processOutput = `\u001b[1mTester Jest\u001b[0m${EOL}`;
    const filePath = textEditor ? textEditor.getPath() : '';
    const projectPath = filePath ? atom.project.relativizePath(filePath)[0] : atom.project.getPaths()[0];

    let cwd = projectPath;
    if (!(cwd)) {
      cwd = dirname(filePath);
    }
    const jsonOutputFilePath = join(tmpdir(),
      `tester-jest_${filePath ? basename(filePath) : basename(projectPath)}.json`);

    const userConfigArgs = atom.config.get('tester-jest.args');
    const prohibitedArgs = ['--json', '--outputFile', '--watch', '--watchAll', '--watchman'];
    const removedArgs = remove(userConfigArgs, a => indexOf(prohibitedArgs, a) !== -1);
    const additionalArgsArray = (additionalArgs && additionalArgs.trim()) ? additionalArgs.trim().split(' ') : [];
    remove(additionalArgsArray, a => indexOf(prohibitedArgs, a) !== -1);
    if (removedArgs && removedArgs.length > 0) {
      const warning = `Tester: The args "${toString(removedArgs)}" are not allowed and removed from command.`;
      atom.notifications.addWarning(warning);
    }
    const belowEighteen = atom.config.get('tester-jest.jestMajorVersion') < 18;
    const outputArg = belowEighteen ? '--jsonOutputFile' : '--outputFile';
    const defaultArgs = ['--json', outputArg, jsonOutputFilePath];
    if (filePath) {
      defaultArgs.push(filePath);
    }
    let args = union(userConfigArgs, additionalArgsArray, defaultArgs);
    const env = Object.create(process.env);
    // Jest NODE_ENV default is 'test'
    // https://github.com/facebook/jest/blob/master/packages/jest-cli/bin/jest.js#L13
    env.NODE_ENV = atom.config.get('tester-jest.nodeEnv');
    // To use our own commands in create-react, we need to tell the command that
    // we're in a CI environment, or it will always append --watch
    env.CI = 'true';
    // set NODE_PATH otherwise will set atom own path
    // https://github.com/atom/atom/blob/master/src/initialize-application-window.coffee#L71
    env.NODE_PATH = cwd;
    const options = { cwd, env };
    let jestBinary = atom.config.get('tester-jest.binaryPath');
    const jestBinaryProject = `${cwd}/node_modules/.bin/jest`;
    let command = '';
    if (jestBinary) {
      const runtimeExecutable = jestBinary;
      const parameters = runtimeExecutable.split(' ');
      command = parameters.shift();
      args = union(parameters, args);
    } else {
      jestBinary = existsSync(jestBinaryProject) ? jestBinaryProject : 'jest';
      command = jestBinary;
    }
    processOutput += `\u001b[1mcommand:\u001b[0m ${command} ${args.join(' ')}${EOL}`;
    processOutput += `\u001b[1mcwd:\u001b[0m ${cwd}${EOL}`;
    const stdout = (data) => {
      if (!data.startsWith('Test results written to:')) {
        processOutput += data;
      }
    };
    const stderr = data => processOutput += data;
    const exit = async () => {
      this.bufferedProcess = null;
      try {
        const testLocations = await getTestLocations(filePath);
        const jestJsonResults = await readFilePromise(jsonOutputFilePath, 'utf8');
        resolve(await parseReporterOutput(jestJsonResults, filePath, textEditor, testLocations, processOutput));
      } catch (error) {
        resolve({ messages: getFormattedTesterMessage('unknown', 'No results', error, 0, 0, filePath), output: error });
      }
    };
    this.bufferedProcess = new BufferedProcess({ command, args, options, stdout, stderr, exit });

    this.bufferedProcess.onWillThrowError(() => {
      const error = 'Tester is unable to locate the jest command. Please ensure process.env.PATH can access jest.';
      atom.notifications.addError(error);
    });
  });
}

export function stop() {
  if (this.bufferedProcess) {
    this.bufferedProcess.kill();
    this.bufferedProcess = null;
  }
}
