/* eslint-disable max-statements */
/* eslint-disable complexity */
/* eslint-disable no-var */
/* eslint-disable strict */
var getModuleType = require('module-definition');
var debug = require('debug')('precinct');
var Walker = require('node-source-walk');

var compiler = require('vue-template-compiler');

var detectiveCjs = require('detective-cjs');
var detectiveAmd = require('detective-amd');
var detectiveEs6 = require('detective-es6');
var detectiveLess = require('detective-less');
var detectivePostcss = require('detective-postcss');
var detectiveSass = require('detective-sass');
var detectiveScss = require('detective-scss');
var detectiveStylus = require('detective-stylus');
var detectiveTypeScript = require('detective-typescript');


var fs = require('fs');
var path = require('path');

var natives = process.binding('natives');

/**
 * Finds the list of dependencies for the given file
 *
 * @param {String|Object} content - File's content or AST
 * @param {Object} [options]
 * @param {String} [options.type] - The type of content being passed in. Useful if you want to use a non-js detective
 * @return {String[]}
 */
function precinct(content, options = {}) {
	let dependencies = [];
	let ast;
	let type = options.type;

	// Legacy form backCompat where type was the second parameter
	if (typeof options === 'string') {
		type = options;
		options = {};
	}

	console.log('options given: ', options);

	// We assume we're dealing with a JS file
	if (!type && typeof content !== 'object') {
		console.log('we assume this is JS');
		const walker = new Walker();

		try {
			// Parse once and distribute the AST to all detectives
			ast = walker.parse(content);
			debug('parsed the file content into an ast');
			precinct.ast = ast;
			// console.log('ast', ast);
		} catch (e) {
			// In case a previous call had it populated
			precinct.ast = null;
			console.log('could not parse content: %s', e.message);
			return dependencies;
		}
		// SASS files shouldn't be parsed by Acorn
	} else {
		ast = content;

		if (typeof content === 'object') {
			precinct.ast = content;
		}
	}

	type = type || getModuleType.fromSource(ast);
	console.log('module type: ', type);

	let theDetective;
	const mixedMode = options.es6 && options.es6.mixedImports;

	switch (type) {
		case 'commonjs':
			theDetective = mixedMode ? detectiveEs6Cjs : detectiveCjs;
			break;
		case 'css':
			theDetective = detectivePostcss;
			break;
		case 'amd':
			theDetective = detectiveAmd;
			break;
		case 'es6':
			theDetective = mixedMode ? detectiveEs6Cjs : detectiveEs6;
			break;
		case 'sass':
			theDetective = detectiveSass;
			break;
		case 'less':
			theDetective = detectiveLess;
			break;
		case 'scss':
			theDetective = detectiveScss;
			break;
		case 'stylus':
			theDetective = detectiveStylus;
			break;
		case 'ts':
			theDetective = detectiveTypeScript;
			break;
		case 'tsx':
			theDetective = detectiveTypeScript.tsx;
			break;
	}

	if (theDetective) {
		dependencies = theDetective(ast, options[type]);
	} else {
		debug('no detective found for: ' + type);
	}

	// For non-JS files that we don't parse
	if (theDetective && theDetective.ast) {
		precinct.ast = theDetective.ast;
	}
	// console.log('dependencies', dependencies);
	return dependencies;
}

function detectiveEs6Cjs(ast, detectiveOptions) {
	return detectiveEs6(ast, detectiveOptions).concat(detectiveCjs(ast, detectiveOptions));
}

/**
 * Returns the dependencies for the given file path
 *
 * @param {String} filename
 * @param {Object} [options]
 * @param {Boolean} [options.includeCore=true] - Whether or not to include core modules in the dependency list
 * @param {Object} [options.fileSystem=undefined] - An alternative fs implementation to use for reading the file path.
 * @return {String[]}
 */
precinct.paperwork = function (filename, options = {}) {
	options = Object.assign({
		includeCore: true
	}, options);

	const fileSystem = options.fileSystem || fs;
	let content = fileSystem.readFileSync(filename, 'utf8');
	const ext = path.extname(filename);
	let type;

	// console.log('compilder', compiler);


	console.log(filename, '======ext=======', ext);

	if (ext === '.styl') {
		debug('paperwork: converting .styl into the stylus type');
		type = 'stylus';
	} else if (ext === '.cjs') {
		debug('paperwork: converting .cjs into the commonjs type');
		type = 'commonjs';
	} else if (ext === '.vue') {
		const compileResult = compiler.parseComponent(content);
		if (compileResult.script && compileResult.script.content) {
			content = compileResult.script.content;

			// console.log('content', content);
		}
		// type = 'vue';
	}
	// We need to sniff the JS module to find its type, not by extension
	// Other possible types pass through normally
	else if (ext !== '.js' && ext !== '.jsx') {
		debug('paperwork: stripping the dot from the extension to serve as the type');
		type = ext.replace('.', '');
	}

	if (type) {
		debug('paperwork: setting the module type');
		options.type = type;
	}

	console.log('paperwork: invoking precinct');
	const deps = precinct(content, options);

	if (!options.includeCore) {
		return deps.filter((d) => {
			return !natives[d];
		});
	}

	debug('paperwork: got these results\n', deps);
	return deps;
};

module.exports = precinct;
