// Accessible names insert spaces between flex/block children. Preserve word
// boundaries in Latin text, but tolerate presentation whitespace between Han.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function namePattern(value) {
  const chars = [...value.trim()]
  let source = ''
  for (let i = 0; i < chars.length; i++) {
    if (/\s/u.test(chars[i])) {
      if (i === 0 || !/\s/u.test(chars[i - 1])) source += '\\s+'
    } else {
      if (i && /\p{Script=Han}/u.test(chars[i - 1]) && /\p{Script=Han}/u.test(chars[i])) source += '\\s*'
      source += escape(chars[i])
    }
  }
  return new RegExp('^\\s*' + source + '\\s*$', 'u')
}

export const createTaskName = new RegExp('^\\s*(?:[+＋]\\s*)?(?:' +
  ['添加', '添加任务', '新建', '创建', '新增', '新建任务', '创建任务', '新增任务']
    .map(value => namePattern(value).source.replace(/^\^\\s\*/, '').replace(/\\s\*\$$/, '')).join('|') + ')\\s*$', 'u')
