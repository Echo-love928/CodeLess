import assert from 'node:assert/strict'
import {expect} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'

const hash=value=>'sha256:'+createHash('sha256').update(value,'utf8').digest('hex')
export async function checkVersionPanel({page,call,app,version,task,created,evidence}) {
  const reads=[]
  page.on('response',response=>{
    const path=new URL(response.url()).pathname
    if(path.includes('/versions/')&&path.includes('/files'))reads.push({path,status:response.status()})
  })
  const row=id=>page.locator(`[data-version-id="${id}"]`)
  const source=page.getByLabel('文件内容')
  const frame=page.frameLocator('iframe')
  const verify=async(id,name)=>{
    await row(id).getByRole('button',{name:'查看源码并预览',exact:true}).click()
    await expect(frame.getByTestId('profile-name')).toHaveText(name)
    await page.getByLabel('当前文件',{exact:true}).selectOption('src/components/ProfileCard.vue')
    await expect(source).toContainText(name)
    await expect(page.locator('.source-panel')).toContainText(id)
    await expect(page.locator('.preview-panel__controls')).toContainText(id)
    const manifest=await call(`versions/${id}/files`);assert.equal(manifest.status,200)
    const content=await call(`versions/${id}/files/content?path=src%2Fcomponents%2FProfileCard.vue`);assert.equal(content.status,200)
    assert.equal(await source.textContent(),content.body.content)
    assert.equal(hash(content.body.content),content.body.digest)
    assert.equal(content.body.sourceDigest,manifest.body.sourceDigest)
    assert.equal(content.body.versionId,id)
    return {versionId:id,sourceDigest:content.body.sourceDigest,fileDigest:content.body.digest,contentMatched:true}
  }
  await expect(row(version)).toBeVisible()
  const first=await verify(version,'Ada Lovelace')
  await expect(row(version).getByRole('link',{name:task})).toHaveAttribute('href',new RegExp(task))
  await row(created.baseVersionId).getByRole('button',{name:'查看源码',exact:true}).click()
  await expect(page.locator('.source-panel [role="alert"]')).toContainText('暂无可读取源码快照')
  await expect(frame.getByTestId('profile-name')).toHaveText('Ada Lovelace')
  await page.screenshot({path:join(evidence,'T2-T3-draft-unavailable.png'),fullPage:true})

  const generate=async(prompt,expected)=>{
    const started=await call('tasks','POST',{applicationId:app,prompt});assert.equal(started.status,202)
    let state;const deadline=Date.now()+90000
    do {
      state=await call('tasks/'+started.body.id);assert.equal(state.status,200)
      if(['READY','FAILED'].includes(state.body.status))break
      assert.ok(Date.now()<deadline,'D11 generation deadline exceeded')
      await new Promise(done=>setTimeout(done,500))
    } while(true)
    assert.equal(state.body.status,expected,JSON.stringify(state.body))
    await page.goto(`/workbench/${app}?taskId=${started.body.id}`)
    return state.body
  }
  const secondTask=await generate('D11-SECOND 静态人物展示页','READY')
  const latest=await call('applications/'+app);const second=latest.body.latestReadyVersionId
  assert.notEqual(second,version)
  const secondRead=await verify(second,'Hedy Lamarr')
  // Current diagnostics only names the second task; the first link must come
  // from persisted historical provenance returned by the owner-scoped list.
  await expect(row(version).getByRole('link',{name:task,exact:true})).toHaveAttribute('href',new RegExp(task))
  assert.equal((await call(`versions/${version}`)).body.taskId,task)
  await verify(version,'Ada Lovelace')
  await verify(second,'Hedy Lamarr')
  await page.screenshot({path:join(evidence,'T1-real-version-switch.png'),fullPage:true})
  const failedTask=await generate('D11-FAIL 受控缺失组件构建用例','FAILED')
  const list=await call(`applications/${app}/versions?page=0&size=20`);assert.equal(list.status,200)
  const failed=list.body.items.find(v=>v.status==='FAILED');assert.ok(failed)
  assert.equal((await call('applications/'+app)).body.latestReadyVersionId,second)
  await expect(row(failed.id)).toContainText('构建 FAILED；退出码')
  await row(failed.id).getByRole('button',{name:'查看源码',exact:true}).click()
  await page.getByLabel('当前文件',{exact:true}).selectOption('src/pages/HomePage.vue')
  await expect(source).toContainText('MissingCard.vue')
  await expect(frame.getByTestId('profile-name')).toHaveText('Hedy Lamarr')
  assert.equal((await call(`applications/${app}/versions/${failed.id}/preview-credentials`,'POST')).status,409)
  await page.screenshot({path:join(evidence,'T3-real-failure-preserves-preview.png'),fullPage:true})
  await verify(second,'Hedy Lamarr')
  await expect(source).toContainText('<script>window.__sourceExecuted=true</script>')
  await expect(page.locator('.source-panel script, .source-panel img')).toHaveCount(0)
  assert.equal(await page.evaluate(()=>('__sourceExecuted' in window)),false)
  await page.screenshot({path:join(evidence,'T4-real-source-text.png'),fullPage:true})
  assert.ok(reads.length>0&&reads.every(read=>[200,409].includes(read.status)))
  await writeFile(join(evidence,'D11-B-panel.json'),JSON.stringify({modelProvider:'deterministic-mock',modelQualityEvidence:false,
    platformApiFixture:false,signingFixture:false,realDatabase:true,realDocker:true,realChromium:true,
    first,second:secondRead,firstTaskId:task,secondTaskId:secondTask.id,failedTaskId:failedTask.id,
    failedVersionId:failed.id,draftVersionId:created.baseVersionId,failedPreservedPreview:true,draftNotPreviewed:true,scriptExecuted:false,reads},null,2))
}
