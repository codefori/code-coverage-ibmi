
const vscode = require(`vscode`);
const fs = require(`fs`);
const util = require(`util`);
const path = require(`path`);
const readFileAsync = util.promisify(fs.readFile);

const {instance, Field, CustomUI} = vscode.extensions.getExtension(`halcyontechltd.code-for-ibmi`).exports;

const CoverageTest = require(`../api/CoverageTest`);

const greenLine = vscode.window.createTextEditorDecorationType({
  backgroundColor: `rgba(55, 218, 1, 0.2)`,
  isWholeLine: true
});
const redLine = vscode.window.createTextEditorDecorationType({
  backgroundColor: `rgba(218, 1, 1, 0.2)`,
  isWholeLine: true
});

module.exports = class Coverage {
  /**
   * @param {vscode.ExtensionContext} context
   */
  constructor(context) {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;

    /** @type {{[path: string]: {runDecorations: vscode.DecorationOptions[], notrunDecorations: vscode.DecorationOptions[]}}} */
    this.coverageFiles = {};

    const myProvider = new (class  {
      async provideTextDocumentContent(uri) {
        const content = await readFileAsync(uri.path);
        return content.toString(`utf8`);
      }
    })();

    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(`coverageResult`, myProvider),

      vscode.window.onDidChangeVisibleTextEditors(editors => {
        //We need this to re-render coverage lines

        editors.forEach(editor => {
          if (editor.document.uri.scheme === `coverageResult`) {
            this.renderCoverage(editor);
          }
        })
      }),

      vscode.commands.registerCommand(`code-coverage-ibmi.refreshCoverageView`, async () => {
        this.refresh();
      }),

      vscode.commands.registerCommand(`code-coverage-ibmi.createNewCoverageTest`, async (memberNode) => {
        const connection = instance.getConnection();

        let defaults = {};

        if (connection) {
          if (memberNode) {
            const parts = memberNode.path.split(`/`);
            const baseName = parts[parts.length - 1];
            const lib = parts[parts.length - 3];

            const noExt = baseName.substr(0, baseName.lastIndexOf(`.`));

            defaults = {
              name: `Test ${lib}/${noExt}`,
              runCommand: `CALL ${lib}/${noExt}`,
              program: `${lib}/${noExt}`
            };
          }

          this.maintainTest(-1, defaults);
        } else
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

      vscode.commands.registerCommand(`code-coverage-ibmi.displayCoverageFile`, async (path, data) => {
        this.openCoverageFile(path, data);
      }),

    );
  }

  /**
   * Render coverage lines onto document
   * @param {vscode.TextEditor} editor 
   */
  renderCoverage(editor) {
    const docPath = editor.document.uri.path.toUpperCase();

    if (this.coverageFiles[docPath]) {
      const coverage = this.coverageFiles[docPath];
      editor.setDecorations(greenLine, coverage.runDecorations);
      editor.setDecorations(redLine, coverage.notrunDecorations);
    }
  }

  /**
   * Stores line decorations into coverageFiles
   * Also opens to coverage if an old version is open.
   * @param {string} coveragePath
   * @param {{activeLines: {[line: number]: boolean}[], lineString: string, signitures: string[], sourceCode: string[]}} coverage 
   */
  storeCoverage(coveragePath, coverage) {
    /** @type {vscode.DecorationOptions[]} */
    let runDecorations = [];

    /** @type {vscode.DecorationOptions[]} */
    let notrunDecorations = [];

    let lineNumber;
    for (const line in coverage.activeLines) {
      lineNumber = Number(line)-1;

      if (coverage.activeLines[line] === true) {
        runDecorations.push({
          range: new vscode.Range(lineNumber, 0, lineNumber, 100),
        })

      } else if (coverage.activeLines[line] === false) {
        notrunDecorations.push({
          range: new vscode.Range(lineNumber, 0, lineNumber, 100),
        })
      }
    }

    this.coverageFiles[coveragePath.toUpperCase()] = {
      runDecorations,
      notrunDecorations
    };

    const existingEditor = vscode.window.visibleTextEditors.find(editor => path.basename(editor.document.uri.path) === path.basename(coveragePath));
    if (existingEditor) this.openCoverageFile(coveragePath);
  }

  /**
   * Opens and stores line decorations into coverageFiles
   * @param {string} coveragePath
   */
  async openCoverageFile(coveragePath) {
    const existingEditor = vscode.window.visibleTextEditors.find(editor => path.basename(editor.document.uri.path) === path.basename(coveragePath));
    let column = (existingEditor ? existingEditor.viewColumn : undefined);

    const textDoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`coverageResult:` + coveragePath));
    const editor = await vscode.window.showTextDocument(textDoc, column);

    this.renderCoverage(editor);
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
   * @param {{name?: string, runCommand?: string, program?: string, bindingDirectory?: string}} defaults
   */
  async maintainTest(id, defaults = {}) {
    const config = instance.getConfig();
    let tests = config.get(`coverageTests`);

    let fields = {
      name: defaults.name || ``,
      runCommand: defaults.runCommand || `CALL LIB/PGM`,
      program: defaults.program || `LIB/PGM`,
      bindingDirectory: defaults.bindingDirectory || ``
    }

    if (id >= 0) {
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
    field.description = `The name of the program you want to be included in the coverage test. This usually the program you are calling in your coverage test. It is recommended the program has <code>DBGVIEW(*SOURCE)</code>.`
    field.default = fields.program;
    wizard.addField(field);

    field = new Field(`input`, `bindingDirectory`, `Binding directory`);
    field.description = `If you specify a binding directory, the coverage test will include the results for the service programs in that object if they are used by the program. You can leave this blank to not include them. Must be qualified object path (<code>LIB/OBJ</code>)`
    field.default = fields.bindingDirectory;
    wizard.addField(field);

    field = new Field(`submit`, `save`, `Save`);
    wizard.addField(field);

    const {panel, data} = await wizard.loadPage(`Coverage Test Setup`);

    if (data) {
      if (data.name.trim() !== ``) {
        panel.dispose();

        fields = data;

        if (id >= 0) {
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
   * @param {CoverageTestItem} [element] 
   * @returns {Promise<vscode.TreeItem[]>}
   */
  async getChildren(element) {
    const connection = instance.getConnection();

    /** @type {vscode.TreeItem[]} */
    let items = [];

    if (connection) {
      if (element) {

        const runningTest = new CoverageTest(element.test);
        const result = await runningTest.runConverage();

        result.forEach(test => this.storeCoverage(test.localPath, test.coverage));

        items = result.map(result => new CoverageFile(result));
      } else {
        const tests = await this.getTests();

        if (tests.length > 0) {
          items = tests.map(test => new CoverageTestItem(test));
        } else {
          items = [new vscode.TreeItem(`No coverage tests found.`)];
        }
      }

    } else {
      items = [new vscode.TreeItem(`Please connect to an IBM i and refresh.`)];
    }

    return items;
  }
}

class CoverageTestItem extends vscode.TreeItem {
  /**
   * @param {{name: string, runCommand: string, program: string}} data 
   */
  constructor(data) {
    super(data.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = `coverageTest`;

    this.test = data;
    this.tooltip = data.runCommand;

    this.iconPath = new vscode.ThemeIcon(`testing-run-icon`);
  }
}

class CoverageFile extends vscode.TreeItem {
  /**
   * @param {{path: string, coverage: {}}} info 
   */
  constructor(info) {
    const percentRan = info.coverage.percentRan;
    super(`${info.basename} (${percentRan}%)`, vscode.TreeItemCollapsibleState.None);

    this.contextValue = `coverageFile`;

    this.command = {
      command: `code-coverage-ibmi.displayCoverageFile`,
      title: `Display coverage`,
      arguments: [info.localPath, info.coverage]
    }

    let color;

    if (percentRan == 100) {
      color = `charts.green`;
    } else 
    if (percentRan > 50) {
      color = `list.warningForeground`;
    } else {
      color = `list.errorForeground`;
    }

    this.iconPath = new vscode.ThemeIcon(`file-code`, new vscode.ThemeColor(color));
  }
}