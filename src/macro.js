const {readFileSync} = require('fs')
const path = require('path')
const {createMacro} = require('babel-plugin-macros')
const glob = require('glob')

module.exports = createMacro(prevalMacros)

function prevalMacros({references, state, babel}) {
  references.default.forEach(referencePath => {
    if (referencePath.parentPath.type === 'CallExpression') {
      deferredNamedVersion({referencePath, state, babel})
    } else if (
      referencePath.parentPath.type === 'MemberExpression' &&
      referencePath.parentPath.node.property.name === 'deferredNamed'
    ) {
      deferredNamedVersion({referencePath, state, babel})
    } else {
      throw new Error(
        `This is not supported: \`${referencePath
          .findParent(babel.types.isExpression)
          .getSource()}\`. Please see the named-import-all.macro documentation`,
      )
    }
  })
}

function deferredNamedVersion({referencePath, state, babel}) {
  const {types: t} = babel
  const {
    file: {
      opts: {filename},
    },
  } = state
  const fileDir = path.dirname(filename)
  const importSources = getImportSources(
    referencePath.parentPath.parentPath,
    fileDir,
  )

  const getAst = code => {
    // babel 7
    if (babel.parse) {
      return babel.parse(code)
    }
    // babel 6
    const file = new babel.File({code})
    return file.parse(code)
  }

  const getExportedName = p => {
    if (p.node.declaration) {
      // class, function
      if (p.node.declaration.id) {
        return [p.node.declaration.id.name]
      }
      // export var, const, let
      return [p.node.declaration.declarations[0].id.name]
    }
    // export { A, B, C }
    return p.node.specifiers.map(el => el.exported.name)
  }

  const dependencies = importSources.reduce((acc, cur) => {
    const items = []
    const relPath = path.join(fileDir, cur)
    const code = readFileSync(relPath, 'utf-8').toString()
    const ast = getAst(code)
    babel.traverse(ast, {
      ExportNamedDeclaration: p => {
        items.push(...getExportedName(p))
      },
    })
    acc.set(cur, items)
    return acc
  }, new Map())

  const objectProperties = [...dependencies.keys()].reduce((acc, source) => {
    const exportedItems = dependencies.get(source)
    const items = exportedItems.map(exportName =>
      t.objectProperty(
        t.stringLiteral(exportName),
        t.functionExpression(
          null,
          [],
          t.blockStatement([
            t.returnStatement(
              t.callExpression(
                t.memberExpression(
                  t.callExpression(t.import(), [t.stringLiteral(source)]),
                  t.identifier('then'),
                ),
                [
                  t.functionExpression(
                    null,
                    [t.identifier('res')],
                    t.blockStatement([
                      t.returnStatement(
                        t.memberExpression(
                          t.identifier('res'),
                          t.identifier(exportName),
                        ),
                      ),
                    ]),
                  ),
                ],
              ),
            ),
          ]),
        ),
      ),
    )
    return acc.concat(items)
  }, [])

  const objectExpression = t.objectExpression(objectProperties)

  referencePath.parentPath.parentPath.replaceWith(objectExpression)
}

function getImportSources(callExpressionPath, cwd) {
  let globValue
  try {
    globValue = callExpressionPath.get('arguments')[0].evaluate().value
  } catch (error) {
    // ignore the error
    // add a console.log here if you need to know more specifically what's up...
  }
  if (!globValue) {
    throw new Error(
      `There was a problem evaluating the value of the argument for the code: ${callExpressionPath.getSource()}. ` +
        `If the value is dynamic, please make sure that its value is statically deterministic.`,
    )
  }

  return glob.sync(globValue, {cwd})
}
