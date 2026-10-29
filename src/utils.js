const axios = require('axios')
const { globalApiKey, disabledCallbacks, enableWebHook } = require('./config')
const { logger } = require('./logger')
const ChatFactory = require('whatsapp-web.js/src/factories/ChatFactory')
const Client = require('whatsapp-web.js').Client
const { Chat, Message } = require('whatsapp-web.js/src/structures')

// Trigger webhook endpoint
const triggerWebhook = (webhookURL, sessionId, dataType, data) => {
  if (enableWebHook) {
    const agent = new (require('https').Agent)({ rejectUnauthorized: false });
    axios.post(webhookURL, { dataType, data, sessionId }, { headers: { 'x-api-key': globalApiKey }, httpsAgent: agent })
      .then(() => logger.debug({ sessionId, dataType, data: data || '' }, `Webhook message sent to ${webhookURL}`))
      .catch(error => logger.error({ sessionId, dataType, err: error, data: data || '' }, `Failed to send webhook message to ${webhookURL}`))
  }
}

// Function to send a response with error status and message
const sendErrorResponse = (res, status, message) => {
  res.status(status).json({ success: false, error: message })
}

// Function to wait for a specific item not to be null
const waitForNestedObject = (rootObj, nestedPath, maxWaitTime = 10000, interval = 100) => {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const checkObject = () => {
      const nestedObj = nestedPath.split('.').reduce((obj, key) => obj ? obj[key] : undefined, rootObj)
      if (nestedObj) {
        // Nested object exists, resolve the promise
        resolve()
      } else if (Date.now() - start > maxWaitTime) {
        // Maximum wait time exceeded, reject the promise
        logger.error('Timed out waiting for nested object')
        reject(new Error('Timeout waiting for nested object'))
      } else {
        // Nested object not yet created, continue waiting
        setTimeout(checkObject, interval)
      }
    }
    checkObject()
  })
}

const isEventEnabled = (event) => {
  return !disabledCallbacks.includes(event)
}

const sendMessageSeenStatus = async (message) => {
  try {
    const chat = await message.getChat()
    if (chat && typeof chat.sendSeen === 'function') {
      await chat.sendSeen()
    } else {
      logger.warn({ chatId: chat?.id?.serialized || chat?.id }, 'Chat sendSeen method not available')
    }
  } catch (error) {
    logger.error({ err: error, messageId: message.id?.serialized }, 'Failed to send seen status')
  }
}

const decodeBase64 = function * (base64String) {
  const chunkSize = 1024
  for (let i = 0; i < base64String.length; i += chunkSize) {
    const chunk = base64String.slice(i, i + chunkSize)
    yield Buffer.from(chunk, 'base64')
  }
}

const sleep = function (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const exposeFunctionIfAbsent = async (page, name, fn) => {
  const exist = await page.evaluate((name) => {
    return !!window[name]
  }, name)
  if (exist) {
    return
  }
  await page.exposeFunction(name, fn)
}

const patchWWebLibrary = async (client) => {
  // MUST be run after the 'ready' event fired
  Client.prototype.getChats = async function (searchOptions = {}) {
    const chats = await this.pupPage.evaluate(async (searchOptions) => {
      return await window.WWebJS.getChats({ ...searchOptions })
    }, searchOptions)

    return chats.map(chat => ChatFactory.create(this, chat))
  }

  Chat.prototype.fetchMessages = async function (searchOptions) {
    const messages = await this.client.pupPage.evaluate(async (chatId, searchOptions) => {
      const msgFilter = (m) => {
        if (m.isNotification) {
          return false
        }
        if (searchOptions && searchOptions.fromMe !== undefined && m.id.fromMe !== searchOptions.fromMe) {
          return false
        }
        if (searchOptions && searchOptions.since !== undefined && Number.isFinite(searchOptions.since) && m.t < searchOptions.since) {
          return false
        }
        return true
      }

      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false })
      let msgs = chat.msgs.getModelsArray().filter(msgFilter)

      if (searchOptions && searchOptions.limit > 0) {
        while (msgs.length < searchOptions.limit) {
          // newer whatsapp-web.js no longer exposes window.Store
          const loadedMessages = window.Store?.ConversationMsgs
            ? await window.Store.ConversationMsgs.loadEarlierMsgs(chat)
            : await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat })
          if (!loadedMessages || !loadedMessages.length) break
          msgs = [...loadedMessages.filter(msgFilter), ...msgs]
        }

        if (msgs.length > searchOptions.limit) {
          msgs.sort((a, b) => (a.t > b.t) ? 1 : -1)
          msgs = msgs.splice(msgs.length - searchOptions.limit)
        }
      }

      return msgs.map(m => window.WWebJS.getMessageModel(m))
    }, this.id._serialized, searchOptions)

    return messages.map(m => new Message(this.client, m))
  }

  await client.pupPage.evaluate(() => {
    // hotfix for https://github.com/pedroslopez/whatsapp-web.js/pull/3643
    window.WWebJS.getChats = async (searchOptions = {}) => {
      const chatFilter = (c) => {
        if (searchOptions && searchOptions.unread === true && c.unreadCount === 0) {
          return false
        }
        if (searchOptions && searchOptions.since !== undefined && Number.isFinite(searchOptions.since) && c.t < searchOptions.since) {
          return false
        }
        return true
      }

      const allChats = (window.Store?.Chat || window.require('WAWebCollections').Chat).getModelsArray()

      const filteredChats = allChats.filter(chatFilter)

      return await Promise.all(
        filteredChats.map(chat => window.WWebJS.getChatModel(chat))
      )
    }

    // hotfix for https://github.com/pedroslopez/whatsapp-web.js/pull/3703
    // newer whatsapp-web.js has no window.Store and already ships this fix
    if (!window.Store) return
    window.Store.FindOrCreateChat = window.require('WAWebFindChatAction')
    window.WWebJS.getChat = async (chatId, { getAsModel = true } = {}) => {
      const isChannel = /@\w*newsletter\b/.test(chatId)
      const chatWid = window.Store.WidFactory.createWid(chatId)
      let chat

      if (isChannel) {
        try {
          chat = window.Store.NewsletterCollection.get(chatId)
          if (!chat) {
            await window.Store.ChannelUtils.loadNewsletterPreviewChat(chatId)
            chat = await window.Store.NewsletterCollection.find(chatWid)
          }
        } catch (err) {
          chat = null
        }
      } else {
        chat = window.Store.Chat.get(chatWid) || (await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid))?.chat
      }

      return getAsModel && chat
        ? await window.WWebJS.getChatModel(chat, { isChannel })
        : chat
    }
  })
}

/**
 * Resolve the phone number of the other party of a message using only
 * WhatsApp Web's local data (no queries to WhatsApp servers), so that
 * webhook consumers don't need extra API lookups for @lid senders.
 * Returns null when nothing could be resolved.
 */
const getMessageContactInfo = async (client, message) => {
  try {
    const id = message.fromMe ? message.to : (message.author || message.from)
    if (!id || typeof id !== 'string' || id === 'status@broadcast' || id.endsWith('@g.us') || id.endsWith('@newsletter')) return null

    const info = await client.pupPage.evaluate((id) => {
      const wid = window.require('WAWebWidFactory').createWid(id)
      const ApiContact = window.require('WAWebApiContact')
      const serialize = (w) => w ? (w._serialized || w.$1 || null) : null
      const isLid = wid.server === 'lid'
      const lid = isLid ? wid : ApiContact.getCurrentLid(wid)
      const pn = isLid ? ApiContact.getPhoneNumber(wid) : wid
      const phoneId = serialize(pn)
      const number = phoneId ? phoneId.split('@')[0] : null
      let formattedNumber = null
      let countryCode = null
      if (number) {
        try { formattedNumber = window.require('WAWebPhoneUtils').formattedPhoneNumber(number + '@s.whatsapp.net') } catch (e) {}
        try { countryCode = window.require('WAPhoneFindCC').findCC(number) } catch (e) {}
      }
      return { lid: serialize(lid), phoneId, number, formattedNumber, countryCode }
    }, id)

    // for own messages notifyName is our own name, not the other party's
    return { id, ...info, pushname: message.fromMe ? null : (message._data?.notifyName || null) }
  } catch (error) {
    logger.debug({ err: error }, 'Failed to resolve message contact info')
    return null
  }
}

module.exports = {
  getMessageContactInfo,
  triggerWebhook,
  sendErrorResponse,
  waitForNestedObject,
  isEventEnabled,
  sendMessageSeenStatus,
  decodeBase64,
  sleep,
  exposeFunctionIfAbsent,
  patchWWebLibrary
}
