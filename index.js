#! /usr/bin/env node

const assert = require('assert')
const semver = require('semver')
const portfinder = require('portfinder')
const path = require('path')
const fs = require('fs')
const repoUrlRegex = /^git@github\.com:(.*)\/(.*).git$/

const repoUrl = process.argv[2]
assert(repoUrl, 'repoUrl is required')
assert(repoUrl.match(repoUrlRegex), 'repoUrl deve ser do formato "git@github.com:user/repo.git"')

const branch = process.argv[3]
assert(branch, 'branch is required')
assert(branch !== '--pm2', 'branch is the second parameter and is required')

const usePm2 = process.argv[4] === '--pm2'

const extractProjectData = repoUrl => {
	const match = repoUrl.match(repoUrlRegex)

	return {
		owner: match && match[1],
		repo: match && match[2]
	}
}

const { owner, repo } = extractProjectData(repoUrl)

let folder = repo
if (semver.valid(branch)) {
	folder += '-release'
} else {
	folder += '-' + branch
}

const generateScript = () => {
	let script = `#!/bin/sh

set -e # stops if any errors
set -u # prevents undefined parameters

cd # goes back to home folder

[ -d ${folder}-deploy ] && sudo rm -r ${folder}-deploy # deletes any left over folder from a previous deploy
git clone ${repoUrl} ${folder}-deploy --branch ${branch} --depth 1 # clones de repo from the specified branch

if [ -d ${folder} ] # if there is a current installation
then
  # we keep node_modules as cache, to fasten up the deployment
  [ -d ${folder}/node_modules ] && cp -R ${folder}/node_modules ${folder}-deploy 
fi

cd ${folder}-deploy # we enter the installation folder

npm update --production # we make sure to update any dependencies
npm install --production # we call npm install to make sure post install hooks are called

cd # we go back again to the home folder

if [ -d ${folder} ] # if there is a current installation
then
  [ -d ${folder}-old ] && sudo rm -r ${folder}-old # we delete old backup folder
  mkdir ${folder}-old # and create a new one
  mv ${folder}/* ${folder}-old # then we move the current installation to the backup folder
fi

[ -d ${folder} ] && sudo rm -r ${folder} # we delete the current installation folder
mkdir ${folder} # create a new folder so the can live in
mv ${folder}-deploy/* ${folder} # we move the app files from the deploy folder to main folder
sudo rm -r ${folder}-deploy # we remove deploy folder (since we just moved its contents)`

	if (usePm2) {
		script += `

pm2 startOrRestart ~/apps.json --only ${folder} --update-env # we restart the app`	
	}

	return script
}

function addAppToPm2File () {
	const { HOME } = process.env
	const pm2Path = path.join(HOME, 'apps.json')
	const pm2 = require(pm2Path)
	const app = pm2.apps.find(app => app.name === folder)

	if (app) {
		return
	}

	portfinder.getPort((err, port) => {
		if (err) {
		  throw err
		}

		pm2.apps.push({
		  name: folder,
		  script: './index.js',
		  args: [],
		  watch: true,
		  merge_logs: true,
		  cwd: path.join(HOME, folder),
		  env: {
	      "PORT": port
		  }
		})
	
		fs.writeFileSync(pm2Path, JSON.stringify(pm2, null, 4))
	})
}

usePm2 && addAppToPm2File()
console.log(generateScript())
