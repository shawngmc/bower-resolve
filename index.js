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

function bowerResolveAll(bowerManifest, baseopts) {
    var deps = {};
    
    //console.log("bower deps: " + bowerManifest.dependencies);

    _.forEach(bowerManifest.dependencies, function(value, key) {
    	//console.log("key: " + key);
    	var newDeps = bowerResolveSync(key, value, baseopts);
    	//console.log("newDeps: " + JSON.stringify(newDeps));
        deps[key] = newDeps;
        //console.log("deps: " + JSON.stringify(deps));
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
            var tempPath;

			// Prefer the hidden config file, as it is the newer standard; only try to read non-hidden files if they exist.
			tempPath = [basePath, bowerDirRelPath, thisModuleName, '.bower.json'].join('/');
            if (fs.existsSync(tempPath)) {
            	//console.log("Found moduleConfig at " + tempPath + "...");
                moduleConfig = fs.readFileSync(tempPath);
            } else {
            	tempPath = [basePath, bowerDirRelPath, thisModuleName, 'bower.json'].join('/');
            	if (fs.existsSync(tempPath)) {
                	//console.log("Found moduleConfig at " + tempPath + "...");
                	moduleConfig = fs.readFileSync(tempPath);
            	}

            }
            var nameHasPath = thisModuleName.indexOf("/") !== -1;
            //console.log(thisModuleName);
            var relFilePaths = [];

			var mainSegment = null;
            if (moduleConfig) {
                mainSegment = JSON.parse(moduleConfig).main;
        		//console.log("main: " + mainSegment);
			}
			
			if (mainSegment) {
                // If the main value is a object list, resolve all of them                
                if (typeof mainSegment === 'object') {
                    _.forEach(mainSegment, function(subMain) {
                    	tempPath = path.join(basePath, bowerDirRelPath, thisModuleName, subMain);
                    	if (fs.existsSync(tempPath)) {
                        	relFilePaths.push(tempPath);
                    	} else {
	                    	//console.log("Expected to find file at " + tempPath + "; trying dist interjection...");
                    		// As a last ditch, we've seen some mains where the dist has been omitted. Try adding one.
                    		tempPath = path.join(basePath, bowerDirRelPath, thisModuleName, 'dist', subMain);
	                    	if (fs.existsSync(tempPath)) {
	                    		//console.log("Found at " + tempPath + "...");
	                        	relFilePaths.push(tempPath);
	                    	} else {
	                    		//console.log("Could not find file at " + tempPath + "...");
	                    	}
                    	}
                    });
                // If the main value is a string, resolve it
                } else if (typeof mainSegment === 'string') {
                    tempPath = path.join(basePath, bowerDirRelPath, thisModuleName, mainSegment);
                    	if (fs.existsSync(tempPath)) {
                        	relFilePaths.push(tempPath);
                    	} else {
                    		//console.log("Expected to find file at " + tempPath + "; trying dist interjection...");
                    		// As a last ditch, we've seen some mains where the dist has been omitted. Try adding one.
                    		tempPath = path.join(basePath, bowerDirRelPath, thisModuleName, 'dist', mainSegment);
	                    	if (fs.existsSync(tempPath)) {
	                    		//console.log("Found at " + tempPath + "...");
	                        	relFilePaths.push(tempPath);
	                    	} else {
	                    		//console.log("Could not find file at " + tempPath + "...");
	                    	}
                    	}
                }
            // if there is not a module config, but the name has a path, resolve it
            } else if (nameHasPath) {
                tempPath = path.join(basePath, bowerDirRelPath, thisModuleName, thisModuleName);
            	if (fs.existsSync(tempPath)) {
                	relFilePaths.push(tempPath);
            	} else {
            		//console.log("Could not find file at " + tempPath + "...");
            	}
        	// Last ditch effort. Try, in order, the following common approaches to naming. Lodash is espeically guilty of this one.
            } else {
            	var tryJsPaths = [];
            	tryJsPaths.push(path.join(basePath, bowerDirRelPath, thisModuleName, thisModuleName + ".js"));
            	tryJsPaths.push(path.join(basePath, bowerDirRelPath, thisModuleName, "dist", thisModuleName + ".min.js"));
            	tryJsPaths.push(path.join(basePath, bowerDirRelPath, thisModuleName, "dist", thisModuleName + ".js"));
            	//console.log("No main section found, and no path in the name (" + thisModuleName + "). Searching for probable entry points...");
            	//console.log("tryJsPaths: " + tryJsPaths);
            	var foundJs = false;
            	_.forEach(tryJsPaths, function(tryJsPath) {
            		if (!foundJs) {
            			if (fs.existsSync(tryJsPath)) {
	            			//console.log("Found probable non-preferred entry point at " + tryJsPath);
	            			relFilePaths.push(tryJsPath);
	            			foundJs = true;
	            		} else {
	            			//console.log("Did not find a probable non-preferred entry point at " + tryJsPath);
            			}
            		}
            	});
            	if (!foundJs) {
            		//console.log("Could not find a probable entry point for ' + thisModuleName + '.");
            	}
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