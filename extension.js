// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require(`vscode`);

const basePlugin = vscode.extensions.getExtension(`halcyontechltd.code-for-ibmi`);

const coverageView = require(`./src/views/coverage`);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

function activate(context) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(`Congratulations, your extension "code-coverage-ibmi" is now active!`);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      `coverageView`,
      new coverageView(context)
    ),
  );

}

// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
};