#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const appName = 'yiqikan';
const deployRoot = path.join(projectRoot, 'deploy');
const appDir = path.join(deployRoot, appName);
const archivePath = path.join(projectRoot, `${appName}-deploy.zip`);
const legacyArchivePath = path.join(projectRoot, `${appName}-deploy.tar.gz`);

function log(message) {
  console.log(`[deploy] ${message}`);
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function remove(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copy(src, dest, options = {}) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required path: ${path.relative(projectRoot, src)}`);
  }

  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    dereference: options.dereference ?? false,
    verbatimSymlinks: true,
  });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required file: ${path.relative(projectRoot, src)}`);
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyWsDependency() {
  const wsPackageJson = require.resolve('ws/package.json', {
    paths: [projectRoot],
  });
  const wsPackageRoot = path.dirname(wsPackageJson);
  const target = path.join(appDir, 'node_modules', 'ws');

  ensureDir(path.dirname(target));
  copy(wsPackageRoot, target);
}

function writeDeployReadme() {
  const content = [
    'YiQiKan deployment package',
    '',
    'Server commands:',
    '  unzip -o yiqikan-deploy.zip -d /opt',
    '  cd /opt/yiqikan',
    '  pm2 start ecosystem.config.js',
    '  pm2 save',
    '',
    'Default URL:',
    '  http://SERVER_IP:3000',
    '',
    'Logs:',
    '  pm2 logs yiqikan',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(appDir, 'DEPLOY_README.txt'), content);
}

function main() {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  log('cleaning previous build and deploy package');
  remove(path.join(projectRoot, '.next'));
  remove(deployRoot);
  remove(archivePath);
  remove(legacyArchivePath);

  log('building production standalone output');
  run(pnpmCommand, ['build']);

  const standaloneDir = path.join(projectRoot, '.next', 'standalone');
  const staticDir = path.join(projectRoot, '.next', 'static');
  const publicDir = path.join(projectRoot, 'public');

  if (!fs.existsSync(standaloneDir)) {
    throw new Error('Missing .next/standalone. Check next.config.js output: "standalone".');
  }

  log('assembling deploy directory');
  ensureDir(appDir);
  copy(standaloneDir, appDir);
  copy(staticDir, path.join(appDir, '.next', 'static'));
  copy(publicDir, path.join(appDir, 'public'));

  copyFile(
    path.join(projectRoot, 'production-final.js'),
    path.join(appDir, 'production-final.js')
  );
  copyFile(
    path.join(projectRoot, 'standalone-websocket.js'),
    path.join(appDir, 'standalone-websocket.js')
  );
  copyFile(
    path.join(projectRoot, 'ecosystem.config.js'),
    path.join(appDir, 'ecosystem.config.js')
  );
  copyFile(
    path.join(projectRoot, 'scripts', 'generate-manifest.js'),
    path.join(appDir, 'scripts', 'generate-manifest.js')
  );

  copyWsDependency();
  writeDeployReadme();

  log('creating archive');
  run('zip', ['-qry', archivePath, appName], { cwd: deployRoot });

  const archiveSize = fs.statSync(archivePath).size / 1024 / 1024;
  log(`created ${path.basename(archivePath)} (${archiveSize.toFixed(1)} MB)`);
  log('upload this file to your server, then run:');
  log(`  unzip -o ${path.basename(archivePath)} -d /opt`);
  log(`  cd /opt/${appName}`);
  log('  pm2 start ecosystem.config.js');
}

try {
  main();
} catch (error) {
  console.error(`[deploy] failed: ${error.message}`);
  process.exit(1);
}
