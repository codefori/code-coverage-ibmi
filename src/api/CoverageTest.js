
const vscode = require(`vscode`);

const tmp = require(`tmp`);
const path = require(`path`);
const fs = require(`fs`);
const unzipper = require(`unzipper`);
const util = require(`util`);
let parseString = util.promisify(require(`xml2js`).parseString);

const tmpFile = util.promisify(tmp.file);
const tmpDir = util.promisify(tmp.dir);
const readFileAsync = util.promisify(fs.readFile);

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
    const connection = instance.getConnection();
    const content = instance.getContent();
    const config = instance.getConfig();

    const tempLib = config.tempLibrary;

    let TempName = `C` + new Date().getTime().toString();
    if (TempName.length > 10) TempName = TempName.substr(0, 10);

    await connection.remoteCommand(`DSPBNDDIR BNDDIR(${path}) OUTPUT(*OUTFILE) OUTFILE(${tempLib}/${TempName})`);
    const results = await content.getTable(tempLib, TempName, TempName);

    if (results.length === 1) {
      if (results[0].BNOLNM.trim() === ``) {
        return []
      }
    }

    return results
      .filter(result => result.BNOBTP === `*SRVPGM`)
      .map(result => `(${result.BNOLNM}/${result.BNOBNM} ${result.BNOBTP} *ALL)`);
  }

  async runConverage() {
    const connection = instance.getConnection();
    const config = instance.getConfig();

    const outputZip = `/tmp/${new Date().getTime()}.cczip`;

    /** @type {ListItem[]} */
    let items = [];

    let libl = config.libraryList.slice(0).reverse();

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

    await connection.qshCommand([
      `liblist -d ` + connection.defaultUserLibraries.join(` `),
      `liblist -c ` + config.currentLibrary,
      `liblist -a ` + libl.join(` `),
      `system -s "CODECOV CMD(${this.command}) MODULE(${moduleList.join(` `)}) OUTSTMF('${outputZip}')"`,
    ]);

    items = await this.getCoverage(outputZip);

    return items;
  }

  async getCoverage(outputZip) {
    const content = instance.getConnection();
    const client = content.client;

    const tmpobj = await tmpFile({});
    const tmpdir = await tmpDir({});
    let items = [];

    await client.getFile(tmpobj, outputZip);

    console.log(`Zip downloaded`);

    await fs
      .createReadStream(tmpobj)
      .pipe(unzipper.Extract({ path: tmpdir }))
      .promise();

    console.log(`Zip extracted`);

    const xml = await readFileAsync(path.join(tmpdir, `ccdata`));

    console.log(`CCdata read`);

    const coverageResult = await parseString(xml);

    console.log(`XML parser`);

    let data, testCase, sourceCode,  activeLines, indexesExecuted;
    let lineKeys, percentRan, countRan;
    for (const source of coverageResult.LLC.lineLevelCoverageClass) {
      console.log(source.testcase);
      data = source[`$`];

      if (source.testcase === undefined) {
        //Indicates that no lines were ran
        testCase = { hits: `` };
      } else {
        testCase = source.testcase[0][`$`];
      }

      sourceCode = (
        await readFileAsync(
          path.join(tmpdir, `src`, data.baseFileName),
          `utf8`,
        )
      ).split(`\n`);

      indexesExecuted = this.getRunLines(sourceCode.length, testCase.hits);
      activeLines = this.getLines(data.lines, indexesExecuted);

      lineKeys = Object.keys(activeLines);

      countRan = 0;
      lineKeys.forEach(key => {
        if (activeLines[key] === true) countRan++;
      })

      percentRan = ((countRan / lineKeys.length) * 100).toFixed(0);

      items.push({
        basename: path.basename(data.sourceFile),
        path: data.sourceFile,
        localPath: path.join(tmpdir, `src`, data.baseFileName),
        coverage: {
          signitures: data.signatures.split(`+`),
          lineString: data.lines,
          activeLines,
          percentRan
        },
      });
    }

    return items;
  }

  getLines(string, indexesExecuted) {
    let lineNumbers = [];
    let line = 0;
    let currentValue = ``;
    let concat = false;
  
    for (const char of string) {
      switch (char) {
      case `#`:
        if (currentValue !== ``) {
          line = Number(currentValue);
          lineNumbers.push(line);
        }

        concat = true;
        line = 0;
        currentValue = ``;
        break;

      case `,`:
        if (currentValue !== ``) {
          line = Number(currentValue);
          lineNumbers.push(line);
        }
        currentValue = ``;
        break;

      case `+`:
        line = Number(currentValue);
        lineNumbers.push(line);
        concat = false;
        break;

      default:
        if (concat) currentValue += char;
        else {
          currentValue = ``
          line += Number(char);
          lineNumbers.push(line);
        }
        break;
      }
    }
  
    let lines = {};
  
    for (const i in lineNumbers) {
      lines[lineNumbers[i]] = indexesExecuted.includes(Number(i));
    }
  
    return lines;
  }

  getRunLines(numLines, hits) {
    let hitLines =  [];
  
    let hitChar;
    for (let i = 0, lineIndex = 0; lineIndex < numLines && i < hits.length; i++) {
      hitChar = hits.charCodeAt(i);
  
      if (hitChar <= 80) {
        hitChar -= 65;
  
        if (hitChar === 0) {
          lineIndex += 4;
        } else {
          if ((hitChar & 8) !== 0) 
            hitLines.push(lineIndex);
          lineIndex++;
          if ((hitChar & 4) !== 0 && lineIndex < numLines)
            hitLines.push(lineIndex);
          lineIndex++;
          if ((hitChar & 2) !== 0 && lineIndex < numLines)
            hitLines.push(lineIndex);
          lineIndex++;
          if ((hitChar & 1) !== 0 && lineIndex < numLines)
            hitLines.push(lineIndex);
          lineIndex++;
        }
      }
    }
  
    return hitLines;
  }
}