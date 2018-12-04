const discord = require('discord.js')
const winston = require('winston')
const auth = require('./auth.json')
const jsonfile = require('jsonfile')

// Configure logger settings
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
        transports: [
        new winston.transports.File({ filename: 'combined.log' })
        ]
})
logger.add(new winston.transports.Console({
    format: winston.format.simple()
}))
logger.level = 'debug'

// Initialize Discord Client
servers = {}
const client = new discord.Client()
client.login(auth.token)

function hour_timer() {
    for (const key in servers) {
        server = servers[key]
        if(!server.is_ready || !server.has_winner) {
            return
        }
        
        server.add_role(server.winner)
        if (server.winner_is_on) {
            server.reduce_time()
            server.write_settings()
            .then(() => {
                const msg = server.winner_str
                server.send_message(msg )
            })
            .catch(err => {
                msg.reply('Error ' + err)
                logger.error(err)
            })
        }
        
        if (server.time_expired) {
            const id = server.remove_winner()
            server.remove_role(id)
            if (server.is_configured) {
                new_roll(server)
                .catch(err => {
                    msg.reply('Error ' + err)
                    logger.error(err)
                })
            }
        }
    }
}

client.on('error', function (error) {
    logger.error('Unexpected error')
    logger.error(error.message)
    logger.error(error.filename)
    logger.error(error.lineNumber)
})

var once = true
client.on('ready', function (evt) {
    logger.info('Connected')
    logger.info('Logged in as: ')
    logger.info(client.user.username + ' - (' + client.user.id + ')')
    
    if(once) {
        logger.info("Servers:")
        client.guilds.forEach((guild) => {
            logger.info(' - ' + guild.name + ' (' + guild.id + ')')
            logger.info('Reading settings')
            servers[guild.id] = new Server(guild.id, guild)
        })
        
        setInterval(hour_timer, 1000 * 60 * 60)
        once = false
    }
})

client.on('guildMemberRemove', member => {
    const server = servers[member.guild.id]
    if(!server.is_ready || !server.has_winner) {
        return
    }
    
    if(server.is_winner(member.id)) {
        server.send_message('Our kang has left ;-;')
        if (server.is_configured) {
            new_roll(server)
            .catch(err => {
                msg.reply('Error ' + err)
                logger.error(err)
            })
        }
    }
})

client.on('message', msg => {
    const server = servers[msg.guild.id]
    if(!server.is_ready) {
        return
    }
    
    var commands = msg.content.toLowerCase().split(' ')
    switch(commands.shift()) {
        case 'lotto':
            switch(commands.shift()) {
                case 'set':
                    switch(commands.shift()) {
                        case 'channel':
                            const channel = msg.mentions.channels.first()
                            if(channel) {
                                server.channel = channel.id
                                server.write_settings()
                                .then(() => {
                                    msg.reply('Set channel <#' + channel.id + '>')
                                })
                                .catch(err => {
                                    msg.reply('Error ' + err)
                                    logger.error(err)
                                })
                            }
                            break
                            
                        case 'role':
                            const role = msg.mentions.roles.first()
                            if(role) {
                                server.role = role.id
                                server.write_settings()
                                .then(() => {
                                    msg.reply('Set role <@&' + role.id + '>')
                                })
                                .catch(err => {
                                    msg.reply('Error ' + err)
                                    logger.error(err)
                                })
                            }
                            break
                            
                        case 'hours':
                            const hours = commands.shift()
                            if(hours) {
                                server.hours = hours
                                server.write_settings()
                                .then(() => {
                                    msg.reply('Set hours ' + hours)
                                })
                                .catch(err => {
                                    msg.reply('Error ' + err)
                                    logger.error(err)
                                })
                            }
                            break
                            
                        case 'default':
                            break
                    }
                    break
                    
                        case 'get':
                            switch(commands.shift()) {
                                case 'channel':
                                    msg.reply('Channel set <#' + server.channel + '>')
                                    break
                                case 'role':
                                    msg.reply('Role set <@&' + server.role + '>')
                                    break
                                case 'hours':
                                    msg.reply('Hours set ' + server.hours)
                                    break
                                case 'winners':
                                    if(server.has_winner) {
                                        msg.reply('Lucky winners: ' + server.winners_str)
                                    } else {
                                        msg.reply('There are no winners ;-;')
                                    }
                                    break
                                case 'default':
                                    break
                            }
                            break
                            
                                case 'skip':
                                    if (server.is_configured) {
                                        const id = server.remove_winner()
                                        server.remove_role(id)
                                        if (server.has_winner) {
                                            server.write_settings()
                                            .then(() => {
                                                const id = server.winner
                                                return server.add_role(id)
                                            })
                                            .then(() => {
                                                return server.congratulate_winner()
                                            })
                                            .catch(err => {
                                                msg.reply('Error ' + err)
                                                logger.error(err)
                                            })
                                        } else {
                                            new_roll(server)
                                            .catch(err => {
                                                msg.reply('Error ' + err)
                                                logger.error(err)
                                            })
                                        }
                                    } else {
                                        msg.reply('Settings need to be configured still')
                                    }
                                    break
                                    
                                case 'go':
                                    if (server.is_configured) {
                                        const id = server.winner
                                        server.remove_role(id)
                                        new_roll(server)
                                        .catch(err => {
                                            msg.reply('Error ' + err)
                                            logger.error(err)
                                        })
                                    } else {
                                        msg.reply('Settings need to be configured still')
                                    }
                                    
                                    break
                                    
                                case 'default':
                                    break
            }
            break
            
                                case 'default':
                                    break
    }
})

function new_roll(server) {
    const id = server.pick_winner()
    server.add_winner(id)
    logger.debug('Picked new winner ' + id)
    return server.write_settings()
    .then(() => {
        return server.add_role(id)
    })
    .then(() => {
        return server.congratulate_winner()
    })
}

class Winner {
    constructor(id, hours) {
        this.id = id
        this.hours = hours
    }
}

Winner.prototype.toString = function() {
    return '<@' + this.id + '>' + '(' + this.hours + ')'
}

class Server {
    constructor(id, guild) {
        this.id = id
        this.channel = null
        this.role = null
        this.hours = null
        this._guild = guild
        this._winners = []
        this._ready = false
        
        jsonfile.readFile('./servers/' + this.id + '.json')
        .then(settings => { 
            this.channel = settings['Channel']
            this.role = settings['Role']
            this.hours = settings['Hours']
            const winners = settings['Winners']
            winners.forEach(winner => {
                this._winners.push(new Winner(winner['id'], winner['hours']))
            })
        })
        .catch(err => {
            if(err.errno == -2) {
                logger.info('No server settings found')
            } else {
                logger.error(err)
            }
        })
        .then(() => {
            this._ready = true
        })
    }
    
    get is_ready() {
        return this._ready
    }
    
    get is_configured() {
        return this.channel != null &&
        this.role != null &&
        this.hours != null
    }
    
    get winner_str() {
        return this._winners[0].toString()
    }
    
    get winners_str() {
        return this._winners.map(winner => winner.toString()).join(' ')
    }
    
    get has_winner() {
        return this._winners.length > 0
    }
    
    get winner_is_on() {
        const member = this._guild.members.get(this.winner)
        return member != undefined
    }
    
    get winner() {
        if (this.has_winner) {
            return this._winners[0].id
        }
        return undefined
    }
    
    pick_winner() {
        return this._guild.members.random().id
    }
    
    add_winner(id) {
        const winner = new Winner(id, this.hours)
        this._winners.unshift(winner)
    }
    
    remove_winner() {
        return this._winners.shift().id
    }
    
    is_winner(id) {
        return id == this.winner
    }
    
    reduce_time() {
        if (this.has_winner) {
            this._winners[0].hours = this._winners[0].hours - 1
        }
    }
    
    get time_expired() {
        logger.debug(this._winners[0].hours)
        if (this.has_winner) {
            return this._winners[0].hours <= 0
        }
        return false
    }
    
    add_role(id) {
        const role = this._guild.roles.get(this.role)
        const member = this._guild.members.get(id)
        if(!role || !member) {
            return
        }
        return member.addRole(role)
    }
    
    remove_role(id) {
        const role = this._guild.roles.get(this.role)
        const member = this._guild.members.get(id)
        if(!role|| !member) {
            return
        }
        return member.removeRole(role)
    }
    
    congratulate_winner() {
        return new Promise((resolve, reject) => {
            if (this.has_winner) {
                resolve(this.send_message('Congratulations <@' + this.winner + '> you have won the role ' + '<@&' + this.role + '> for ' + this.hours + ' hours'))
            } else {
                reject(Error('No winner to congratulate'))
            }
        })
    }
    
    send_message(msg) {
        logger.debug('sending msg ' + msg)
        return new Promise((resolve, reject) => {
            const channel = this._guild.channels.get(this.channel)
            if(channel) {
                return channel.send(msg)
            } else {
                reject(Error('Channel setting is invalid'));
            }
        })
    }
    
    write_settings() {
        return jsonfile.writeFile('./servers/' + this.id + '.json', {
            Channel: this.channel,
            Role: this.role,
            Hours: this.hours,
            Winners: this._winners
        })
    }
}
