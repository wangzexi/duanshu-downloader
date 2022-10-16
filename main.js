const fs = require('fs').promises
const puppeteer = require('puppeteer')
const shell = require('shelljs')
const timers = require('timers/promises')

main()

async function main() {
  const browser = await puppeteer.launch({
    headless: true
  })
  const page = await browser.newPage()

  await page.goto('https://zhendahu.duanshu.com/#/system/mlogin?successUrl=https%3A%2F%2Fzhendahu.duanshu.com%2F%23%2Fmine', { waitUntil: 'networkidle0' })
  await page.screenshot({ path: 'qrcode.png' })
  console.log('请扫码登录：qrcode.png')

  await page.waitForNavigation()
  await fs.unlink('qrcode.png')
  console.log('跳转课程章节页面')

  const onChaptersResponse = async (response) => {
    const request = response.request()
    if (request.method() !== 'GET') return

    const url = request.url()
    if (!/courses\/c1cb5f2585fa4f68a7f34b5bcb23fb9a\/chapters/.test(url)) return
    page.off('response', onChaptersResponse)

    // 下载课程全集目录
    const chapters = await response.json()
    await fs.writeFile('chapters.json', JSON.stringify(chapters, null, 2))

    // 下载单集
    let doneClasses = []
    try {
      doneClasses = JSON.parse(await fs.readFile('doneClassIds.json'))
    } catch (_) { }

    const downloadClass = async (i, classId, title) => {
      const page = await browser.newPage()

      page.on('response', async (response) => {
        const request = response.request()
        const url = request.url()
        if (!/\.m3u8/.test(url)) return

        const res = shell.exec(`ffmpeg -y -i "${url}" -vcodec copy -acodec copy -absf aac_adtstoasc "downloads/${i}.${title}.mp4"`)
        if (res.code === 0) {
          doneClasses.push(classId)
          await fs.writeFile('doneClassIds.json', JSON.stringify(doneClasses, null, 2))
        }
        await page.close()
      })
      await page.goto(`https://zhendahu.duanshu.com/#/course/class/c1cb5f2585fa4f68a7f34b5bcb23fb9a/${classId}`)
    }

    // 遍历下载
    let i = 0;
    for (const chapter of chapters.response.data) {
      for (const { title, id } of chapter.class_content) {
        ++i;

        if (doneClasses.includes(id)) {
          console.log('跳过', title, id)
          continue
        }

        try {
          console.log('下载', title, id)
          await downloadClass(i, id, title)

          const delay = Math.floor(5 + Math.random() * 1)
          console.log('延迟', delay)
          await timers.setTimeout(delay * 1000)
        } catch (_) { }
      }
    }

    await browser.close()
    console.log('完成')
  }

  page.on('response', onChaptersResponse)
  await page.goto('https://zhendahu.duanshu.com/#/course/c1cb5f2585fa4f68a7f34b5bcb23fb9a')
}
