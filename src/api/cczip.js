
const path = require(`path`);
const fs = require(`fs`);
const unzipper = require(`unzipper`);
const util = require(`util`);
let parseString = util.promisify(require(`xml2js`).parseString);
const readFileAsync = util.promisify(fs.readFile);

exports.extractZip = (zipObj, outDir) => {
  return fs
    .createReadStream(zipObj)
    .pipe(unzipper.Extract({ path: outDir }))
    .promise();
}

exports.parseCoverage = async (extractDir) => {
  let items = [];
  const xml = await readFileAsync(path.join(extractDir, `ccdata`));

  const coverageResult = await parseString(xml);

  let data, testCase, sourceCode, activeLines, indexesExecuted;
  let lineKeys, percentRan, countRan;
  for (const source of coverageResult.LLC.lineLevelCoverageClass) {
    data = source[`$`];

    if (source.testcase === undefined) {
      //Indicates that no lines were ran
      testCase = { hits: `` };
    } else {
      testCase = source.testcase[0][`$`];
    }

    sourceCode = (
      await readFileAsync(
        path.join(extractDir, `src`, data.baseFileName),
        `utf8`,
      )
    ).split(`\n`);

    const realHits = testCase.v2fileHits || testCase.hits;
    const realLines = data.v2fileLines || data.lines;
    const realSigs = data.v2qualifiedSignatures || data.signatures;

    indexesExecuted = exports.getRunLines(sourceCode.length, realHits);
    activeLines = exports.getLines(realLines, indexesExecuted);

    lineKeys = Object.keys(activeLines);

    countRan = 0;
    lineKeys.forEach(key => {
      if (activeLines[key] === true) countRan++;
    })

    percentRan = ((countRan / lineKeys.length) * 100).toFixed(0);

    items.push({
      basename: path.basename(data.sourceFile),
      path: data.sourceFile,
      localPath: path.join(extractDir, `src`, data.baseFileName),
      coverage: {
        signitures: realSigs.split(`+`),
        lineString: realLines,
        activeLines,
        percentRan
      },
    });
  }

  return items;
}

exports.getLines = (string, indexesExecuted) => {
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

exports.getRunLines = (numLines, hits) => {
  let hitLines = [];

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