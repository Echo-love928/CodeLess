import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { inspect } from '../../../evals/browser/browser.mjs'
import { sha } from '../../../evals/browser/core.mjs'
import { edits, editTarget } from '../../../evals/edit/cases.mjs'

let browser
const output = join(process.cwd(), '.local-data/d21-b/behavior-controls', randomUUID())
before(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:PATH|SYSTEMROOT|WINDIR|USERPROFILE|HOME|TEMP|TMP|LOCALAPPDATA|PLAYWRIGHT_BROWSERS_PATH|LANG)$/i.test(key)))
  browser = await chromium.launch({ headless: true, env })
})
after(async () => { await browser?.close() })

// Independent plain DOM implementations, deliberately different from the Vue fixture.
// Fields in cards and details use different labels; CAT-03 only opens from the name.
function catalog(id, { labels = false, authorFirst = true, categoryFirst = false, searchType = 'text', combine = true,
  detailAuthor = true, nameOnly = true, nameControl = 'heading', categoryLabel = null, descriptionLabel = '简介', detailLayout = 'text' } = {}) {
  const count = { 'CAT-01': 8, 'CAT-02': 6, 'CAT-03': 9 }[id]
  const categories = id === 'CAT-01' ? ['小说', '科技', '历史'] : id === 'CAT-02' ? ['西湖区', '上城区', '拱墅区'] : ['构建', '测试', '文档']
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><body><h1>独立目录实现</h1>
    <input type="${searchType}" aria-label="搜索"/><nav></nav><main></main>
    <section aria-label="详情" hidden><h2>详情</h2><div></div></section><p id="empty" hidden>没有匹配的工具</p>
    <script>
    const id=${JSON.stringify(id)}, categories=${JSON.stringify(categories)}, labels=${labels}, authorFirst=${authorFirst};
    const items=Array.from({length:${count}},(_,i)=>({name:'名称'+i,author:'作者值'+i,category:categories[i%3],description:'简介值'+i}));
    const main=document.querySelector('main'), search=document.querySelector('input'), nav=document.querySelector('nav'), detail=document.querySelector('section');
    let category='全部';
    function show(item){detail.hidden=false;const values=[item.name,${detailAuthor ? 'item.author' : "'错误作者'"},item.category,item.description,'4.5','MIT'],body=detail.querySelector('div');body.replaceChildren();
      if(${JSON.stringify(detailLayout)}==='dl'){const dl=document.createElement('dl');values.forEach((value,i)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=['名称','作者','所在城区','一句简介','评分','许可证'][i];dd.textContent=value;dl.append(dt,dd)});body.append(dl)}else body.textContent=values.join(' ')}
    function render(){main.replaceChildren();const visible=items.filter(item=>(category==='全部'||${combine ? 'item.category===category' : 'search.value||item.category===category'})&&(item.name.includes(search.value)||item.author.includes(search.value)));
      for(const item of visible){const card=document.createElement('article'),heading=document.createElement('h3');heading.textContent=item.name;
        if(id==='CAT-03'&&${nameOnly}){if(${JSON.stringify(nameControl)}==='heading')heading.onclick=()=>show(item);else{const control=document.createElement(${JSON.stringify(nameControl)}==='link'?'a':'button');control.textContent=item.name;if(control.tagName==='A')control.href='#';if(${JSON.stringify(nameControl)}==='button-wide')control.style.width='100%';control.onclick=event=>{event.preventDefault();show(item)};heading.replaceChildren(control)}}else card.onclick=()=>show(item);card.append(heading);
        const author=id==='CAT-02'?'评分：4.5':id==='CAT-03'?'许可证：MIT':'作者：'+item.author;
        const fields=[author,(${JSON.stringify(categoryLabel)}||(id==='CAT-02'?'城区':id==='CAT-03'?'类别':'分类'))+'：'+item.category,${JSON.stringify(descriptionLabel)}+'：'+item.description];
        if(${categoryFirst})fields.unshift(fields.splice(1,1)[0]);if(!authorFirst)fields.reverse();for(const raw of fields){const p=document.createElement('p');p.textContent=labels?raw:raw.replace(/^[^：]+：/,'');card.append(p)}main.append(card)}
      document.querySelector('#empty').hidden=visible.length>0;
    }
    if(id==='CAT-02'){const select=document.createElement('select');select.ariaLabel='城区';for(const name of ['全部',...categories]){const option=document.createElement('option');option.textContent=name;select.append(option)}select.onchange=()=>{category=select.value;render()};nav.append(select)}
    else for(const name of ['全部',...categories]){const button=document.createElement('button');button.textContent=name;button.onclick=()=>{category=name;render()};nav.append(button)}
    search.oninput=render;render();
    </script></body></html>`
}

function tasks(label) {
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><body><h1>独立看板实现</h1><input aria-label="标题"/><button id="create">${label}</button><main></main><script>
    let items=JSON.parse(localStorage.getItem('independent-board')||'[]');
    const input=document.querySelector('input'),main=document.querySelector('main');
    function render(){localStorage.setItem('independent-board',JSON.stringify(items));main.replaceChildren();
      ['待开始','进行中','已完成'].forEach((name,index)=>{const section=document.createElement('section'),heading=document.createElement('h2'),list=document.createElement('ul');heading.textContent=name;section.append(heading,list);main.append(section);
        for(const item of items.filter(item=>item.stage===index)){const row=document.createElement('li'),title=document.createElement('span'),next=document.createElement('button'),remove=document.createElement('button');title.textContent=item.title;next.textContent='下一步';remove.textContent='删除';next.onclick=()=>{item.stage=Math.min(2,item.stage+1);render()};remove.onclick=()=>{items=items.filter(other=>other!==item);render()};row.append(title,next,remove);list.append(row)}})}
    document.querySelector('#create').onclick=()=>{items.push({title:input.value,stage:0});input.value='';render()};render();
    </script></body></html>`
}

async function check(id, html, name) {
  const directory = join(output, name), path = join(directory, 'index.html')
  await mkdir(directory, { recursive: true }); await writeFile(path, html)
  return inspect(browser, { directory, files: [{ path: 'index.html', digest: sha(html) }] },
    { id, route: id.startsWith('CAT-') ? '/catalog' : '/tasks', output: join(directory, 'evidence') })
}

async function custom(html, name, action) {
  const directory = join(output, name)
  await mkdir(directory, { recursive: true }); await writeFile(join(directory, 'index.html'), html)
  return inspect(browser, { directory, files: [{ path: 'index.html', digest: sha(html) }] },
    { route: '/', output: join(directory, 'evidence'), action })
}

test('late mount: load before the first visible render is not a white screen', async () => {
  const result = await custom('<!doctype html><html><body><div id="app"></div><script>setTimeout(()=>{document.getElementById("app").innerHTML="<h1>Ready</h1>"},250)</script></body></html>',
    'late-mount', (page, expect) => expect(page.locator('h1')).toHaveText('Ready'))
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})

test('late mount: a permanently empty page is still a white screen', async () => {
  const result = await custom('<!doctype html><html><body><div id="app"></div></body></html>', 'empty-mount', () => {})
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'WHITE_SCREEN')
})

test('uniform padding rejects changing only the top edge', async () => {
  const result = await custom('<!doctype html><html><body><article style="padding:12px;padding-top:24px">Card</article></body></html>',
    'partial-padding', (page, expect) => editTarget(page, edits.find(e => e.id === 'EDIT-03'), expect))
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
})

for (const id of ['CAT-01', 'CAT-02', 'CAT-03']) {
  for (const labels of [false, true]) test(`${id}: ${labels ? 'labelled' : 'bare'} fields and value-only details are valid`, async () => {
    const result = await check(id, catalog(id, { labels }), id + '-' + labels)
    assert.equal(result.status, 'PASSED', JSON.stringify(result))
  })
}
test('CAT-03: a whole clickable card also opens details when its name is clicked', async () => {
  const result = await check('CAT-03', catalog('CAT-03', { nameOnly: false, labels: true }), 'whole-card')
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
for (const nameControl of ['button', 'link', 'button-wide']) test('CAT-03: name target ' + nameControl + ' inside a wide heading is clicked', async () => {
  const result = await check('CAT-03', catalog('CAT-03', { nameControl, labels: true }), 'name-' + nameControl)
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
test('CAT-01: a bare category before the author is not used as the search term', async () => {
  const result = await check('CAT-01', catalog('CAT-01', { categoryFirst: true }), 'bare-category-first')
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
for (const detailLayout of ['text', 'dl']) test('CAT-02: 所在城区 label matches value-only ' + detailLayout + ' details', async () => {
  const result = await check('CAT-02', catalog('CAT-02', { labels: true, categoryLabel: '所在城区', detailLayout }), 'district-' + detailLayout)
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
test('CAT-01: 一句简介 is a presentation label', async () => {
  const result = await check('CAT-01', catalog('CAT-01', { labels: true, descriptionLabel: '一句简介' }), 'one-line-description')
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
test('CAT-01: labelled author is searchable even when the paragraphs are reordered; searchbox is supported', async () => {
  const result = await check('CAT-01', catalog('CAT-01', { labels: true, authorFirst: false, searchType: 'search' }), 'reordered-searchbox')
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
for (const label of ['添加', '新建任务', '创建任务', '新建', '创建', '新增', '+ 新建任务', '＋ 创建任务']) test('TASK-02: creates and persists tasks with button ' + label, async () => {
  const result = await check('TASK-02', tasks(label), 'task-' + label)
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
test('CAT-03: searching must not bypass the selected category', async () => {
  const result = await check('CAT-03', catalog('CAT-03', { combine: false }), 'broken-combination')
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
})
test('CAT-01: removing labels must not excuse a wrong author in details', async () => {
  const result = await check('CAT-01', catalog('CAT-01', { labels: true, detailAuthor: false }), 'wrong-detail')
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
})
