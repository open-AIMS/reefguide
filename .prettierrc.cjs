// changed file to .cjs to get around error caused by changing root package.json
//  to type "module"
module.exports = {
  ...require('gts/.prettierrc.json'),
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  trailingComma: 'none',
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  htmlWhitespaceSensitivity: 'css',
  insertPragma: false,
  bracketSameLine: false,
  proseWrap: 'preserve'
};
