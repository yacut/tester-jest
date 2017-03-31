'use babel';

/* @flow */
import { existsSync, readFile } from 'fs';
import { basename, dirname, join } from 'path';
import { forEach, find, get, indexOf, remove, subtract, union } from 'lodash';
import { EOL, tmpdir } from 'os';
import { BufferedProcess } from 'atom';
import { parse as babylonParse } from 'jest-editor-support';
import { parse as typescriptParse } from 'jest-test-typescript-parser';

const ERROR_TEXT = 'Error: ';

/* flow-include
import type { TextEditor } from 'atom'

type assertionResult = {
  +state: 'passed'|'failed'|'skipped'|'unknown',
  +title: string,
  +name: string,
}

type itBlock = {
  title: string,
  line: number
}

type state = 'passed'|'failed'|'skipped'|'unknown'

type message = {
  state: state,
  title: string,
  error: { name: string, message: string },
  duration?: number,
  lineNumber: number,
  filePath: string,
}
*/

// eslint-disable-next-line arrow-parens
const wrapWithPromise = (wrappedFunction/* :Function*/) => (...args/* :any*/) => (
  new Promise((resolve, reject) => {
    wrappedFunction(...args, (err, result) => err ? reject(err) : resolve(result));
  })
);
const readFilePromise = wrapWithPromise(readFile);

function formatJestError(content/* :string*/)/* :string*/ {
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

function getFormattedTesterMessage(state/* :state*/,
  title/* :string*/,
  errorMessage/* :string*/,
  duration/* :number*/,
  lineNumber/* :number*/,
  filePath/* :string*/)/* :message*/ {
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

function getMessagesFromAssertionResults(textEditor/* :TextEditor*/,
  assertionResults/* :Array<assertionResult>*/,
  duration/* ?:number*/)/* :Promise<Array<message>>*/ {
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

function getMessagesFromTestLocations(textEditor/* :TextEditor*/,
  testLocations/* :?Array<itBlock>*/,
  assertionResults/* :Array<assertionResult>*/,
  duration/* ?:number*/)/* :Promise<Array<message>>*/ {
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

async function parseReporterOutput(data/* :string*/,
  filePath/* :string*/,
  textEditor /* :TextEditor*/,
  testLocations/* :?Array<itBlock>*/,
  output/* : string*/)/* :Promise<{messages: Array<message>, output: string}>*/ {
  let messages = [];
  let dataJSON;
  try {
    dataJSON = await JSON.parse(data);
  } catch (error) {
    atom.notifications.addError('Tester Jest: Could not parse data to JSON.');
    return { messages, output };
  }

  const assertionResults = get(dataJSON, 'testResults[0].assertionResults');
  const duration = subtract(get(dataJSON, 'testResults[0].endTime') - get(dataJSON, 'testResults[0].startTime'));
  if (testLocations && testLocations.length > 0) {
    messages = await getMessagesFromTestLocations(textEditor, testLocations, assertionResults, duration);
  } else if (assertionResults) {
    messages = await getMessagesFromAssertionResults(textEditor, assertionResults, duration);
  }
  return { messages, output };
}

async function getTestLocations(filePath/* :string */)/* :Promise<?Array<itBlock>>*/ {
  const isTypeScript = filePath.match(/.(ts|tsx)$/);
  const parser = isTypeScript ? typescriptParse : babylonParse;
  try {
    const parseResults/* :{itBlocks:Array<itBlock>}*/ = await parser(filePath);
    return parseResults.itBlocks;
  } catch (e) {
    console.error('Tester Jest: Parser error.', e);
  }
}

export function run(textEditor/* :TextEditor*/) {
  return new Promise((resolve) => {
    let processOutput = `\u001b[1mTester Jest\u001b[0m${EOL}`;
    const filePath = textEditor.getPath();
    const projectPath = atom.project.relativizePath(filePath)[0];
    let cwd = projectPath;
    if (!(cwd)) {
      cwd = dirname(filePath);
    }
    const jsonOutputFilePath = join(tmpdir(), `tester-jest_${basename(filePath)}.json`);

    const userConfigArgs = atom.config.get('tester-jest.args');
    const prohibitedArgs = ['--json', '--outputFile', '--watch', '--watchAll', '--watchman'];
    const removedArgs = remove(userConfigArgs, a => indexOf(prohibitedArgs, a) !== -1);
    if (removedArgs && removedArgs.length > 0) {
      const warning = `Tester: The args "${toString(removedArgs)}" are not allowed and removed from command.`;
      atom.notifications.addWarning(warning);
    }
    const belowEighteen = atom.config.get('tester-jest.jestMajorVersion') < 18;
    const outputArg = belowEighteen ? '--jsonOutputFile' : '--outputFile';
    let args = union(userConfigArgs, ['--json', outputArg, jsonOutputFilePath, filePath]);
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
        resolve({ messages: [], output: error });
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
