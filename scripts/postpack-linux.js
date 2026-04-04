const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') {
    return;
  }

  const appOutDir = context.appOutDir;
  const projectDir = context.packager.projectDir;
  const launcherSource = path.join(projectDir, 'packaging', 'melo-wrapper.sh');
  const launcherTarget = path.join(appOutDir, 'melo');
  const appBinaryTarget = path.join(appOutDir, 'melo-bin');

  if (!fs.existsSync(launcherSource)) {
    throw new Error(`[afterPack] Missing launcher source: ${launcherSource}`);
  }

  if (!fs.existsSync(launcherTarget)) {
    throw new Error(`[afterPack] Missing packaged binary: ${launcherTarget}`);
  }

  if (!fs.existsSync(appBinaryTarget)) {
    fs.renameSync(launcherTarget, appBinaryTarget);
  }

  fs.copyFileSync(launcherSource, launcherTarget);
  fs.chmodSync(launcherTarget, 0o755);

  console.log(`[afterPack] Linux launcher installed: ${launcherTarget} -> ${appBinaryTarget}`);
};
