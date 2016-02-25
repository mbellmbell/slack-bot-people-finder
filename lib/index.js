import Slack from 'slack-node'
import request from 'request'
import qs from 'querystring'
import url from 'url'

let slack = new Slack(process.env.API_TOKEN)
slack.setWebhook(process.env.WEBHOOK_URL)

let messages = []
let items = []

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

let parseItemFromMessage = (msg) => {
  let detectType = (msg) => {
    let text = msg.text
    let parts = text.split(/ (at|@) /)

    if (parts.length !== 3) {
      throw new Error('Unknown type')
    }

    let parts2 = parts[0].split(' ')
    return parts2.length === 2 ? 'person' : 'company'
  }

  try {
    let type = detectType(msg)
    console.log('type', type)

    let domain
    try {
      domain = /(\||\/\/)(.*?)(\||>)/.exec(msg.text)[2]
    } catch (e) {}
    msg.text = msg.text.replace(/<.*>/, '')
    let hint
    try {
      hint = /hint:(.*)( |$)/.exec(msg.text)[1]
      console.log('hint', hint)
      msg.text = msg.text.replace(/hint:(.*)( |$)/, '')
    } catch (e) {}
    let regex_result = /(.*) (at|@) (.*)/.exec(msg.text)

    items.push({
      type: type,
      company: regex_result[3].trim(),
      role: regex_result[1].trim(),
      name: regex_result[1].trim(),
      domain: domain,
      new: true,
      hint: hint
    })
  } catch (err) {
    sendMessage(`I don't understand. The format is:\n[senior|junior] sales|finance|executive|etc. at company`)
  }
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
      if (!init) { messages.forEach(m => parseItemFromMessage(m)) }
      resolve()
    })
  })

  while (true) {
    let newMessages = await getNewMessages()
  }
}

/**
 * Processing entities in items array
 */
let handleCompanies = async() => {
  let handle = () => new Promise(async resolve => {
    console.log('handleCompanies', items)

    items = items.filter(c => !c.finished)

    items = items.map(c => {
      if (c.new) {
        if (c.type === 'company') { sendMessage(`Looking for ${c.role} people at ${c.company} company` + (c.domain ? ` (${c.domain})` : '')) }
        if (c.type === 'person') {
          sendMessage(`Looking for ${c.name} email`)
        }
        c.new = false
      }
      if (!c.requesting) {
        c.requesting = true
        if (c.type === 'person') {
          request.get(process.env.EMAILFINDER_URL + 'api/findPerson?' + qs.stringify({
            company: c.company,
            domain: c.domain,
            first_name: c.name.split(' ')[0],
            last_name: c.name.split(' ')[1]
          }), (err, resp, body) => {
            console.log('err, resp, body', err, body)
            c.finished = true
            try {
              body = JSON.parse(body)
              sendMessage(`${body.email||'Email not found'} ${body.confidence ? '_'+parseInt(body.confidence*100) + '% confidence_' : ''}`)
            } catch (e) {
              sendMessage(`Got error: ${e}`)
            }
          })
        }
        if (c.type === 'company') {
          request.get({
            url: process.env.EMAILFINDER_URL + 'api/find?' + qs.stringify({
              company: c.company,
              domain: c.domain,
              type: c.role,
              hint: c.hint
            }),
            timeout: 1000 * 60 * 4
          }, (err, resp, body) => {
            console.log('err, body', err, body)
            c.finished = true

            try { body = JSON.parse(body) } catch (parseError) {
              if (err || parseError) {
                return sendMessage(`Error getting ${c.company} information ${err||parseError}`)
              }
            }

            let template = ''
            if (body.people.length > 0) {
              template = `Here are the top *${c.role}* people at *${c.company}*\n>>>`
              body.people.forEach((p, index) => template += ` > ${p.name} | ${p.title} | ${p.email||'_(No email found)_'} ${p.confidence ? '_'+parseInt(p.confidence*100) + '% confidence_' : ''}\n`)
            } else {
              template = `*${c.company}*: _Can\'t find any related contacts_`
            }
            sendMessage(template)
          })
        }
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
