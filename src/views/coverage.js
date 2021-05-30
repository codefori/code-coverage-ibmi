
const vscode = require(`vscode`);

const {instance, Field, CustomUI} = vscode.extensions.getExtension(`halcyontechltd.code-for-ibmi`).exports;

module.exports = class Coverage {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;

    context.subscriptions.push(
      vscode.commands.registerCommand(`code-coverage-ibmi.refreshCoverageView`, async () => {
        this.refresh();
      }),

      vscode.commands.registerCommand(`code-coverage-ibmi.createNewCoverageTest`, async () => {
        const connection = instance.getConnection();

        if (connection)
          this.maintainTest(-1);
        else
          vscode.window.showInformationMessage(`You cannot make a Coverage Test while you are not connected to a remote system.`);
      }),

      vscode.commands.registerCommand(`code-coverage-ibmi.deleteCoverageTest`, async (node) => {
        if (node) {
          this.deleteTest(node.test.id);
        }
      }),

      vscode.commands.registerCommand(`code-coverage-ibmi.editCoverageTest`, async (node) => {
        if (node) {
          this.maintainTest(node.test.id);
        }
      }),
    );

    instance.on(`connected`, () => {
      this.refresh();
    });
  }

  /**
   * @returns {Promise<{name: string, runCommand: string, program: string}[]>}
   */
  async getTests() {
    const config = instance.getConfig();
    let tests = config.get(`coverageTests`);

    if (!tests) {
      tests = [];
      await config.set(`coverageTests`, tests);
    } else {
      tests.forEach((test, index) => {
        test.id = index;
      });
    }

    return tests;
  }

  async deleteTest(id) {
    const config = instance.getConfig();
    let tests = config.get(`coverageTests`);

    if (tests[id]) {
      tests.splice(id, 1);

      config.set(`coverageTests`, tests);
      this.refresh();
    }
  }

  /**
   * Load and display the UI to create/edit a coverage test
   * @param {number|-1} id Test ID
   */
  async maintainTest(id) {
    const config = instance.getConfig();
    let tests = config.get(`coverageTests`);

    let fields = {
      name: ``,
      runCommand: `CALL LIB/PGM`,
      program: `LIB/PGM`
    }

    if (id && id >= 0) {
      fields = tests[id];
    }

    let wizard = new CustomUI();
    let field;

    field = new Field(`input`, `name`, `Test name`);
    field.description = `The name for the coverage test.`;
    field.default = fields.name;
    wizard.addField(field);

    field = new Field(`input`, `runCommand`, `Command`);
    field.description = `The command that will be executed in the coverage test. This is usually calling the program you want to run the test against.`
    field.default = fields.runCommand;
    wizard.addField(field);

    field = new Field(`input`, `program`, `Program`);
    field.description = `The name of the program you want to be included in the coverage test. This usually the program you are calling in your coverage test.`
    field.default = fields.program;
    wizard.addField(field);

    field = new Field(`submit`, `save`, `Save`);
    wizard.addField(field);

    const {panel, data} = await wizard.loadPage(`Coverage Test Setup`);

    if (data) {
      if (data.name.trim() !== ``) {
        panel.dispose();

        fields = data;

        if (id && id >= 0) {
          tests[id] = fields;
        } else {
          tests.push(fields);
        }
    
        config.set(`coverageTests`, tests);
        this.refresh();
      }
    }
  }

  refresh() {
    this.emitter.fire();
  }

  /**
   * 
   * @param {vscode.TreeItem} element 
   * @returns {vscode.TreeItem}
   */
  getTreeItem(element) {
    return element;
  }

  /**
   * @param {vscode.TreeItem} [element] 
   * @returns {Promise<vscode.TreeItem[]>}
   */
  async getChildren(element) {
    const connection = instance.getConnection();

    /** @type {vscode.TreeItem[]} */
    let items = [];

    if (connection) {
      const tests = await this.getTests();

      if (tests.length > 0) {
        items = tests.map(test => new CoverageTest(test));
      } else {
        items = [new vscode.TreeItem(`No coverage tests found.`)];
      }

    } else {
      items = [new vscode.TreeItem(`Please connect to an IBM i and refresh.`)];
    }

    return items;
  }
}

class CoverageTest extends vscode.TreeItem {
  /**
   * @param {{name: string, runCommand: string, program: string}} data 
   */
  constructor(data) {
    super(data.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `coverageTest`;

    this.test = data;
    this.tooltip = data.runCommand;

    this.iconPath = new vscode.ThemeIcon(`testing-run-icon`);
  }
}