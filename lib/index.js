import Slack from 'slack-node'

let slack = new Slack(process.env.API_TOKEN)
slack.setWebhook(process.env.WEBHOOK_URL)

let messages = []
let companies = []

let sendMessage = (text) => new Promise((resolve, reject) => {
  console.log('sendMessage', text)
  slack.webhook({
    channel: '#' + process.env.CHANNEL,
    username: process.env.BOT_NAME,
    text: text
  }, function (err, response) {
    // console.log(response)
    resolve()
  })
})

let parseCompanyFromMessage = (msg) => {
  companies.push({ name: msg.text, new: true })
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
      resolve(init ? [] : messages)
    })
  })

  while (true) {
    let newMessages = await getNewMessages()

    if (newMessages.length) {
      messages = messages.concat(newMessages)
    }
  }
}

/**
 * // TODO:
 */
let handleMessages = async() => {
  let handle = () => new Promise((resolve, reject) => {
    console.log('handleMessages', messages)

    messages = messages.filter((i) => {
      parseCompanyFromMessage(i)
      return false
    })

    setTimeout(() => resolve(), 3000)
  })

  while (true) {
    let res = await handle()
  }
}

let handleCompanies = async() => {
  let handle = () => new Promise(async resolve => {
    console.log('handleCompanies', companies)

    await new Promise(resolve => setTimeout(() => resolve(), 3000))

    companies = companies.map(c => {
      if (c.new) {
        sendMessage('new company ' + c.name)
        c.new = false
      }
      return c
    })
    resolve()
  })

  while (true) {
    let res = await handle()
  }
}

processNewMessages()
handleMessages()
handleCompanies()
