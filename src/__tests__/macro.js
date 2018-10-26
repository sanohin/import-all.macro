import path from 'path'
import pluginTester from 'babel-plugin-tester'
import plugin from 'babel-plugin-macros'
import prettier from 'prettier'
import {prettier as prettierConfig} from 'kcd-scripts/config'

const projectRoot = path.join(__dirname, '../../').replace(/\\/g, '/')

expect.addSnapshotSerializer({
  print(val) {
    return val
      .split(projectRoot)
      .join('<PROJECT_ROOT>/')
      .replace(/fixtures/g, 'files')
      .replace(/..\/macro/, 'named-import-all.macro')
  },
  test(val) {
    return typeof val === 'string'
  },
})

pluginTester({
  plugin,
  snapshot: true,
  babelOptions: {
    filename: __filename,
  },
  formatResult(result) {
    return prettier.format(
      result,
      Object.assign({trailingComma: 'es5'}, prettierConfig),
    )
  },
  tests: {
    'no usage': `import importAll from '../macro'`,
    'incorrect API usage': {
      error: true,
      code: `
        import importAll from '../macro'
        const x = importAll.defered('hi')
      `,
    },
    'non-static evaluate-able expression': {
      error: true,
      code: `
        import importAll from '../macro'
        const x = importAll(global.whatever)
      `,
    },
    'README:1 `importAll.deferredNamed` gives an object where key is the named export and value is the dynamic import': `
    import importAll from '../macro'

    const routes = importAll.deferredNamed('./fixtures/*.js')
    `,
  },
})
