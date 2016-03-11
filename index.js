/*eslint-env node */
var path = require('path');
var fs = require('fs');
var bower = require('bower');
var _ = require('lodash');
var bowerModules;

function readBowerModules(cb) {
    bower.commands.list({
        map: true
    }, {
        offline: module.exports.offline
    })
        .on('end', function(map) {
        bowerModules = map;
        cb(null, map);
    });
}

function bowerRequire(moduleName, options) {
    if (typeof bowerModules === 'undefined') throw new Error('You must call the #init method first');
    if (moduleName && moduleName in bowerModules.dependencies) {
        var bModule = bowerModules.dependencies[moduleName];
        if (bModule) {
            var mainModule;
            var pkgMeta = bModule.pkgMeta;
            if (pkgMeta && pkgMeta.main) {
                mainModule = Array.isArray(pkgMeta.main) ? pkgMeta.main.filter(function(file) {
                    return /\.js$/.test(file);
                })[0] : pkgMeta.main;
            } else {
                // if 'main' wasn't specified by this component, let's try
                // guessing that the main file is moduleName.js
                mainModule = moduleName + '.js';
            }
            var fullModulePath = path.resolve(path.join(bModule.canonicalDir, mainModule));
            return path.join(process.cwd(), path.relative(path.dirname(moduleName), fullModulePath));
        }
    }
}

function fastReadBowerModules(moduleArg, opts, cb) {

    //Seems hacky, but just wrap the async method. It increases code reuse and simplifies the library
    //and should be fine since the algorithm is typically rarely used and already relatively quick.

    setTimeout(function() {
        cb(bowerResolveSync(moduleArg, opts));
    }, 0);

}

function bowerResolveAll(bowerFile, baseopts) {
    // Read the bower manifest
    var bowerManifest = {};
    try {
        bowerManifest = require(bowerFile);
    } catch (e) {
    	console.log(e);
        return [];
    }

    var deps = [];
    
    console.log("bower deps: " + bowerManifest.dependencies);

    _.forEach(bowerManifest.dependencies, function(value, key) {
    	console.log("key: " + key);
    	var newDeps = bowerResolveSync(key, value, baseopts);
    	console.log("newDeps: " + newDeps);
        deps[key] = newDeps;
        console.log("deps: " + deps);
    });

    return deps;
}

function bowerResolveSync(moduleArg, moduleBowerRef, inOpts) {
    var opts = inOpts || {},
    moduleName = moduleArg,
        bowerDirRelPath = 'bower_components',
        found = false,
        basePath = opts.basedir ? path.resolve(process.cwd(), opts.basedir) : process.cwd(),
        pathAsArr = basePath.split(/[\\\/]/),
        returnPaths = [];

    if (moduleName.split(/[\\\/]/).length > 1) {
        throw new Error('Bower resolve cannot resolve relative paths. Please pass a single filename with an optional extension');
    }

    //traverse upwards checking for existence of bower identifiers at each level. Break when found
    while (pathAsArr.length) {
        basePath = pathAsArr.join(path.sep);
        var files = fs.readdirSync(basePath);
        if (files.indexOf('bower.json') !== -1 || files.indexOf('.bowerrc') !== -1 || files.indexOf('bower_components') !== -1) {
            found = true;
            if (files.indexOf('.bowerrc') !== -1) {
                var temp = fs.readFileSync(basePath + "/" + '.bowerrc');
                if (temp) bowerDirRelPath = JSON.parse(temp).directory || bowerDirRelPath;
            }
            break;
        }
        pathAsArr.pop();
    }

    if (found) {
        //This is a niche case. Any consuming module must expect * to bower resolve to an array, not a string
        if (moduleName === "*") {
            var modules = fs.readdirSync([basePath, bowerDirRelPath].join('/'));
            _.forEach(modules, function(thisModuleName) {
                returnPaths = _.union(returnPaths, getModulePaths(thisModuleName));
            });
        } else {
            returnPaths = _.union(returnPaths, getModulePaths(moduleName));
        }

        function getModulePaths(thisModuleName) {
            var moduleConfig;

			// Prefer the hidden config file, as it is the newer standard; only try to read files if they exist.
            if (fs.existsSync([basePath, bowerDirRelPath, thisModuleName, '.bower.json'].join('/'))) {
                moduleConfig = fs.readFileSync([basePath, bowerDirRelPath, thisModuleName, '.bower.json'].join('/'));
            } else if (fs.existsSync([basePath, bowerDirRelPath, thisModuleName, 'bower.json'].join('/'))) {
                moduleConfig = fs.readFileSync([basePath, bowerDirRelPath, thisModuleName, 'bower.json'].join('/'));
            }
            var nameHasPath = thisModuleName.indexOf("/") === -1;
            console.log(thisModuleName);
            var relFilePaths = [];

            if (moduleConfig) {
                var mains = JSON.parse(moduleConfig).main;

                // If the main value is a object list, resolve all of them                
                if (typeof mains === 'object') {
                    _.forEach(mains, function(subMain) {
                        relFilePaths.push(path.join(basePath, bowerDirRelPath, thisModuleName, subMain));
                    });
                    // If the main value is a string, resolve it
                } else if (typeof mains === 'string') {
                    relFilePaths.push(path.join(basePath, bowerDirRelPath, thisModuleName, mains));
                }
                // if there is not a module config, but the name has a path, resolve it
            } else if (nameHasPath) {
                relFilePaths.push(path.join(basePath, bowerDirRelPath, thisModuleName, thisModuleName));
            }
            return relFilePaths;
        }
        // If there was no bower.json or .bower.json, it's probably a hard linked single javascript file.
    } else if ((moduleBowerRef.startsWith("http://") || moduleBowerRef.startsWith("https://")) && moduleBowerRef.endsWith(".js")) {
        returnPaths.push(path.join(basePath, bowerDirRelPath, moduleName, "index.js"));
    }

    return returnPaths;
}


module.exports = bowerRequire;
module.exports.init = readBowerModules;
module.exports.fastRead = fastReadBowerModules;
module.exports.fastReadSync = bowerResolveSync;
module.exports.fastReadAllDeps = bowerResolveAll;
module.exports.offline = false;