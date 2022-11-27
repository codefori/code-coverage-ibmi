const fs = require(`fs/promises`);
const path = require("path");
const cczip = require(`../src/api/cczip`);
const { runner } = require(`./system`);

const args = process.argv.filter((v, i) => i >= 2);

const start = async () => {
  const program = args[0];

  const result = await runner(program);

  const runOk = result.execution.stderr.length === 0;

  console.log(result.execution.stdout);

  if (runOk) {
    const zipFile = result.outputZip;
    const outputDir = `/tmp/${new Date().getTime()}-dir`;
    await cczip.extractZip(zipFile, outputDir);

    const coverageData = await cczip.parseCoverage(outputDir);

    coverageData.forEach(async source => {
      const basename = path.basename(source.localPath);
      const percentRan = Number(source.coverage.percentRan);

      console.log(`${basename}: ${percentRan}% covered`);
      console.log(``);
      if (percentRan < 100) {
        await printCoverage(source.localPath, source.coverage.activeLines);
      }
    });

  } else {
    console.log(result.execution.stderr);
  }
}

const printCoverage = async (localPath, activeLines) => {
  const content = await fs.readFile(localPath, {encoding: `utf8`});
  const eol = content.includes(`\r\n`) ? `\r\n` : `\n`;

  const lines = content.split(eol);

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = String(i+1);
    const runFlag = (typeof activeLines[lineNumber] === `boolean` ? (activeLines[lineNumber] ? `R` : `N`) : ` `);
    console.log(`\t${runFlag} ${lineNumber.padEnd(5)} ${lines[i]}`);
  }
}

start();