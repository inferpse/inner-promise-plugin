var RawSource = require('webpack-sources').RawSource,
    path = require("path"),
    cwd = process.cwd();

function InnerPromisePlugin(options) {
  this.options = options || {
    modulePath: '',
    moduleAccessor: ''
  };
}

InnerPromisePlugin.prototype.apply = function(compiler) {
  var options = this.options;
  var jsregex = options.test || /\.js($|\?)/i;
  var modulePath = path.resolve(cwd, options.modulePath);

  console.log('compare: ', modulePath);

  compiler.plugin('compilation', function (compilation) {
    compilation.plugin('optimize-chunk-assets', function (chunks, callback) {
      var moduleId = null;
      const files = [];

      chunks.forEach(function(chunk) {
        chunk.modules.forEach(function(module) {
          if (module.fileDependencies && moduleId === null) {
            module.fileDependencies.forEach(function(filePath) {
              if (moduleId === null && filePath === modulePath) {
                moduleId = module.id;
              }
            });
          }
        });

        chunk.files.forEach(function(file) {
          files.push(file);
        });
      });

      compilation.additionalChunkAssets.forEach(function(file) {
        files.push(file);
      });

      files.filter(function(file) {
        return jsregex.test(file);
      }).forEach(function(file) {
        try {
          var asset = compilation.assets[file];

          // return cached version
          if (asset.__innerPromiseApplied) {
            compilation.assets[file] = asset.__innerPromiseApplied;
            return;
          }

          // grab source code
          var input = asset.source();

          // make code es3 compatible
          var result = input.replace(/__webpack_require__\.bind\(null, (.*?)\)/, 'function(){ return __webpack_require__($1) }');

          // inject custom promise implementation (if moduleId was found) and make code ES3 compatible
          if (moduleId !== null) {
            var customPromiseInclude = 'var Promise = __webpack_require__(' + moduleId + ')' + (options.moduleAccessor) + ';';
            result = result
                      .replace(/(__webpack_require__\.e.*?{)/, '$1 ' + customPromiseInclude)
                      .replace(/(function webpackAsyncContext.*?{)/, '$1 ' + customPromiseInclude)
                      .replace(/(Promise\.all\(ids\.slice\(1\)\.map\(__webpack_require__\.e\)\))/g, 'Promise.all(function(){ var r = ids.slice(1); for(var i = 0; i < r.length; i++) { r[i] = __webpack_require__.e(r[i]); } return r; }())')
                      .replace(/return Object\.keys\(map\);/g, 'return (function() { var r = []; for (var p in map) { if (map.hasOwnProperty(p)) { r.push(p); } } return r; }())');
          }

          // save result
          asset.__innerPromiseApplied = compilation.assets[file] = new RawSource(result);
        } catch(e) {
          compilation.errors.push(e);
        }
      });

      callback();
    });
  });
};

module.exports = InnerPromisePlugin;
