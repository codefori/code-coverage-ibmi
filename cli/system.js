const exec = require(`child_process`).exec;

/**
 * @param {string} command 
 */
exports.command = (command) => {
  return execShellCommand(`/QOpenSys/pkgs/bin/bash -c "cl -S \\"${command}\\""`);
}

/**
 * @param {string} program Qualified or not.
 */
exports.runner = async (program) => {
  const outputZip = `/tmp/${new Date().getTime()}.cczip`;

  let moduleList = [`(${program} *PGM *ALL)`];

  const execution = await exports.command(`CODECOV CMD(CALL ${program}) MODULE(${moduleList.join(` `)}) OUTSTMF('${outputZip}')`);
  return {
    execution,
    outputZip
  };
}

/**
 * 
 * @param {string} cmd 
 * @returns {{stderr: string, stdout: string}}
 */
function execShellCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr
      });
    });
  });
}