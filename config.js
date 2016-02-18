import extend from 'extend-or-modify'

let config = {
  env: {
    testing: {},
    development: {},
    production: {
      WEBHOOK_URL: 'https://hooks.slack.com/services/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',
      CHANNEL: 'general',
      BOT_NAME: 'Emailfinder Bot',
      API_TOKEN: 'xoxp-21459716064-21459923766-21466998982-b015a2e4ec'
    }
  }
}

export default extend(config, './config.mod.js')
