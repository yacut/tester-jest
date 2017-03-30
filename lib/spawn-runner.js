'use babel';

/* @flow */
import { existsSync, readFile } from 'fs';
import { basename, dirname, join } from 'path';
import { has, forEach, find, map, get, indexOf, remove, subtract, union } from 'lodash';
import { EOL, tmpdir } from 'os';
import { BufferedProcess } from 'atom';
import { parse } from 'babylon';
/* flow-include
import type { TextEditor } from 'atom'
*/
const ERROR_TEXT = 'Error: ';

function parseReporterOutput(data/* :string*/, filePath/* :string*/, textEditor /* :TextEditor*/, testLocations/* :Array<{title: string, line: number}>*/) {
  return new Promise((res, rej) => {
    let dataJSON;
    try {
      dataJSON = JSON.parse(data);
    } catch (error) {
      atom.notifications.addError('Tester Jest: Could not parse data to JSON.');
      return rej(error);
    }
    const hasAssertionResults = has(dataJSON, 'testResults[0].assertionResults') && dataJSON.testResults[0].assertionResults.length > 0;
    const messages = [];
    forEach(testLocations, (testLocation) => {
      let message;
      const testResult = find(get(dataJSON, 'testResults[0].assertionResults'), t => t.title === testLocation.title);
      if (hasAssertionResults && testResult) {
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
        message = {
          state: testResult.status,
          title: testResult.title,
          error: {
            name: '',
            message: errorMessage,
          },
          duration: subtract(get(dataJSON, 'testResults[0].endTime') - get(dataJSON, 'testResults[0].startTime')),
          lineNumber: testLocation.line - 1,
          filePath,
        };
      } else {
        message = {
          state: 'unknown',
          title: testLocation.title,
          error: { name: '', message: '' },
          duration: 0,
          lineNumber: testLocation.line - 1,
          filePath,
        };
      }
      messages.push(message);
    });
    return res(messages);
  });
}

function findTestCases(code/* :string*/) {
  const testLocations = [];
  const options = { plugins: ['*'], sourceType: 'module', locations: true };
  const result = parse(code, options);
  const testFunctionNames = ['test', 'test.only', 'test.skip', 'it', 'it.only', 'it.skip'];
  map(result.body, (node) => {
    const functionName = get(node, 'expression.callee.name');
    if (get(node, 'expression.type') === 'CallExpression' &&
      testFunctionNames.indexOf(functionName) > -1) {
      const title = get(node, 'expression.arguments[0].value');
      const line = get(node, 'loc.start.line');
      testLocations.push({ title, line });
    }
  });
  return testLocations;
}

export function run(textEditor/* :TextEditor*/) {
  return new Promise((resolve) => {
    let processOutput = `\u001b[1mTester Jest\u001b[0m${EOL}`;
    const filePath = textEditor.getPath();
    const testLocations = findTestCases(textEditor.getText());
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
      atom.notifications.addWarning(`Tester: The args "${toString(removedArgs)}" are not allowed and removed from command.`);
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
    const jestBinaryPackage = `${atom.packages.resolvePackagePath('tester-jest')}/node_modules/.bin/jest`;
    let command = '';
    if (jestBinary) {
      const runtimeExecutable = jestBinary;
      const parameters = runtimeExecutable.split(' ');
      command = parameters.shift();
      args = union(parameters, args);
    } else {
      jestBinary = existsSync(jestBinaryProject) ? jestBinaryProject : jestBinaryPackage;
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
    const exit = () => {
      this.bufferedProcess = null;
      readFile(jsonOutputFilePath, 'utf8', (error, data) => {
        if (error) {
          processOutput += `${EOL}JSON report not found at ${this.outputPath}`;
          resolve({ messages: [], output: processOutput });
        } else {
          parseReporterOutput(data, filePath, textEditor, testLocations)
          .then(messages => resolve({ messages, output: processOutput }))
          .catch(reason => resolve({ messages: [], output: processOutput + EOL + reason }));
        }
      });
    };
    this.bufferedProcess = new BufferedProcess({ command, args, options, stdout, stderr, exit });

    this.bufferedProcess.onWillThrowError(() => {
      atom.notifications.addError('Tester is unable to locate the jest command. Please ensure process.env.PATH can access jest.');
    });
  });
}

export function stop() {
  if (this.bufferedProcess) {
    this.bufferedProcess.kill();
    this.bufferedProcess = null;
  }
}
