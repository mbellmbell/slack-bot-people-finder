import extend from 'extend-or-modify'

let config = {
  env: {
    testing: {},
    development: {},
    production: {}
  }
}

export default extend(config, './config.mod.js')
