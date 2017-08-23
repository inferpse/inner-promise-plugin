const { ConcatSource } = require('webpack-sources'),
      path = require('path'),
      cwd = process.cwd();

class InnerPromisePlugin {
  constructor(options) {
    this.options = Object.assign({
      modulePath: '',
      moduleAccessor: ''
    }, options);
  }
  getPromiseModuleId(compilation) {
    // find id of the module which contains local Promise implementation
    let modulePath = path.resolve(cwd, this.options.modulePath),
        moduleId = null;

    compilation.modules.forEach(module => {
      if (module.fileDependencies && moduleId === null) {
        module.fileDependencies.forEach(function(filePath) {
          if (moduleId === null && filePath === modulePath) {
            moduleId = module.id;
          }
        });
      }
    });
    return moduleId;
  }
  getPromiseInclude(moduleId) {
    const moduleAccessor = this.options.moduleAccessor || '';
    return moduleId !== null ? `var Promise = __webpack_require__(${moduleId})${moduleAccessor};` : '';
  }
  apply(compiler) {
    const self = this;

    compiler.plugin('compilation', compilation => {
      compilation.mainTemplate.plugin('require-ensure', function(source) {
        const moduleId = self.getPromiseModuleId(compilation);

        // define local "Promise" variable in webpack internal functions
        return this.asString([
          self.getPromiseInclude(moduleId),
          source,
        ]);
      });

      compilation.moduleTemplate.plugin('module', moduleSource => {
        if (moduleSource.source().indexOf('webpackAsyncContext') > -1) {          
          const moduleId = self.getPromiseModuleId(compilation),
                newSource = new ConcatSource();

          // define local "Promise" variable in webpack internal functions
          newSource.add(self.getPromiseInclude(moduleId));
          newSource.add('\n');
          newSource.add(moduleSource);
          return newSource;
        } else {
          return moduleSource;
        }
      });

    });
  }
}

module.exports = InnerPromisePlugin;
