const webpack = require('webpack');
const { JavascriptModulesPlugin } = webpack.javascript;
const { ConcatSource, ReplaceSource } = require('webpack-sources');

class InnerPromisePlugin {
  constructor(options) {
    this.options = Object.assign({
      modulePath: '',
      moduleAccessor: ''
    }, options);
  }

  apply(compiler) {
    compiler.hooks.compilation.tap('InnerPromisePlugin', compilation => {

      // define local "Promise" variable in webpack bootstrap template
      JavascriptModulesPlugin.getCompilationHooks(compilation).renderMain.tap('JSONPNamespacePlugin', source => {
        const moduleId = getPromiseModuleId(compilation, this.options.modulePath);
        const promiseInclude = getPromiseInclude(moduleId, this.options.moduleAccessor);

        const fullModuleSource = source.source();
        const injectAfter = [
          '__webpack_require__.e = function(chunkId) {',
          '__webpack_require__.f.j = function(chunkId, promises) {',
        ];

        source = new ReplaceSource(source);
        injectAfter.forEach(expectedTemplate => {
          const matchIndex = fullModuleSource.indexOf(expectedTemplate);
          if (matchIndex > -1) {
            source.insert(matchIndex + expectedTemplate.length, promiseInclude);
          }
        });
        return source;
      });

      // define local "Promise" variable for wild-card chunk loading
      JavascriptModulesPlugin.getCompilationHooks(compilation).renderModuleContent.tap('InnerPromisePlugin', source => {
        if (source.source().includes('webpackAsyncContext')) {
          const moduleId = getPromiseModuleId(compilation, this.options.modulePath);
          source = new ConcatSource(getPromiseInclude(moduleId, this.options.moduleAccessor), '\n', source);
        }
        return source;
      });

    });
  }
}

const getPromiseModuleId = (compilation, promiseModulePath) => {
  // find id of the module which contains local Promise implementation
  let moduleId = null;
  compilation.chunks.forEach(chunk => {
    compilation.chunkGraph.getChunkModules(chunk).forEach(module => {
      if (moduleId === null && module.resource === promiseModulePath) {
        moduleId = compilation.chunkGraph.getModuleId(module);
      }
    });
  });
  return moduleId;
}

const getPromiseInclude = (moduleId, moduleAccessor) => {
  return moduleId !== null ? `var Promise = __webpack_require__(${JSON.stringify(moduleId)})${moduleAccessor || ''};` : '';
}

module.exports = InnerPromisePlugin;
