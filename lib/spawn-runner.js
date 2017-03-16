'use babel';

/* @flow */
import * as fs from 'fs';
import * as path from 'path';
import _ from 'lodash';
import os from 'os';
import { BufferedProcess } from 'atom';
/* flow-include
import type { TextEditor } from 'atom'
*/

export function run(textEditor/* :TextEditor*/) {
  return new Promise((resolve) => {
    let processOutput = `\u001b[1mTester Jest\u001b[0m${os.EOL}`;
    const fileName = textEditor.getPath();
    let outputFilePath = fileName;
    const projectPath = atom.project.relativizePath(fileName)[0];
    let cwd = projectPath;
    if (!(cwd)) {
      cwd = path.dirname(fileName);
    }
    const fileModified = textEditor.isModified();
    if (fileModified) {
      outputFilePath = `${path.dirname(fileName)}/.${path.basename(fileName)}`;
      fs.writeFileSync(outputFilePath, textEditor.getText());
    }
    function parseReporterOutput(outputString) {
      let output = '';
      const messages = [];
      _.forEach(_.split(outputString, os.EOL), (line) => {
        try {
          const summary = JSON.parse(line);
          if (_.has(summary, 'testResults[0].assertionResults') && summary.testResults[0].assertionResults.length > 0) {
            _.forEach(summary.testResults[0].assertionResults, (testResult) => {
              textEditor.scan(new RegExp(testResult.title.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&')), (scanResult) => {
                if (testResult.status === 'pending') {
                  testResult.status = 'skipped';
                }
                messages.push({
                  state: testResult.status,
                  title: testResult.title,
                  error: {
                    name: 'Failure Messages',
                    message: _.toString(_.get(testResult, 'failureMessages')),
                  },
                  duration: _.subtract(_.get(summary, 'testResults[0].endTime') - _.get(summary, 'testResults[0].startTime')),
                  lineNumber: scanResult.row,
                  filePath: outputFilePath,
                });
              });
            });
          }
        } catch (e) {
          output += line.toString() + os.EOL;
        }
      });
      return { messages, output };
    }
    const userConfigArgs = atom.config.get('tester-jest.args');
    const prohibitedArgs = ['--json', '--outputFile', '--watch', '--watchAll', '--watchman'];
    const removedArgs = _.remove(userConfigArgs, a => _.indexOf(prohibitedArgs, a) !== -1);
    if (removedArgs && removedArgs.length > 0) {
      atom.notifications.addWarning(`Tester: The args "${_.toString(removedArgs)}" are not allowed and removed from command.`);
    }
    const args = _.union(userConfigArgs, ['--json', outputFilePath]);
    const env = Object.create(process.env);
    env.NODE_ENV = atom.config.get('tester-jest.nodeEnv');
    const options = { cwd, env };
    let jestBinary = atom.config.get('tester-jest.binaryPath');
    const jestBinaryProject = `${cwd}/node_modules/.bin/jest`;
    const jestBinaryPackage = `${atom.packages.resolvePackagePath('tester-jest')}/node_modules/.bin/jest`;
    if (!jestBinary) {
      jestBinary = fs.existsSync(jestBinaryProject) ? jestBinaryProject : jestBinaryPackage;
    }
    const command = jestBinary;
    processOutput += `\u001b[1mcommand:\u001b[0m ${command} ${args.join(' ')}${os.EOL}`;
    processOutput += `\u001b[1mcwd:\u001b[0m ${cwd}${os.EOL}`;
    const stdout = data => processOutput += data;
    const stderr = data => processOutput += data;
    const exit = () => {
      if (fileModified) {
        fs.unlink(outputFilePath);
      }
      this.bufferedProcess = null;
      resolve(parseReporterOutput(processOutput));
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
