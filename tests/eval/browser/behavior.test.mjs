import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium } from '@playwright/test'
import { inspect } from '../../../evals/browser/browser.mjs'
import { sha } from '../../../evals/browser/core.mjs'
import { edits, editTarget, observeTarget, workTitles } from '../../../evals/edit/cases.mjs'
import { resolveTarget, alreadyMatches } from '../../../evals/edit/targets.mjs'
import { namePattern, createTaskName } from '../../../evals/browser/names.mjs'

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
  detailAuthor = true, nameOnly = true, nameControl = 'heading', categoryLabel = null, descriptionLabel = '简介', detailLayout = 'text',
  itemTag = 'article', sparse = false, namedDetail = false, cardLabelSeparator = '：', detailRating = '4.5', allLabel = '全部', brokenReset = false,
  combinedFields = false, inlineDetail = false, categorySelect = false, detailLicense = 'MIT', missingDescription = false, nameOverlap = false,
  wrapperTag = null, countOverride = null, detailDescription = true, fieldSeparator = ' · ', categorySpan = false, detailNameParagraph = false,
  coffeeMetaSeparator = null, coffeeMissingRating = false, coffeeExtraAddress = false, coffeeAddressInsteadOfDrink = false } = {}) {
  const count = countOverride ?? { 'CAT-01': 8, 'CAT-02': 6, 'CAT-03': 9 }[id]
  const categories = id === 'CAT-01' ? ['小说', '科技', '历史'] : id === 'CAT-02' ? ['西湖区', '上城区', '拱墅区'] : ['构建', '测试', '文档']
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><body><h1>独立目录实现</h1>
    <input type="${searchType}" aria-label="搜索"/><nav></nav><main></main>
    <section aria-label="详情" hidden><h2>详情</h2><div></div></section><p id="empty" hidden>没有匹配的工具</p>
    <script>
    const id=${JSON.stringify(id)}, categories=${JSON.stringify(categories)}, labels=${labels}, authorFirst=${authorFirst};
    const names=['Atlas','AtlasTests','AtlasDocs','Bundler','SpecRunner','Guidebook','Compressor','BrowserRunner','Reference'];
    const items=Array.from({length:${count}},(_,i)=>({name:${nameOverlap}?names[i]:'名称'+i,author:'作者值'+i,category:categories[i%3],description:${nameOverlap}&&i===4?'Atlas compatible utilities':'简介值'+i}));
    const main=document.querySelector('main'), search=document.querySelector('input'), nav=document.querySelector('nav');let detail=document.querySelector('section');
    let category='全部', selectedName='';
    function show(item){selectedName=item.name;detail.hidden=false;if(${inlineDetail})main.querySelectorAll('${itemTag}')[items.indexOf(item)%main.children.length]?.append(detail);const values=[item.name,${detailAuthor ? 'item.author' : "'错误作者'"},item.category,${detailDescription ? 'item.description' : "'错误饮品'"},${JSON.stringify(detailRating)},${JSON.stringify(detailLicense)}],body=detail.querySelector('div');if(${coffeeExtraAddress||coffeeAddressInsteadOfDrink})values.push('地址：地址'+items.indexOf(item));body.replaceChildren();
      detail.querySelector('h2').textContent=${namedDetail} ? item.name : '详情';
      if(${sparse}||${JSON.stringify(detailLayout)}==='paragraphs'){for(const value of values.slice(1,4)){const p=document.createElement('p');p.textContent=value;body.append(p)}if(${detailNameParagraph}){const p=document.createElement('p');p.textContent=item.name;body.append(p)}}
      else if(${JSON.stringify(detailLayout)}==='dl'){const dl=document.createElement('dl');values.forEach((value,i)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=['名称','作者','所在城区','一句简介','评分','许可证'][i];dd.textContent=value;dl.append(dt,dd)});body.append(dl)}else body.textContent=values.join(' ')}
    function render(){main.replaceChildren();const visible=items.filter(item=>(category==='全部'||${combine ? 'item.category===category' : 'search.value||item.category===category'})&&(item.name.includes(search.value)||item.author.includes(search.value)));
      for(const item of visible){const card=document.createElement(${JSON.stringify(itemTag)}),heading=document.createElement('h3');heading.textContent=item.name;
        if(${sparse}){const button=document.createElement('button');for(const value of [item.name,item.author]){const span=document.createElement('span');span.textContent=value;button.append(span)}button.onclick=()=>show(item);card.append(button);main.append(card);continue}
        if(id==='CAT-03'&&${nameOnly}){if(${JSON.stringify(nameControl)}==='heading')heading.onclick=()=>show(item);else{const control=document.createElement(${JSON.stringify(nameControl)}==='link'?'a':'button');control.textContent=item.name;if(control.tagName==='A')control.href='#';if(${JSON.stringify(nameControl)}==='button-wide')control.style.width='100%';control.onclick=event=>{event.preventDefault();show(item)};heading.replaceChildren(control)}}else card.onclick=()=>show(item);card.append(heading);
        const author=id==='CAT-02'?'评分：4.5':id==='CAT-03'?'许可证：MIT':'作者：'+item.author;
        const fields=[author,(${JSON.stringify(categoryLabel)}||(id==='CAT-02'?'城区':id==='CAT-03'?'类别':'分类'))+'：'+item.category,${JSON.stringify(descriptionLabel)}+'：'+item.description];
        if(${missingDescription})fields.pop();if(${categoryFirst})fields.unshift(fields.splice(1,1)[0]);if(!authorFirst)fields.reverse();
        const display=fields.map(raw=>labels?raw.replace('：',${JSON.stringify(cardLabelSeparator)}):raw.replace(/^[^：]+：/,''));
        const coffeeFields=${JSON.stringify(coffeeMetaSeparator)}&&id==='CAT-02'?[item.category+(${coffeeMissingRating}?'':${JSON.stringify(coffeeMetaSeparator)}+'评分 4.5')+(${coffeeExtraAddress}?${JSON.stringify(coffeeMetaSeparator)}+'地址：地址'+items.indexOf(item):''),...(${missingDescription}?[]:[${coffeeAddressInsteadOfDrink}?'地址：地址'+items.indexOf(item):'招牌饮品：'+item.description])]:display;
        for(const raw of ${combinedFields}?[display.join(${JSON.stringify(fieldSeparator)})]:coffeeFields){const p=document.createElement(${categorySpan}&&raw.includes(item.category)?'span':'p');p.textContent=raw;card.append(p)}if(${JSON.stringify(wrapperTag)}){const wrapper=document.createElement(${JSON.stringify(wrapperTag)});wrapper.append(card);main.append(wrapper)}else main.append(card)}
      document.querySelector('#empty').hidden=visible.length>0;
      if(${inlineDetail}&&selectedName)[...main.children].find(node=>node.querySelector('h3')?.textContent===selectedName)?.append(detail);
    }
    if(id==='CAT-02'||${categorySelect}){const select=document.createElement('select');select.ariaLabel='类别';for(const name of ['全部',...categories]){const option=document.createElement('option');option.value=name;option.textContent=name==='全部'?${JSON.stringify(allLabel)}:name;select.append(option)}select.onchange=()=>{if(!${brokenReset}||select.value!=='全部')category=select.value;render()};nav.append(select)}
    else for(const name of ['全部',...categories]){const button=document.createElement('button');button.textContent=name;button.onclick=()=>{category=name;render()};nav.append(button)}
    if(${inlineDetail}){const replacement=document.createElement('div');replacement.innerHTML=detail.innerHTML;replacement.hidden=true;detail.replaceWith(replacement);detail=replacement}
    search.oninput=render;render();
    </script></body></html>`
}

function tasks(label, { split = false, wrongNext = false, divColumns = false, stationary = false, countedHeadings = false, wrongHeading = false } = {}) {
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><body><h1>独立看板实现</h1><input aria-label="标题"/><button id="create">${label}</button><main></main><script>
    let items=JSON.parse(localStorage.getItem('independent-board')||'[]');
    const input=document.querySelector('input'),main=document.querySelector('main');
    function render(){localStorage.setItem('independent-board',JSON.stringify(items));main.replaceChildren();
      const board=${divColumns}?document.createElement('section'):main;if(board!==main)main.append(board);
      ['待开始','进行中','已完成'].forEach((name,index)=>{const section=document.createElement(${divColumns}?'div':'section'),header=document.createElement('div'),heading=document.createElement('h2'),list=document.createElement('ul');heading.textContent=name+(${wrongHeading}?'全部':'')+(${countedHeadings}?' ('+items.filter(item=>item.stage===index).length+')':'');header.append(heading);section.append(header,list);board.append(section);
        for(const item of items.filter(item=>item.stage===index)){const row=document.createElement('li'),title=document.createElement('span'),next=document.createElement('button'),remove=document.createElement('button');title.textContent=item.title;next.textContent='下一步';remove.textContent='删除';next.onclick=()=>{if(!${stationary})item.stage=Math.min(2,item.stage+1);render()};remove.onclick=()=>{items=items.filter(other=>other!==item);render()};row.append(title,next,remove);list.append(row)}})}
    function splitNames(){if(!${split})return;for(const node of document.querySelectorAll('button,h2')){if(node.dataset.split)continue;node.dataset.split='yes';node.style.display='flex';const text=node.textContent;node.replaceChildren(...[...text].map(c=>{const span=document.createElement('span');span.textContent=c;return span}))}}
    const originalRender=render;render=()=>{originalRender();if(${wrongNext})for(const b of document.querySelectorAll('main button'))if(b.textContent==='下一步')b.textContent='下一步全部';splitNames()};
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
  const result = await custom('<!doctype html><html><meta charset="utf-8"><body>' + workTitles.map(title => `<article style="padding:12px;padding-top:24px"><h3>${title}</h3><p>Description</p></article>`).join('') + '</body></html>',
    'partial-padding', (page, expect) => editTarget(page, edits.find(e => e.id === 'EDIT-03'), expect))
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
  assert.match(result.error, /12px/)
})

test('accessible-name normalization preserves full labels and Latin word boundaries', () => {
  assert.ok(namePattern('买牛奶未完成').test('买 牛 奶 未 完 成'))
  assert.ok(namePattern('Grace Hopper').test('Grace\u00a0Hopper'))
  assert.ok(!namePattern('Grace Hopper').test('GraceHopper'))
  assert.ok(!namePattern('下一步').test('下一步全部'))
  assert.ok(createTaskName.test('＋ 新 建 任 务')); assert.ok(!createTaskName.test('批量新建任务'))
})

test('TASK-02: flex children insert accessible-name spaces in buttons and headings', async () => {
  const result = await check('TASK-02', tasks('+ 新建任务', { split: true }), 'flex-accessible-names')
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})

test('TASK-02: whitespace normalization does not accept a different action', async () => {
  const result = await check('TASK-02', tasks('新建任务', { split: true, wrongNext: true }), 'wrong-flex-name')
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
})

test('TASK-02: div columns inside one board section preserve independent status assertions', async () => {
  const result=await check('TASK-02',tasks('新建任务',{split:true,divColumns:true}),'div-columns');assert.equal(result.status,'PASSED',JSON.stringify(result))
})
test('TASK-02: nested column layout still rejects a task that never moves', async () => {
  const result=await check('TASK-02',tasks('新建任务',{divColumns:true,stationary:true}),'stationary-columns');assert.equal(result.status,'FAILED')
})
for(const options of [{},{detailLicense:'Wrong license'},{missingDescription:true},{combine:false}])test('CAT-03: combined metadata, inline details and category select '+JSON.stringify(options),async()=>{
  const result=await check('CAT-03',catalog('CAT-03',{combinedFields:true,inlineDetail:true,categorySelect:true,...options}),'inline-catalog-'+Object.keys(options).join('-'))
  assert.equal(result.status,Object.keys(options).length?'FAILED':'PASSED',JSON.stringify(result))
})
for(const combine of [true,false])test('CAT-03: overlapping names across categories preserve AND filtering '+combine,async()=>{
  const result=await check('CAT-03',catalog('CAT-03',{nameOverlap:true,combine,categorySelect:true}),'overlapping-names-'+combine)
  assert.equal(result.status,combine?'PASSED':'FAILED',JSON.stringify(result))
})

const targetMapping = () => ({ protocol: 'codeless-component-mapping/v1', versionId: '00000000-0000-4000-8000-000000000001',
  sourceDigest: sha('source'), components: [{ componentId: 'portfolio-unit', sourceFile: 'src/components/ProjectTile.vue', fileDigest: sha('file'), scope: 'SOURCE_FILE' }], disabled: [] })

test('semantic cards select an arbitrary trusted ID/path and observe actual baseline styles', async () => {
  let selected, observed
  const html = '<html><meta charset="utf-8"><body>' + workTitles.map(title => `<article data-ai-component="portfolio-unit" data-ai-source-file="src/pages/Forged.vue" style="padding:7px;color:purple;border-radius:9px"><h3>${title}</h3><p>Description</p></article>`).join('') + '</body></html>'
  const result = await custom(html, 'semantic-renamed-cards', async (page, expect) => {
    observed = await observeTarget(page, edits[2], expect)
    selected = resolveTarget(observed, targetMapping())
  })
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
  assert.equal(selected.selection.sourceFile, 'src/components/ProjectTile.vue')
  assert.ok(observed.every(v => Object.values(v.css).every(value => value === '7px')))
  assert.equal(alreadyMatches(edits[2], observed), false)
  assert.equal(alreadyMatches(edits[2], observed.map(v => ({ ...v, css: { 'padding-top': '24px', 'padding-right': '24px', 'padding-bottom': '24px', 'padding-left': '24px' } }))), true)
})

test('candidate IDs never bypass disabled, unknown, missing or different shared components', () => {
  const mapping = targetMapping(), observations = [{ candidateId: 'portfolio-unit' }]
  assert.equal(resolveTarget([{ candidateId: null }], mapping).mappingReason, 'MISSING_COMPONENT_ID')
  assert.equal(resolveTarget([{ candidateId: 'forged' }], mapping).mappingReason, 'UNKNOWN_COMPONENT_ID')
  const disabled = { ...mapping, components: [], disabled: [{ sourceFile: mapping.components[0].sourceFile, componentId: 'portfolio-unit', reason: 'DUPLICATE_COMPONENT_ID' }] }
  assert.equal(resolveTarget(observations, disabled).mappingReason, 'DUPLICATE_COMPONENT_ID')
  mapping.components.push({ ...mapping.components[0], sourceFile: 'src/components/Other.vue', componentId: 'other-unit' })
  assert.equal(resolveTarget([...observations, { candidateId: 'other-unit' }], mapping).mappingReason, 'TARGET_COMPONENTS_DIFFER')
})

test('card body color may be applied to paragraph children instead of their container', async () => {
  const html = '<html><meta charset="utf-8"><body>' + workTitles.map(title => `<article style="color:black"><h3>${title}</h3><p style="color:rgb(29,78,216)">Description</p></article>`).join('') + '</body></html>'
  const result = await custom(html, 'semantic-body-color', (page, expect) => editTarget(page, edits[1], expect))
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})

test('semantic heading/button targets resolve to renamed component files, including spaced accessible names', async () => {
  for (const id of ['EDIT-01', 'EDIT-04', 'EDIT-06']) {
    const edit = edits.find(e => e.id === id), mapping = targetMapping(), tag = id === 'EDIT-04' ? 'button' : 'h2'
    const label = edit.before.match(/[^\p{Script=Han}]+|\p{Script=Han}/gu).map(part => `<span>${part}</span>`).join('')
    const html = `<html><meta charset="utf-8"><body><section data-ai-component="portfolio-unit"><${tag} style="display:flex">${label}</${tag}></section></body></html>`
    let selected
    const result = await custom(html, 'semantic-' + id, async (page, expect) => {
      selected = resolveTarget(await observeTarget(page, edit, expect), mapping)
    })
    assert.equal(result.status, 'PASSED', JSON.stringify(result))
    assert.equal(selected.selection.sourceFile, 'src/components/ProjectTile.vue')
  }
})

for (const changedDescription of [false, true]) test('card preservation permits layout whitespace but rejects changed descriptions: ' + changedDescription, async () => {
  const html = '<html><meta charset="utf-8"><body>' + workTitles.map((title, i) => `<article style="padding:7px"><h3>${title}</h3><p>Description ${i}</p></article>`).join('') + '</body></html>'
  const after = '<html><meta charset="utf-8"><body>' + workTitles.map((title, i) => `<article style="padding:24px">\n  <h3>${title}</h3>\n  <p>${changedDescription && i === 0 ? 'Different' : 'Description ' + i}</p>\n</article>`).join('\n') + '</body></html>'
  const result = await custom(html, 'semantic-preserve-description-' + changedDescription, async (page, expect) => {
    const baseline = await observeTarget(page, edits[2], expect)
    await page.setContent(after)
    await editTarget(page, edits[2], expect, 'after', baseline)
  })
  assert.equal(result.status, changedDescription ? 'FAILED' : 'PASSED', JSON.stringify(result))
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

for (const sparse of [false, true]) test('CAT-01: list items support ' + (sparse ? 'compact buttons and book-named details' : 'heading cards'), async () => {
  const result = await check('CAT-01', catalog('CAT-01', { itemTag: 'li', sparse, namedDetail: sparse }), 'list-catalog-' + sparse)
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
for (const broken of ['author', 'combination']) test('CAT-01: compact lists still reject incorrect ' + broken, async () => {
  const result = await check('CAT-01', catalog('CAT-01', { itemTag: 'li', sparse: true, namedDetail: true,
    detailAuthor: broken !== 'author', combine: broken !== 'combination' }), 'broken-list-' + broken)
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
})

function photography({ count = 4, blankLocation = false, email = 'linxia@example.com', labelledEmail = false, hiddenEmail = false, headings = true, stationary = false, banner = false, aboutTag = 'p', initialTab = 0, brokenAbout = false, allPanels = false, persistentPanel = null, aboutArticle = false, retainAbout = false, aboutAria = false } = {}) {
  return '<html><meta charset="utf-8"><body><button onclick="show(0)">关于我</button><button onclick="show(1)">作品集</button>' +
    '<button onclick="show(2)">联系方式</button><main>'+(banner?'<p>固定摄影标语</p>':'')+((banner||persistentPanel)?'<'+(persistentPanel||'div')+' id="panels"></'+(persistentPanel||'div')+'>':'')+'</main><script>' +
    'function show(tab){if(('+stationary+'&&tab!==0)||('+brokenAbout+'&&tab===0))return;document.querySelector("'+((banner||persistentPanel)?'#panels':'main')+'").innerHTML=tab===0?\'<section'+(aboutAria?' role="tabpanel" aria-label="关于我"':'')+'>'+(aboutArticle?'<article>':'')+(headings?'<h2>关于我</h2>':'')+'<'+aboutTag+'>摄影师</'+aboutTag+'>'+(aboutArticle?'</article>':'')+'</section>\':' +
    'tab===1?\'<section>'+(headings?'<h2>作品集</h2>':'')+'<ul>' + Array.from({ length: count }, (_, i) => '<li><div style="background:blue;height:10px"></div><h3>作品' + i + '</h3><p>' + (blankLocation ? '' : '地点' + i) + '</p></li>').join('') +
    '</ul></section>\':\'<section>'+(headings?'<h2>联系方式</h2>':'')+'<p' + (hiddenEmail ? ' hidden' : '') + '>' + (labelledEmail ? '邮箱：' : '') + email + '</p></section>\';'+(persistentPanel?'const panel=document.querySelector("#panels");panel.innerHTML=panel.firstElementChild.innerHTML;':'')+'}'+
    ((allPanels||retainAbout)?'const originalShow=show,root=document.querySelector("'+((banner||persistentPanel)?'#panels':'main')+'"),views=[0,1,2].map(tab=>{originalShow(tab);return root.innerHTML});show=tab=>{root.innerHTML='+(allPanels?'"<p>当前区块："+tab+"</p>"+views.join("")':'tab===0?views[0]:views[0]+views[tab]')+'};':'')+
    'show('+initialTab+')</script></body></html>'
}
function shopping({ checkbox = false, persist = true, brokenClear = false } = {}) {
  return `<html><meta charset="utf-8"><body><h1>购物工具</h1><input aria-label="商品"><input type="number" aria-label="数量"><button id="add">加入清单</button><button id="clear">清除已购买</button><ul></ul><script>
    let items=JSON.parse(localStorage.getItem('independent-shopping')||'[]');
    const list=document.querySelector('ul'),fields=document.querySelectorAll('input');
    function render(){if(${persist})localStorage.setItem('independent-shopping',JSON.stringify(items));list.replaceChildren();
      for(const item of items){const li=document.createElement('li'),title=document.createElement('span'),qty=document.createElement('span'),toggle=document.createElement(${checkbox}?'input':'button'),remove=document.createElement('button');
        title.textContent=item.title;qty.textContent='数量：'+item.quantity;remove.textContent='删除';
        if(${checkbox}){toggle.type='checkbox';toggle.checked=item.done;toggle.onchange=()=>{item.done=toggle.checked;render()}}
        else{toggle.textContent=item.done?'取消已购买':'已购买';toggle.onclick=()=>{item.done=!item.done;render()}}
        remove.onclick=()=>{items=items.filter(other=>other!==item);render()};li.append(title,qty,toggle,remove);list.append(li)}}
    document.querySelector('#add').onclick=()=>{items.push({title:fields[0].value,quantity:Number(fields[1].value),done:false});fields[0].value='';render()};
    document.querySelector('#clear').onclick=()=>{items=${brokenClear} ? [] : items.filter(item=>!item.done);render()};render();
    </script></body></html>`
}
for (const checkbox of [false, true]) test('TASK-03: purchase state may use ' + (checkbox ? 'checkboxes' : 'toggle buttons'), async () => {
  const result = await check('TASK-03', shopping({ checkbox }), 'shopping-control-' + checkbox)
  assert.equal(result.status, 'PASSED', JSON.stringify(result))
})
for (const failure of ['persistence', 'clear']) test('TASK-03: button compatibility still rejects broken ' + failure, async () => {
  const result = await check('TASK-03', shopping({ persist: failure !== 'persistence', brokenClear: failure === 'clear' }), 'shopping-broken-' + failure)
  assert.equal(result.status, 'FAILED'); assert.equal(result.failure, 'BEHAVIOR_ERROR')
})
for (const variant of ['valid', 'count', 'location']) test('SHOW-03: list gallery ' + variant, async () => {
  const result = await check('SHOW-03', photography({ count: variant === 'count' ? 3 : 4, blankLocation: variant === 'location' }), 'list-gallery-' + variant)
  assert.equal(result.status, variant === 'valid' ? 'PASSED' : 'FAILED', JSON.stringify(result))
})
for (const variant of ['labelled', 'wrong', 'hidden']) test('SHOW-03: contact email ' + variant, async () => {
  const result = await check('SHOW-03', photography({ labelledEmail: true,
    email: variant === 'wrong' ? 'notlinxia@example.com.evil' : 'linxia@example.com', hiddenEmail: variant === 'hidden' }), 'email-' + variant)
  assert.equal(result.status, variant === 'labelled' ? 'PASSED' : 'FAILED', JSON.stringify(result))
})
for (const broken of [false, true]) test('CAT-02: native button cards ' + (broken ? 'still enforce category intersection' : 'are complete interactive cards'), async () => {
  const result = await check('CAT-02', catalog('CAT-02', { itemTag: 'button', labels: true, cardLabelSeparator: ' ', allLabel: '全部城区', combine: !broken }), 'button-card-' + broken)
  assert.equal(result.status, broken ? 'FAILED' : 'PASSED', JSON.stringify(result))
})
test('CAT-02: colonless rating labels still reject a different rating in details', async () => {
  const result = await check('CAT-02', catalog('CAT-02', { itemTag: 'button', labels: true, cardLabelSeparator: ' ', detailRating: '4.0' }), 'button-wrong-rating')
  assert.equal(result.status, 'FAILED', JSON.stringify(result))
})
test('CAT-02: restoring the observed initial option must really restore every card', async () => {
  const result = await check('CAT-02', catalog('CAT-02', { itemTag: 'button', allLabel: '全部城区', brokenReset: true }), 'button-broken-reset')
  assert.equal(result.status, 'FAILED', JSON.stringify(result))
})
for (const variant of ['valid','missing','extra','wrong-drink','wrong-rating','broken-combination']) test('CAT-02: nested list/article cards '+variant, async () => {
  const options={wrapperTag:'li',labels:true,descriptionLabel:'招牌',
    countOverride:variant==='missing'?5:variant==='extra'?7:null,
    detailDescription:variant!=='wrong-drink',detailRating:variant==='wrong-rating'?'4.0':'4.5',combine:variant!=='broken-combination'}
  const result=await check('CAT-02',catalog('CAT-02',options),'nested-cards-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
  assert.deepEqual(result.pageErrors,[])
  if(variant!=='valid')assert.equal(result.failure,'BEHAVIOR_ERROR')
})

for(const variant of ['valid','stationary','wrong-email'])test('D24 semantic SHOW-03: panels without headings '+variant,async()=>{
  const result=await check('SHOW-03',photography({headings:false,stationary:variant==='stationary',email:variant==='wrong-email'?'other@example.com':'linxia@example.com'}),'headingless-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
})
for(const variant of ['valid','wrong-heading','stationary'])test('D24 semantic TASK-02: status headings with counts '+variant,async()=>{
  const result=await check('TASK-02',tasks('新建',{countedHeadings:true,wrongHeading:variant==='wrong-heading',stationary:variant==='stationary'}),'counted-heading-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
})
for(const variant of ['valid','missing','extra','wrong-author','wrong-combination'])test('D24 semantic CAT-01: heading button nested in list item '+variant,async()=>{
  const result=await check('CAT-01',catalog('CAT-01',{itemTag:'button',wrapperTag:'li',labels:true,countOverride:variant==='missing'?7:variant==='extra'?9:null,detailAuthor:variant!=='wrong-author',combine:variant!=='wrong-combination'}),'nested-book-button-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
})
for(const variant of ['valid','wrong-license','wrong-combination'])test('D24 semantic CAT-03: fullwidth metadata separator '+variant,async()=>{
  const result=await check('CAT-03',catalog('CAT-03',{combinedFields:true,fieldSeparator:' ｜ ',detailLicense:variant==='wrong-license'?'Wrong license':'MIT',combine:variant!=='wrong-combination'}),'fullwidth-metadata-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
})
for(const variant of ['fixed-banner','div-about','contact-default-no-about'])test('D24 review SHOW-03: independent About state '+variant,async()=>{
  const result=await check('SHOW-03',photography({headings:variant==='div-about',banner:variant==='fixed-banner',aboutTag:variant==='div-about'?'div':'p',initialTab:variant==='contact-default-no-about'?2:0,brokenAbout:variant==='contact-default-no-about'}),'review-about-'+variant)
  assert.equal(result.status,variant==='contact-default-no-about'?'FAILED':'PASSED',JSON.stringify(result))
})
test('D24 review SHOW-03: all panels stay visible despite status text changes',async()=>{
  const result=await check('SHOW-03',photography({headings:false,allPanels:true}),'all-panels-visible')
  assert.equal(result.status,'FAILED',JSON.stringify(result))
})
for(const persistentPanel of ['div','section'])test('D24 review SHOW-03: persistent panel '+persistentPanel,async()=>{
  const result=await check('SHOW-03',photography({persistentPanel}),'persistent-panel-'+persistentPanel)
  assert.equal(result.status,'PASSED',JSON.stringify(result))
})
for(const variant of ['about-article','retain-about','retain-about-aria'])test('D24 review SHOW-03: distinguish actual panel content '+variant,async()=>{
  const result=await check('SHOW-03',photography({headings:variant==='about-article',aboutArticle:variant==='about-article',retainAbout:variant!=='about-article',aboutAria:variant==='retain-about-aria'}),'actual-panel-'+variant)
  assert.equal(result.status,variant==='about-article'?'PASSED':'FAILED',JSON.stringify(result))
})
for(const variant of ['valid','wrong-author','wrong-combination'])test('D24 metadata CAT-01: title heading before category span '+variant,async()=>{
  const result=await check('CAT-01',catalog('CAT-01',{itemTag:'button',wrapperTag:'li',categorySpan:true,labels:true,namedDetail:true,detailLayout:'paragraphs',detailAuthor:variant!=='wrong-author',combine:variant!=='wrong-combination'}),'category-tag-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
})
test('D24 metadata CAT-01: compact title survives a later inline detail heading',async()=>{
  const result=await check('CAT-01',catalog('CAT-01',{itemTag:'li',sparse:true,inlineDetail:true,detailNameParagraph:true}),'compact-inline-title')
  assert.equal(result.status,'PASSED',JSON.stringify(result))
})

for(const variant of ['valid','wrong-rating','wrong-drink','broken-combination','missing-rating','missing-drink'])test('CAT-02: joined district-rating metadata '+variant,async()=>{
  const result=await check('CAT-02',catalog('CAT-02',{coffeeMetaSeparator:' · ',coffeeMissingRating:variant==='missing-rating',missingDescription:variant==='missing-drink',detailRating:variant==='wrong-rating'?'4.0':'4.5',detailDescription:variant!=='wrong-drink',combine:variant!=='broken-combination'}),'joined-coffee-'+variant)
  assert.equal(result.status,variant==='valid'?'PASSED':'FAILED',JSON.stringify(result))
})
for(const separator of [' ｜ ','·'])test('CAT-02: joined district-rating metadata separator '+separator,async()=>{
  const result=await check('CAT-02',catalog('CAT-02',{coffeeMetaSeparator:separator}),'joined-coffee-separator-'+separator.codePointAt(separator.trim()?separator.indexOf(separator.trim()):0))
  assert.equal(result.status,'PASSED',JSON.stringify(result))
})
for(const variant of ['extra-address','address-instead-of-drink'])test('CAT-02: joined district-rating must not manufacture a drink '+variant,async()=>{
  const result=await check('CAT-02',catalog('CAT-02',{coffeeMetaSeparator:' · ',coffeeExtraAddress:variant==='extra-address',missingDescription:variant==='extra-address',coffeeAddressInsteadOfDrink:variant==='address-instead-of-drink'}),'joined-coffee-no-drink-'+variant)
  assert.equal(result.status,'FAILED',JSON.stringify(result))
})

// Independent implementation of compact labelled metadata and paragraph-only inline details.
function anonymousToolCatalog(failure = '') {
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><body><input aria-label="搜索"><select aria-label="类别">
    <option>全部</option><option>构建</option><option>测试</option><option>文档</option></select><ul></ul><p id="empty" hidden>没有匹配的工具</p>
    <script>
    const failure=${JSON.stringify(failure)}, groups=['构建','测试','文档'];
    const items=Array.from({length:9},(_,i)=>({name:'工具'+i,category:groups[i%3],summary:'简介'+i}));
    const list=document.querySelector('ul'),search=document.querySelector('input'),select=document.querySelector('select');
    function render(){list.replaceChildren();for(const item of items.filter(x=>(select.value==='全部'||x.category===select.value||(failure==='combination'&&search.value))&&x.name.includes(search.value))){
      const li=document.createElement('li'),name=document.createElement('button'),meta=document.createElement('p'),summary=document.createElement('p');name.textContent=item.name;
      meta.textContent=(failure==='category'?'':'类别：'+item.category)+(failure==='license'?'':'　许可证：MIT');
      summary.textContent=item.summary;li.append(name,meta);if(failure!=='summary')li.append(summary);
      name.onclick=()=>{if(failure==='no-expansion')return;const old=li.querySelector('.expanded');if(old){old.remove();return}
        const p=document.createElement('p');p.className='expanded';p.textContent=failure==='wrong-license'?'许可证：Wrong license':item.name+' 的补充使用说明';li.append(p)};list.append(li)}
      document.querySelector('#empty').hidden=list.children.length>0}
    search.oninput=render;select.onchange=render;render();</script></body></html>`
}
for (const failure of ['', 'license', 'category', 'summary', 'no-expansion', 'wrong-license', 'combination'])
  test('D25 CAT-03 anonymous inline details: ' + (failure || 'valid'), async () => {
    const result = await check('CAT-03', anonymousToolCatalog(failure), 'anonymous-tool-' + (failure || 'valid'))
    assert.equal(result.status, failure ? 'FAILED' : 'PASSED', JSON.stringify(result))
  })
