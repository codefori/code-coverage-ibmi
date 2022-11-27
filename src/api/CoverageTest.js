
const vscode = require(`vscode`);
const cczip = require(`./cczip`);

const tmp = require(`tmp`);
const util = require(`util`);

const tmpFile = util.promisify(tmp.file);
const tmpDir = util.promisify(tmp.dir);

const {instance} = vscode.extensions.getExtension(`halcyontechltd.code-for-ibmi`).exports;

module.exports = class CoverageTest {
  /**
   * Create a coverage test
   * @param {{runCommand: string, program: string, bindingDirectory?: string}} data 
   */
  constructor(data) {
    this.command = data.runCommand;
    this.program = data.program;
    this.bindingDirectory = data.bindingDirectory;
  }

  /**
   * Returns a list of service programs from a binding directory
   * @param {string} path Path to binding directory
   * @returns {string[]}
   */
  static async getServicePrograms(path) {
    const content = instance.getContent();
    const config = instance.getConfig();

    const tempLib = config.tempLibrary;

    let TempName = `C` + new Date().getTime().toString();
    if (TempName.length > 10) TempName = TempName.substr(0, 10);

    const bnddir = await vscode.commands.executeCommand(`code-for-ibmi.runCommand`, {
      command: `DSPBNDDIR BNDDIR(${path}) OUTPUT(*OUTFILE) OUTFILE(${tempLib}/${TempName})`,
      environment: `ile`
    });

    if (bnddir.code === 0 || bnddir.code === null) {
      const results = await content.getTable(tempLib, TempName, TempName);

      if (results.length === 1) {
        if (results[0].BNOLNM.trim() === ``) {
          return []
        }
      }

      return results
        .filter(result => result.BNOBTP === `*SRVPGM`)
        .map(result => `(${result.BNOLNM}/${result.BNOBNM} ${result.BNOBTP} *ALL)`);
    } else {
      return [];
    }
  }

  async runConverage() {
    const outputZip = `/tmp/${new Date().getTime()}.cczip`;

    /** @type {ListItem[]} */
    let items = [];

    let moduleList = [`(${this.program} *PGM *ALL)`], promises = [];

    if (this.bindingDirectory) {
      if (this.bindingDirectory.trim().length > 0) {
        for (const path of this.bindingDirectory.split(`,`)) {
          promises.push(CoverageTest.getServicePrograms(path));
        }
        
        const lists = await Promise.all(promises);

        lists.forEach(list => {
          moduleList.push(...list);
        });
      }
    }

    const execution = await vscode.commands.executeCommand(`code-for-ibmi.runCommand`, {
      command: `CODECOV CMD(${this.command}) MODULE(${moduleList.join(` `)}) OUTSTMF('${outputZip}')`,
      environment: `ile`
    });

    if (execution.code === 0 || execution.code === null) {
      items = await CoverageTest.getCoverage(outputZip);

      return items;
    } else {
      vscode.window.showErrorMessage(execution.stderr, `Show Output`)
        .then(async (item) => {
          if (item === `Show Output`) {
            vscode.commands.executeCommand(`code-for-ibmi.showOutputPanel`);
          }
        });
    }

    return items;
  }

  static async downloadCCZip(outputZip) {
    const content = instance.getConnection();
    const client = content.client;

    const tmpobj = await tmpFile({});
    const tmpdir = await tmpDir({});

    await client.getFile(tmpobj, outputZip);

    console.log(`Zip downloaded`);

    await cczip.extractZip(tmpobj, tmpdir);

    console.log(`Zip extracted`);

    return tmpdir;
  }

  static async getCoverage(outputZip) {
    const localExtractDir = CoverageTest.downloadCCZip(outputZip);
    return await cczip.parseCoverage(localExtractDir);
  }
}