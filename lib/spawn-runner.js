'use babel';

/* @flow */
import Promise from 'bluebird';
import { existsSync, readFile, unlink } from 'fs';
import { basename, dirname, join, resolve as pathResolve } from 'path';
import { EOL, tmpdir } from 'os';
import { BufferedProcess } from 'atom';
import { parse as babylonParse } from 'jest-editor-support';
import { parse as typescriptParse } from 'jest-test-typescript-parser';
import type { TextEditor } from 'atom';

const ERROR_TEXT = 'Error: ';
let shouldUpdateSnapshot = false;
let isSnapshotNotificationActive = false;

type assertionResult = {
  status: 'passed'|'failed'|'skipped'|'unknown',
  title: string,
  name: string,
  failureMessages: Array<string>
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

const readFileAsync = Promise.promisify(readFile);
const unlinkAsync = Promise.promisify(unlink);

export function convertPathToPattern(path :string, platform :string = process.platform) :string {
  if (platform.match(/^win/)) {
    return path.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
  }
  return path;
}

export function removeBadArgs(args :?Array<string>) {
  if (!args) {
    return [];
  }

  const prohibitedArgs = ['--json', '--outputFile', '--watch', '--watchAll', '--watchman'];
  const clearArgs = [];
  args.forEach((arg) => {
    const index = prohibitedArgs.indexOf(arg);
    if (index === -1) {
      clearArgs.push(arg);
    }
  });
  return clearArgs;
}

export function getJestError(result :assertionResult) :string {
  let errorMessage = '';
  if (result && result.failureMessages && result.failureMessages.length > 0) {
    const content = result.failureMessages[0];
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
  const filePath = textEditor.getPath();
  return Promise.reduce(assertionResults, (messages, testResult) =>
    new Promise((resolve) => {
      textEditor.scan(new RegExp(testResult.title.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')),
      (scanResult) => {
        if (testResult.status === 'pending') {
          testResult.status = 'skipped';
        }
        const errorMessage = getJestError(testResult);
        const state = testResult.status;
        const title = testResult.title;
        const lineNumber = scanResult.row;
        messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
      });
      resolve(messages);
    }), []);
}

export function getMessagesFromTestLocations(textEditor :TextEditor,
  testLocations :?Array<itBlock>,
  assertionResults :Array<assertionResult>,
  duration :number) :Promise<Array<message>> {
  const filePath = textEditor.getPath();
  return Promise.reduce(testLocations, (messages, testLocation) => {
    const testResult = assertionResults.find(ar => ar.title === testLocation.name);
    if (assertionResults && assertionResults.length > 0 && testResult) {
      if (testResult.status === 'pending') {
        testResult.status = 'skipped';
      }
      const errorMessage = getJestError(testResult);
      const state = testResult.status;
      const title = testResult.title || '';
      const lineNumber = testLocation.start.line - 1;
      messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
    } else {
      const state = 'unknown';
      const title = testLocation.name || '';
      const lineNumber = testLocation.start.line - 1;
      const errorMessage = '';
      messages.push(getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, filePath));
    }
    return messages;
  }, []);
}

export function getMessagesFromTestResults(testResults :Array<Object>) {
  return Promise.map(testResults, testResult =>
    Promise.map(testResult.assertionResults, (result) => {
      if (result.status === 'pending') {
        result.status = 'skipped';
      }
      const errorMessage = getJestError(result);
      const state = result.status;
      const title = result.title;
      const lineNumber = 0;
      const duration = (testResult.endTime || 0) - (testResult.startTime || 0);
      return getFormattedTesterMessage(state, title, errorMessage, duration, lineNumber, testResult.name);
    }))
    .reduce((messages, result) => result.concat(messages), []);
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
  let duration = 0;
  if (dataJSON && dataJSON.testResults && dataJSON.testResults.length > 0) {
    duration = (dataJSON.testResults[0].endTime || 0) - (dataJSON.testResults[0].startTime || 0);
    if (filePath && textEditor) {
      const assertionResults = dataJSON.testResults[0].assertionResults;
      if (testLocations && testLocations.length > 0) {
        messages = await getMessagesFromTestLocations(textEditor, testLocations, assertionResults, duration);
      } else if (assertionResults) {
        messages = await getMessagesFromAssertionResults(textEditor, assertionResults, duration);
      }
    } else {
      // Project test
      messages = await getMessagesFromTestResults(dataJSON.testResults);
    }
  }
  if (!messages.length) {
    messages.push(getFormattedTesterMessage('unknown', 'No results', output, duration, 0, filePath));
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

    const userConfigArgs = removeBadArgs(atom.config.get('tester-jest.args'));
    const additionalArgsArray = (additionalArgs && additionalArgs.trim()) ?
      removeBadArgs(additionalArgs.trim().split(' ')) : [];

    const belowEighteen = atom.config.get('tester-jest.jestMajorVersion') < 18;
    const outputArg = belowEighteen ? '--jsonOutputFile' : '--outputFile';
    const defaultArgs = ['--json', outputArg, jsonOutputFilePath];
    if (filePath) {
      defaultArgs.push(convertPathToPattern(filePath));
    }
    if (shouldUpdateSnapshot) {
      defaultArgs.push('--updateSnapshot');
    }
    let args = userConfigArgs.concat(additionalArgsArray, defaultArgs);
    const env = Object.create(process.env);
    // Jest NODE_ENV default is 'test'
    // https://github.com/facebook/jest/blob/master/packages/jest-cli/bin/jest.js#L13
    env.NODE_ENV = atom.config.get('tester-jest.nodeEnv');
    // To use our own commands in create-react, we need to tell the command that
    // we're in a CI environment, or it will always append --watch
    env.CI = atom.config.get('tester-jest.ciEnv');
    // set NODE_PATH otherwise will set atom own path
    // https://github.com/atom/atom/blob/master/src/initialize-application-window.coffee#L71
    env.NODE_PATH = cwd;
    const options = { cwd, env };
    let jestBinary = atom.config.get('tester-jest.binaryPath');
    let command = '';
    if (jestBinary) {
      const runtimeExecutable = jestBinary;
      const parameters = runtimeExecutable.split(' ');
      command = parameters.shift();
      args = parameters.concat(args);
    } else {
      const jestBinaryProject = pathResolve(cwd, './node_modules/.bin/jest');
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
      shouldUpdateSnapshot = false;
      try {
        const testLocations = await getTestLocations(filePath);
        const jestJsonResults = await readFileAsync(jsonOutputFilePath, 'utf8');
        await unlinkAsync(jsonOutputFilePath);
        resolve(await parseReporterOutput(jestJsonResults, filePath, textEditor, testLocations, processOutput));
        if (!isSnapshotNotificationActive &&
          processOutput.includes('Inspect your code changes or re-run with `-u` to update them.')) {
          isSnapshotNotificationActive = true;
          const notification = atom.notifications.addInfo('Tester Jest', {
            detail: 'Do you want update the snapshot?',
            icon: 'beaker',
            dismissable: true,
            buttons: [
              {
                text: 'Yes',
                onDidClick: () => {
                  shouldUpdateSnapshot = true;
                  atom.commands.dispatch(atom.views.getView(atom.workspace.getActivePaneItem()), 'tester:test-last');
                  isSnapshotNotificationActive = false;
                  notification.dismiss();
                },
              },
              {
                text: 'No',
                onDidClick: () => {
                  shouldUpdateSnapshot = false;
                  isSnapshotNotificationActive = false;
                  notification.dismiss();
                },
              },
            ],
          });
        }
      } catch (error) {
        processOutput += error.toString();
        resolve({
          messages: getFormattedTesterMessage('unknown', 'No results', error, 0, 0, filePath),
          output: processOutput,
        });
      }
    };
    this.bufferedProcess = new BufferedProcess({ command, args, options, stdout, stderr, exit });

    this.bufferedProcess.onWillThrowError((error = { message: '' }) => {
      const errorPopup = 'Tester is unable to locate the jest command. Please ensure process.env.PATH can access jest.';
      atom.notifications.addError(errorPopup);
      resolve({
        messages: getFormattedTesterMessage('unknown', 'No results', error.message, 0, 0, filePath),
        output: errorPopup + error.message,
      });
    });
  });
}

export function stop() {
  if (this.bufferedProcess) {
    this.bufferedProcess.kill();
    this.bufferedProcess = null;
  }
}
