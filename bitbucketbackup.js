/**
 * Bitbucket backup script
 * Helps you backup all your bitbucket repositories to a local folder
 *
 * Usage: node app --user=bbUser --pass=bbPass --owner=companyOrUserName --folder=./backup --auth=ssh
 *
 * --folder is optional. It defaults to ./bitbucket-repo-backups
 * --auth is optional. It defaults to using https authentication
*/
var path = require('path');
var async = require('async');
var argv = require('named-argv');
var request = require('request');
var exec = require('child_process').exec;
var fs = require('fs');

// Check the incoming params
if (!argv.opts || !argv.opts.owner || !argv.opts.user || !argv.opts.pass) {
	console.log('You must pass --owner, --user and --pass options. Exiting.');
	process.exit(1);
}

var url = 'https://api.bitbucket.org/2.0/repositories/' + argv.opts.owner;
var auth = {
	user: argv.opts.user,
	pass: argv.opts.pass
};

var backupFolder = argv.opts.folder || './bitbucket-repo-backups';
backupFolder = path.normalize(backupFolder + '/');

// Get all repos from Bitbucket
getAllRepos(url, auth, function (error, repos) {
	if (error) {
		throw error;
	}

	console.log('Got %d repos. Processing...', repos.length);

	// Iterate over all repos, clone each to local folder
	async.eachLimit(repos, 500, function (repo, callback) {

		// Remove any whitespace from repo name and make lowercase
		var repoName = repo.name.replace(/\s+/g, '-').toLowerCase();

		// Choose between git and mercurial
		var command = repo.scm == 'git' ? 'git' : 'hg';

		// Choose between https and ssh authentication
		var protocol = argv.opts.auth == 'ssh' ? 1 : 0;

		// If repo exists locally then fetch and pull
		try {

			if (fs.statSync(backupFolder + repoName)) {

				console.log('Fetching and pulling...', repo.name);

				exec('cd ' + backupFolder + repoName + ' && ' + command + ' fetch --all && ' + command + ' pull --all && cd ../..', callback);

			}
		}

		// If repo does not exist locally then clone
		catch(e) {

			console.log('Cloning...', repo.name);

			exec(command + ' clone ' + repo.links.clone[protocol].href + ' ' + backupFolder + repoName, callback);

		}

	});
});

/**
 * Get all repositories from the specified url
 *
 * @callback processCallback
 * @param {Object} error
 * @param {Array} repos - list of repositories
 *
 * @param {String} url - Bitbucket API url
 * @param {Object} auth - Object containing bitbucket username and password
 * @param {processCallback} callback
*/
function getAllRepos (url, auth, callback) {
	var repos = [];
	var apiUrl = url;

	// Iterate bitbucket pages, collect all repositories to repos array
	async.doWhilst(
		function (callback) {
			request.get(apiUrl, {auth: auth}, function (error, response, body) {
				var json = null;

				try {
					json = JSON.parse(body);
				}
				catch (exc) {
					return callback(exc);
				}

				repos = repos.concat(json.values);
				apiUrl = json.next;
				callback();
			});
		},

		function () {
			// Keep iterating until apiUrl (json.next) exists
			return !!apiUrl;
		},

		function (error) {
			callback(error, repos);
		}
	);
}
