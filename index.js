const { ConcatSource } = require('webpack-sources');

class InnerPromisePlugin {
  constructor(options) {
    this.options = Object.assign({
      modulePath: '',
      moduleAccessor: ''
    }, options);
  }
  getPromiseModuleId(compilation) {
    // find id of the module which contains local Promise implementation
    let moduleId = null;
    for (let i = 0; i < compilation.modules.length; i++) {
      const module = compilation.modules[i];
      if (module.resource === this.options.modulePath) {
        moduleId = module.id;
        break;
      }
    }
    return moduleId;
  }
  getPromiseInclude(moduleId) {
    const moduleAccessor = this.options.moduleAccessor || '';
    return moduleId !== null ? `var Promise = __webpack_require__('${moduleId}')${moduleAccessor};` : '';
  }
  apply(compiler) {
    compiler.hooks.compilation.tap('InnerPromisePlugin', compilation => {

      // define local "Promise" variable in webpack main template
      compilation.mainTemplate.hooks.requireEnsure.tap('InnerPromisePlugin', source => {
        const moduleId = this.getPromiseModuleId(compilation);
        return [
          this.getPromiseInclude(moduleId),
          source,
        ].join('\n');
      });

      // define local "Promise" variable for wild-card chunk loading
      compilation.moduleTemplates.javascript.hooks.module.tap('InnerPromisePlugin', source => {
        if (source.source().indexOf('webpackAsyncContext') > -1) {
          const moduleId = this.getPromiseModuleId(compilation),
                newSource = new ConcatSource();

          newSource.add(this.getPromiseInclude(moduleId));
          newSource.add('\n');
          newSource.add(source);
          return newSource;
        } else {
          return source;
        }
      });

    });
  }
}

module.exports = InnerPromisePlugin;
