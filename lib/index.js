import Slack from 'slack-node'
import request from 'request'
import qs from 'querystring'
import url from 'url'

let slack = new Slack(process.env.API_TOKEN)
slack.setWebhook(process.env.WEBHOOK_URL)

let messages = []
let companies = []

let sendMessage = (text) => new Promise((resolve, reject) => {
  console.log('sendMessage', text)
  slack.webhook({
    channel: '#' + process.env.CHANNEL,
    username: process.env.BOT_NAME,
    mrkdwn: true,
    text: text
  }, function (err, response) {
    // console.log(response)
    resolve()
  })
})

let parseCompanyFromMessage = (msg) => {
  console.log('parse company from', msg.text)
  let entities = msg.text.split('\n')

  let domain
  try { domain = /\|(.*)>/.exec(entities[2])[1] } catch (err) {}

  companies.push({ company: entities[0], type: entities[1], domain: domain, new: true })
}

/**
 * Check for new messages and add them to messages array if exists
 */
let processNewMessages = async() => {
  let lastOldest

  let channelId = await new Promise((resolve, reject) => slack.api('channels.list', (err, resp) => {
    if (err) reject(err)
    resolve(resp.channels.filter(i => i.name === process.env.CHANNEL)[0].id)
  }))

  let getNewMessages = () => new Promise(async(resolve, reject) => {
    console.log('getNewMessages')

    await new Promise(resolve => setTimeout(() => resolve(), 3000))

    slack.api('channels.history', {
      channel: channelId,
      oldest: lastOldest
    }, (err, resp) => {
      let messages = resp.messages

      let init = false
      if (!lastOldest) {
        init = true
      }
      lastOldest = messages[0] ? parseFloat(messages[0].ts) + 0.000001 : lastOldest
      messages = messages.filter(i => !i.bot_id)
      console.log('messages', messages)
      if (!init) { messages.forEach(m => parseCompanyFromMessage(m)) }
      resolve()
    })
  })

  while (true) {
    let newMessages = await getNewMessages()
  }
}

/**
 * Processing entities in companies array
 */
let handleCompanies = async() => {
  let handle = () => new Promise(async resolve => {
    console.log('handleCompanies', companies)

    companies = companies.filter(c => !c.finished)

    companies = companies.map(c => {
      if (c.new) {
        sendMessage(`Looking for ${c.type} people at ${c.company} company` + (c.domain ? ` (${c.domain})` : ''))
        c.new = false
      }
      if (!c.requesting) {
        console.log('REQUEST')
        c.requesting = true
        request.get(process.env.EMAILFINDER_URL + 'api/find?' + qs.stringify({
          company: c.company,
          domain: c.domain,
          type: c.type
        }), (err, resp, body) => {
          console.log('err, body', err, body)
          body = JSON.parse(body)
          c.finished = true

          let template = ''
          if (body.people.length > 0) {
            template = `Here are the top *${c.type}* people at *${c.company}*\n>>>`
            body.people.forEach((p, index) => template += ` > ${p.name} | ${p.title} | ${p.email} _${parseInt(p.confidence*100)}% confidence_\n`)
          } else {
            template = `*${c.company}*: _Can\'t find any related contacts_`
          }
          sendMessage(template)
        })
      }
      return c
    })

    await new Promise(resolve => setTimeout(() => resolve(), 3000))

    resolve()
  })

  while (true) {
    let res = await handle()
  }
}

processNewMessages()
handleCompanies()
