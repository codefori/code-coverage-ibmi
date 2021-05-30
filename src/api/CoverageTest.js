
const vscode = require(`vscode`);

const tmp = require(`tmp`);
const path = require(`path`);
const fs = require(`fs`);
const unzipper = require(`unzipper`);
const util = require(`util`);
const EOL = `\n`;
let parseString = util.promisify(require(`xml2js`).parseString);

const tmpFile = util.promisify(tmp.file);
const tmpDir = util.promisify(tmp.dir);
const readFileAsync = util.promisify(fs.readFile);

const {instance} = vscode.extensions.getExtension(`halcyontechltd.code-for-ibmi`).exports;

module.exports = class CoverageTest {
  /**
   * Create a coverage test
   * @param {{runCommand: string, program: string}} data 
   */
  constructor(data) {
    this.command = data.runCommand;
    this.program = data.program;
  }

  async runConverage() {
    const connection = instance.getConnection();
    const config = instance.getConfig();

    const outputZip = `/tmp/${new Date().getTime()}.cczip`;

    /** @type {ListItem[]} */
    let items = [];

    let libl = config.libraryList.slice(0).reverse();

    libl = libl.map(library => {
      //We use this for special variables in the libl
      switch (library) {
      case `&BUILDLIB`: return config.currentLibrary;
      case `&CURLIB`: return config.currentLibrary;
      default: return library;
      }
    });

    await connection.qshCommand([
      `liblist -d ` + connection.defaultUserLibraries.join(` `),
      `liblist -c ` + config.currentLibrary,
      `liblist -a ` + libl.join(` `),
      `system -s "CODECOV CMD(${this.command}) MODULE((${this.program} *PGM *ALL)) OUTSTMF('${outputZip}')"`,
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

    let data, testCase, sourceCode, indexesExecuted;
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
      ).split(EOL);

      indexesExecuted = this.getRunLines(sourceCode.length, testCase.hits);

      items.push({
        path: data.sourceFile,
        coverage: {
          signitures: data.signatures.split(`+`),
          sourceCode: sourceCode,
          lineString: data.lines,
          activeLines: this.getLines(data.lines, indexesExecuted),
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
        break;
      case `+`:
        line = Number(currentValue);
        lineNumbers.push(line);
        concat = false;
        break;
      default:
        if (concat) currentValue += char;
        else {
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