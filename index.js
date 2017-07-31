const { SourceMapSource, RawSource } = require('webpack-sources'),
      babel = require('babel-core'),
      path = require('path'),
      cwd = process.cwd();

class InnerPromisePlugin {
  constructor(options) {
    this.options = Object.assign({
      jsregex: /\.js($|\?)/i,
      modulePath: '',
      moduleAccessor: ''
    }, options);
  }
  apply(compiler) {
    const { options } = this,
          { jsregex } = options,
          modulePath = path.resolve(cwd, options.modulePath),
          useSourceMap = typeof options.sourceMap === 'undefined' ? !!compiler.options.devtool : options.sourceMap;

    compiler.plugin('compilation', function (compilation) {

      if (useSourceMap) {
        compilation.plugin('build-module', function (module) {
          module.useSourceMap = true;
        });
      }

      compilation.plugin('optimize-chunk-assets', function (chunks, callback) {
        let files = [],
            moduleId = null;

        chunks.forEach(chunk => {
          // find local module with Promise implementation
          chunk.forEachModule(function(module) {
            if (module.fileDependencies && moduleId === null) {
              module.fileDependencies.forEach(function(filePath) {
                if (moduleId === null && filePath === modulePath) {
                  moduleId = module.id;
                }
              });
            }
          });

          chunk.files.forEach(file => files.push(file));
        });

        compilation.additionalChunkAssets.forEach(file => files.push(file));

        // do nothing if we were unable to find local promise implementation
        if (moduleId === null) {
          compilation.errors.push(new Error('InnerPromisePlugin: module with promise implementation not found!'));
          callback();
          return;
        }

        // save reference to module id in options
        options.moduleId = moduleId;

        files.filter(file => jsregex.test(file)).forEach(file => {
          try {
            let asset = compilation.assets[file];

            // use cached asset
            if (asset.__innerPromiseApplied) {
              compilation.assets[file] = asset.__innerPromiseApplied;
              return;
            }

            // read options
            let input, inputSourceMap;
            if (useSourceMap) {
              if (asset.sourceAndMap) {
                let sourceAndMap = asset.sourceAndMap();
                inputSourceMap = sourceAndMap.map;
                input = sourceAndMap.source;
              } else {
                inputSourceMap = asset.map();
                input = asset.source();
              }
            } else {
              input = asset.source();
            }

            // apply transformation
            const result = babel.transform(input, {
              plugins: [
                [InjectLocalPromise, options]
              ],
              sourceMaps: useSourceMap,
              compact: false,
              babelrc: false,
              inputSourceMap
            });

            // save result
            asset.__innerPromiseApplied = compilation.assets[file] = (
              result.map
              ? new SourceMapSource(result.code, file, result.map, input, inputSourceMap)
              : new RawSource(result.code)
            );
          } catch (e) {
            compilation.errors.push(e);
          }
        });

        callback();
      })
    });
  }
}

const InjectLocalPromise = ({types: t}) => {
  return {
    visitor: {
      Identifier: (path, {opts: options}) => {
        const { node, scope } = path;
        if (isWebpackInternalPromise(path)) {
          replacePromiseIdentifier(path, options);
        }
      }
    }
  };

  function isWebpackInternalPromise(path) {
    const { node, parentPath } = path;
    if (node.name === 'Promise') {
      const parentFunc = getParentFunction(path),
            parentNode = parentFunc && parentFunc.node;
      return parentFunc && (
        (parentNode.type === 'FunctionDeclaration' && parentNode.id && parentNode.id.name === 'webpackAsyncContext')
        ||
        (parentNode.type === 'FunctionExpression' && parentNode.id && parentNode.id.name === 'requireEnsure')
      )
    }
  }

  function getParentFunction(path) {
    return path.findParent(path => {
      return path.isFunctionExpression() || path.isFunctionDeclaration();
    });
  }

  function replacePromiseIdentifier(path, options) {
    let replacement = t.callExpression(t.identifier('__webpack_require__'), [t.numericLiteral(options.moduleId)]);

    if (options.moduleAccessor) {
      replacement = t.memberExpression(replacement, t.identifier(options.moduleAccessor))
    }

    path.replaceWith(replacement);
  }
}

module.exports = InnerPromisePlugin;
