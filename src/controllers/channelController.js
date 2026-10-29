const { MessageMedia } = require('whatsapp-web.js')
const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')
const { logger } = require('../logger')

/**
 * @function
 * @async
 * @name getClassInfo
 * @description Gets information about a channel using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to get information for
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const getClassInfo = async (req, res) => {
  /*
    #swagger.summary = 'Получить информацию о канале'
    #swagger.description = '<p>Возвращает объект канала WhatsApp (newsletter) по его id: название, описание, метаданные, состояние mute, последнее сообщение.</p><p><b>Когда использовать:</b> проверить, что канал доступен этой сессии, и получить его название/описание перед публикацией или изменением настроек. Список своих каналов — <code>GET /client/getChannels</code>, поиск — <code>POST /client/searchChannels</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> должен быть id канала вида <code>120363098765432101@newsletter</code>. Личный чат (<code>@c.us</code>) или группа (<code>@g.us</code>) дадут 400 <code>The chat is not a channel</code>.</li><li>Канал, на который аккаунт не подписан и который не удалось загрузить, даёт 404 <code>Channel not Found</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, channel: {...}}</code>. Пример ответа сокращён: реальный объект содержит больше полей.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              }
            }
          },
          examples: {
            channel: { summary: 'Канал', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Объект канала (фрагмент).',
      content: {
        'application/json': {
          example: {
            success: true,
            channel: {
              id: { server: 'newsletter', user: '120363098765432101', _serialized: '120363098765432101@newsletter' },
              name: 'Новости магазина',
              description: 'Официальный канал магазина',
              isChannel: true,
              isGroup: false,
              unreadCount: 0,
              timestamp: 1730000000,
              isMuted: false,
              muteExpiration: 0,
              lastMessage: null,
              channelMetadata: { description: 'Официальный канал магазина', createdAtTs: 1700000000 }
            }
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    res.json({ success: true, channel: chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a message to a chat using the WhatsApp API
 *
 * @async
 * @function sendMessage
 * @param {Object} req - The request object containing the request parameters
 * @param {Object} req.body - The request body containing the chatId, content, contentType and options
 * @param {string} req.body.chatId - The chat id where the message will be sent
 * @param {string|Object} req.body.content - The message content to be sent, can be a string or an object containing the MessageMedia data
 * @param {string} req.body.contentType - The type of the message content, must be one of the following: 'string', 'MessageMedia', 'MessageMediaFromURL'
 * @param {Object} req.body.options - Additional options to be passed to the WhatsApp API
 * @param {string} req.params.sessionId - The id of the WhatsApp session to be used
 * @param {Object} res - The response object
 * @returns {Object} - The response object containing a success flag and the sent message data
 * @throws {Error} - If there is an error while sending the message
 */
const sendMessage = async (req, res) => {
  /*
    #swagger.summary = 'Опубликовать сообщение в канале'
    #swagger.description = '<p>Публикует сообщение (текст, изображение, видео и т.п.) в канале WhatsApp от имени текущего аккаунта.</p><p><b>Когда использовать:</b> рассылка новостей подписчикам канала, которым вы владеете или администрируете. Для личных чатов и групп используйте <code>POST /client/sendMessage</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Публиковать может только владелец или администратор канала.</li><li><code>contentType</code> поддерживает только <code>string</code>, <code>MessageMedia</code>, <code>MessageMediaFromURL</code>. Location, Contact и Poll здесь не поддерживаются (400 <code>invalid contentType</code>).</li><li>whatsapp-web.js в каналах поддерживает только текст, изображения, стикеры, gif, видео и голосовые. Если в <code>options</code> передать <code>sendMediaAsDocument</code>, <code>quotedMessageId</code>, <code>parseVCards</code> или <code>isViewOnce</code> со значением true, сообщение <b>не отправляется</b>, а ответ будет <code>{success: true, message: null}</code>.</li><li>В отличие от <code>/client/sendMessage</code>, здесь <code>options.media</code> не преобразуется в MessageMedia — не передавайте его, используйте <code>contentType: MessageMedia</code> и <code>options.caption</code>.</li><li>Размер JSON-тела ограничен <code>MAX_ATTACHMENT_SIZE</code> + 1 МБ (base64 увеличивает файл примерно на треть); большие файлы отправляйте по ссылке (<code>MessageMediaFromURL</code>).</li><li>По умолчанию добавляется <code>waitUntilMsgSent: true</code> — ответ приходит после фактической отправки.</li></ul><p><b>Ответ:</b> <code>{success: true, message: {...}}</code> — объект отправленного сообщения (или <code>null</code>, см. выше).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        "application/json": {
          schema: {
            type: 'object',
            required: ['chatId', 'contentType', 'content'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              contentType: {
                type: 'string',
                enum: ['string', 'MessageMedia', 'MessageMediaFromURL'],
                description: 'Тип содержимого. string — текст; MessageMedia — файл в base64 (content = {mimetype, data, filename, filesize}); MessageMediaFromURL — ссылка на файл, сервер скачает его сам (content = URL-строка). Любое другое значение — 400 invalid contentType.',
                example: 'string'
              },
              content: {
                description: 'Содержимое. Для string — текст сообщения. Для MessageMedia — объект {mimetype (обязателен, например image/jpeg), data (base64 без префикса data:...;base64,), filename (необязательно), filesize (необязательно)}. Для MessageMediaFromURL — строка с http(s)-ссылкой на файл.',
                example: 'Привет, подписчики!'
              },
              options: {
                type: 'object',
                description: 'Необязательные параметры отправки whatsapp-web.js (MessageSendOptions), например caption (подпись к медиа), mentions, linkPreview, sendAudioAsVoice, sendVideoAsGif, sendMediaAsSticker, sendMediaAsHd. По умолчанию добавляется waitUntilMsgSent: true. Не передавайте sendMediaAsDocument, quotedMessageId, parseVCards, isViewOnce — с ними сообщение в канал не отправится.',
                example: { caption: 'Новая коллекция' }
              },
              mediaFromURLOptions: {
                type: 'object',
                description: 'Только для MessageMediaFromURL: опции MessageMedia.fromUrl, например filename. unsafeMime всегда включён. По умолчанию {}.',
                example: { filename: 'catalog.pdf' }
              }
            }
          },
          examples: {
            string: { summary: 'Текст', value: { chatId: '120363098765432101@newsletter', contentType: 'string', content: 'Привет, подписчики!' } },
            MessageMedia: { summary: 'Изображение в base64 с подписью', value: { chatId: '120363098765432101@newsletter', contentType: 'MessageMedia', content: { mimetype: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', filename: 'image.png' }, options: { caption: 'Новая коллекция' } } },
            MessageMediaFromURL: { summary: 'Файл по ссылке', value: { chatId: '120363098765432101@newsletter', contentType: 'MessageMediaFromURL', content: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Example' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Сообщение отправлено (объект Message, фрагмент) либо message: null, если тип сообщения/опции не поддерживаются в каналах.',
      content: {
        'application/json': {
          examples: {
            sent: {
              summary: 'Отправлено',
              value: {
                success: true,
                message: {
                  id: { fromMe: true, remote: '120363098765432101@newsletter', id: '3EB0C767D82E4B5A1F2C', _serialized: 'true_120363098765432101@newsletter_3EB0C767D82E4B5A1F2C' },
                  body: 'Привет, подписчики!',
                  type: 'chat',
                  timestamp: 1730000000,
                  to: '120363098765432101@newsletter',
                  fromMe: true,
                  hasMedia: false
                }
              }
            },
            notSupported: { summary: 'Неподдерживаемые опции — не отправлено', value: { success: true, message: null } }
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. chatId принадлежит не каналу, либо contentType не из списка string / MessageMedia / MessageMediaFromURL.',
      content: {
        'application/json': {
          examples: {
            notChannel: { summary: 'Не канал', value: { success: false, error: 'The chat is not a channel' } },
            contentType: { summary: 'Неверный contentType', value: { success: false, error: 'invalid contentType' } }
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Исключение whatsapp-web.js / Puppeteer: нет прав на публикацию, не удалось скачать файл по URL, повреждённый base64, content не того типа (например, для MessageMedia передана строка) и т.п. В error — текст исключения.',
      content: { 'application/json': { schema: { '$ref': '#/definitions/ErrorResponse' } } }
    }
  */

  try {
    const { chatId, content, contentType, options, mediaFromURLOptions = {} } = req.body
    const sendOptions = { waitUntilMsgSent: true, ...options }
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    let messageOut
    switch (contentType) {
      case 'string':
        messageOut = await chat.sendMessage(content, sendOptions)
        break
      case 'MessageMediaFromURL': {
        const messageMediaFromURL = await MessageMedia.fromUrl(content, { unsafeMime: true, ...mediaFromURLOptions })
        messageOut = await chat.sendMessage(messageMediaFromURL, sendOptions)
        break
      }
      case 'MessageMedia': {
        const messageMedia = new MessageMedia(content.mimetype, content.data, content.filename, content.filesize)
        messageOut = await chat.sendMessage(messageMedia, sendOptions)
        break
      }
      default:
        return sendErrorResponse(res, 400, 'invalid contentType')
    }
    res.json({ success: true, message: messageOut })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Fetches messages from a specified channel.
 *
 * @function
 * @async
 *
 * @param {Object} req - The request object containing sessionId, chatId, and searchOptions.
 * @param {string} req.params.sessionId - The ID of the session associated with the chat.
 * @param {Object} req.body - The body of the request containing chatId and searchOptions.
 * @param {string} req.body.chatId - The ID of the chat from which to fetch messages.
 * @param {Object} req.body.searchOptions - The search options to use when fetching messages.
 *
 * @param {Object} res - The response object to send the fetched messages.
 * @returns {Promise<Object>} A JSON object containing the success status and fetched messages.
 *
 * @throws {Error} If the chat is not found or there is an error fetching messages.
 */
const fetchMessages = async (req, res) => {
  try {
    /*
    #swagger.summary = 'Загрузить сообщения канала'
    #swagger.description = '<p>Возвращает публикации канала, отсортированные от старых к новым. Служебные уведомления канала исключаются.</p><p><b>Когда использовать:</b> получить последние публикации канала (например, чтобы найти id сообщения или проверить, что публикация вышла).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — только id канала (<code>...@newsletter</code>), иначе 400.</li><li>Без <code>searchOptions</code> (или с пустым объектом) возвращаются только сообщения, уже загруженные в WhatsApp Web, — их может быть мало. Чтобы догрузить историю, передайте <code>searchOptions.limit</code>.</li><li>Фактическое количество может быть меньше <code>limit</code>, если в канале меньше сообщений. Большой <code>limit</code> заметно замедляет ответ.</li><li>Поддерживаются только опции <code>limit</code> и <code>fromMe</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, messages: [...]}</code> — массив объектов Message.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              searchOptions: {
                type: 'object',
                description: 'Необязательно, по умолчанию {}. limit (number) — сколько последних сообщений вернуть (догружает историю); fromMe (boolean) — true: только отправленные этим аккаунтом, false: только чужие, не указывать — все.',
                properties: {
                  limit: { type: 'number', example: 20 },
                  fromMe: { type: 'boolean', example: true }
                },
                example: { limit: 20 }
              }
            }
          },
          examples: {
            last20: { summary: 'Последние 20 публикаций', value: { chatId: '120363098765432101@newsletter', searchOptions: { limit: 20 } } },
            onlyMine: { summary: 'Только свои, 10 штук', value: { chatId: '120363098765432101@newsletter', searchOptions: { limit: 10, fromMe: true } } },
            loaded: { summary: 'Только уже загруженные', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив сообщений канала от старых к новым (объекты Message, фрагмент).',
      content: {
        'application/json': {
          example: {
            success: true,
            messages: [
              {
                id: { fromMe: true, remote: '120363098765432101@newsletter', id: '3EB0C767D82E4B5A1F2C', _serialized: 'true_120363098765432101@newsletter_3EB0C767D82E4B5A1F2C' },
                body: 'Привет, подписчики!',
                type: 'chat',
                timestamp: 1730000000,
                fromMe: true,
                hasMedia: false
              }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    */
    const { chatId, searchOptions = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const messages = Object.keys(searchOptions).length ? await chat.fetchMessages(searchOptions) : await chat.fetchMessages()
    res.json({ success: true, messages })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name sendSeen
 * @description Sends a seen status to the channel using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to send seen status
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const sendSeen = async (req, res) => {
  /*
    #swagger.summary = 'Отметить канал прочитанным'
    #swagger.description = '<p>Помечает все публикации канала как просмотренные (сбрасывает счётчик непрочитанных).</p><p><b>Когда использовать:</b> после обработки новых публикаций канала, чтобы они не висели непрочитанными.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> обязателен — без него 400 <code>chatId is required</code> (проверяется до обращения к WhatsApp).</li><li>Только id канала (<code>...@newsletter</code>), иначе 400 <code>The chat is not a channel</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code> — результат whatsapp-web.js.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен (иначе 400 chatId is required).',
                example: '120363098765432101@newsletter'
              }
            }
          },
          examples: {
            channel: { summary: 'Канал', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Результат отметки прочитанным.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Не передан chatId, либо chatId принадлежит не каналу.',
      content: {
        'application/json': {
          examples: {
            noChatId: { summary: 'Нет chatId', value: { success: false, error: 'chatId is required' } },
            notChannel: { summary: 'Не канал', value: { success: false, error: 'The chat is not a channel' } }
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. У объекта канала нет метода sendSeen (error: sendSeen method not available for this channel) либо исключение whatsapp-web.js / Puppeteer (текст исключения в error).',
      content: {
        'application/json': {
          examples: {
            noMethod: { summary: 'Метод недоступен', value: { success: false, error: 'sendSeen method not available for this channel' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    
    if (!chatId) {
      return sendErrorResponse(res, 400, 'chatId is required')
    }
    
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    
    if (typeof chat.sendSeen !== 'function') {
      sendErrorResponse(res, 500, 'sendSeen method not available for this channel')
      return
    }
    
    const result = await chat.sendSeen()
    res.json({ success: true, result })
  } catch (error) {
    logger.error({ err: error, sessionId: req.params.sessionId, chatId: req.body.chatId }, 'Error in channel.sendSeen')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name mute
 * @description Mutes a channel using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const mute = async (req, res) => {
  /*
    #swagger.summary = 'Отключить уведомления канала'
    #swagger.description = '<p>Отключает уведомления (mute) о новых публикациях канала для текущего аккаунта. Отключение бессрочное (<code>muteExpiration = -1</code>), срок задать нельзя.</p><p><b>Когда использовать:</b> чтобы канал не создавал уведомлений на телефоне, привязанном к сессии. Включить обратно — <code>POST /channel/unmute</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Только id канала (<code>...@newsletter</code>), иначе 400. Для личных чатов и групп используйте <code>POST /client/muteChat</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>; <code>false</code> — сервер WhatsApp отклонил операцию.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              }
            }
          },
          examples: {
            channel: { summary: 'Канал', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — уведомления отключены, false — сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.mute()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name unmute
 * @description Unmute a channel using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const unmute = async (req, res) => {
  /*
    #swagger.summary = 'Включить уведомления канала'
    #swagger.description = '<p>Снимает отключение уведомлений (unmute) с канала, ранее заглушённого через <code>POST /channel/mute</code> или в приложении.</p><p><b>Когда использовать:</b> чтобы снова получать уведомления о публикациях канала на привязанном телефоне.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Только id канала (<code>...@newsletter</code>), иначе 400. Для личных чатов и групп используйте <code>POST /client/unmuteChat</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>; <code>false</code> — сервер WhatsApp отклонил операцию.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              }
            }
          },
          examples: {
            channel: { summary: 'Канал', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — уведомления включены, false — сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.unmute()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name setSubject
 * @description Sets the subject of a channel using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const setSubject = async (req, res) => {
  /*
    #swagger.summary = 'Изменить название канала'
    #swagger.description = '<p>Меняет название (subject) канала.</p><p><b>Когда использовать:</b> переименование канала, которым вы владеете или администрируете.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права владельца/администратора канала; без них ответ <code>result: false</code> (HTTP 200), а не ошибка.</li><li>Если <code>newSubject</code> не передан, отправляется пустая строка — не вызывайте метод без него.</li><li>Только id канала (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'newSubject'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              newSubject: {
                type: 'string',
                description: 'Новое название канала. Формально необязателен (по умолчанию пустая строка), но без него название будет пустым — передавайте всегда.',
                example: 'Новости магазина'
              }
            }
          },
          examples: {
            rename: { summary: 'Переименовать', value: { chatId: '120363098765432101@newsletter', newSubject: 'Новости магазина' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — название изменено, false — нет прав или сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, newSubject = '' } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.setSubject(newSubject)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name acceptChannelAdminInvite
 * @description Accepts a channel admin invitation and promotes the current user to a channel admin
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const acceptChannelAdminInvite = async (req, res) => {
  /*
    #swagger.summary = 'Принять приглашение стать админом канала'
    #swagger.description = '<p>Принимает полученное приглашение стать администратором канала; текущий аккаунт становится админом.</p><p><b>Когда использовать:</b> после того как владелец канала отправил этому аккаунту приглашение (например, через <code>POST /channel/sendChannelAdminInvite</code>).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Должно существовать действующее приглашение для этого аккаунта; иначе <code>result: false</code> или 500 с текстом исключения.</li><li>Канал должен быть доступен сессии (иначе 404), <code>chatId</code> — только <code>...@newsletter</code> (иначе 400).</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>; <code>false</code> — сервер WhatsApp отклонил операцию.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала, из которого пришло приглашение, в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              }
            }
          },
          examples: {
            channel: { summary: 'Канал', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — приглашение принято, false — сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.acceptChannelAdminInvite()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name sendChannelAdminInvite
 * @description Sends a channel admin invite using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const sendChannelAdminInvite = async (req, res) => {
  /*
    #swagger.summary = 'Пригласить пользователя в админы канала'
    #swagger.description = '<p>Отправляет пользователю в личный чат приглашение стать администратором канала.</p><p><b>Когда использовать:</b> чтобы добавить соадминистратора. Пользователь принимает приглашение в своём приложении (или через <code>POST /channel/acceptChannelAdminInvite</code> в своей сессии). Отозвать — <code>POST /channel/revokeChannelAdminInvite</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Отправлять приглашения может владелец канала.</li><li><code>userId</code> должен быть id пользователя (<code>79991234567@c.us</code>); id группы или канала даст <code>result: false</code>.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>; <code>true</code> — сообщение-приглашение успешно отправлено.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'userId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              userId: {
                type: 'string',
                description: 'id пользователя, которому отправляется приглашение, в формате <код страны><номер>@c.us. Обязателен.',
                example: '79991234567@c.us'
              },
              options: {
                type: 'object',
                description: 'Необязательно. comment (string) — текст, добавляемый к приглашению.',
                properties: {
                  comment: { type: 'string', example: 'Помоги вести канал' }
                },
                example: { comment: 'Помоги вести канал' }
              }
            }
          },
          examples: {
            simple: { summary: 'Без комментария', value: { chatId: '120363098765432101@newsletter', userId: '79991234567@c.us' } },
            withComment: { summary: 'С комментарием', value: { chatId: '120363098765432101@newsletter', userId: '79991234567@c.us', options: { comment: 'Помоги вести канал' } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — приглашение отправлено, false — userId не является пользователем или отправка не удалась.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, userId, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = options ? await chat.sendChannelAdminInvite(userId, options) : await chat.sendChannelAdminInvite(userId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name demoteChannelAdmin
 * @description Demotes a channel admin using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const demoteChannelAdmin = async (req, res) => {
  /*
    #swagger.summary = 'Разжаловать админа канала в подписчики'
    #swagger.description = '<p>Снимает с пользователя права администратора канала; он остаётся обычным подписчиком. Можно применить и к себе (самоснятие).</p><p><b>Когда использовать:</b> чтобы убрать соадминистратора канала.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права владельца канала (или <code>userId</code> = свой id для самоснятия).</li><li><code>userId</code> обязателен; без него вызов завершится исключением (500).</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>; <code>false</code> — сервер WhatsApp отклонил операцию.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'userId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              userId: {
                type: 'string',
                description: 'id администратора, которого нужно разжаловать, в формате <код страны><номер>@c.us. Обязателен.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            demote: { summary: 'Разжаловать админа', value: { chatId: '120363098765432101@newsletter', userId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — права администратора сняты, false — сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, userId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.demoteChannelAdmin(userId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name transferChannelOwnership
 * @description Transfers channel ownership to another user using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const transferChannelOwnership = async (req, res) => {
  /*
    #swagger.summary = 'Передать владение каналом другому пользователю'
    #swagger.description = '<p>Передаёт права владельца канала другому пользователю. <b>Действие фактически необратимо</b>: вернуть владение сможет только новый владелец.</p><p><b>Когда использовать:</b> при передаче канала другому человеку или аккаунту.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Новый владелец <b>уже должен быть администратором</b> канала — сначала <code>POST /channel/sendChannelAdminInvite</code> и принятие приглашения.</li><li>Вызывать может только текущий владелец.</li><li>Любая ошибка внутри WhatsApp Web (нет прав, пользователь не админ и т.п.) возвращается как <code>result: false</code> с HTTP 200, без текста причины.</li><li>С <code>options.shouldDismissSelfAsAdmin: true</code> текущий аккаунт после передачи станет обычным подписчиком.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'newOwnerId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              newOwnerId: {
                type: 'string',
                description: 'id нового владельца (действующего админа канала) в формате <код страны><номер>@c.us. Обязателен.',
                example: '79991234567@c.us'
              },
              options: {
                type: 'object',
                description: 'Необязательно. shouldDismissSelfAsAdmin (boolean, по умолчанию false) — после передачи снять с себя права админа.',
                properties: {
                  shouldDismissSelfAsAdmin: { type: 'boolean', example: false }
                },
                example: { shouldDismissSelfAsAdmin: false }
              }
            }
          },
          examples: {
            keepAdmin: { summary: 'Передать, остаться админом', value: { chatId: '120363098765432101@newsletter', newOwnerId: '79991234567@c.us' } },
            leaveAdmin: { summary: 'Передать и стать подписчиком', value: { chatId: '120363098765432101@newsletter', newOwnerId: '79991234567@c.us', options: { shouldDismissSelfAsAdmin: true } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — владение передано, false — операция не удалась (нет прав, новый владелец не админ и т.п.).',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, newOwnerId, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = options ? await chat.transferChannelOwnership(newOwnerId, options) : await chat.transferChannelOwnership(newOwnerId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name revokeChannelAdminInvite
 * @description Revokes a channel admin invite using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const revokeChannelAdminInvite = async (req, res) => {
  /*
    #swagger.summary = 'Отозвать приглашение в админы канала'
    #swagger.description = '<p>Отзывает ранее отправленное владельцем канала приглашение стать администратором.</p><p><b>Когда использовать:</b> если приглашение (<code>POST /channel/sendChannelAdminInvite</code>) отправлено по ошибке или ещё не принято и больше не актуально. Если пользователь уже стал админом — используйте <code>POST /channel/demoteChannelAdmin</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права владельца канала.</li><li><code>userId</code> обязателен; без него вызов завершится исключением (500).</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>; <code>false</code> — сервер WhatsApp отклонил операцию.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'userId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              userId: {
                type: 'string',
                description: 'id пользователя, которому было отправлено приглашение, в формате <код страны><номер>@c.us. Обязателен.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            revoke: { summary: 'Отозвать приглашение', value: { chatId: '120363098765432101@newsletter', userId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — приглашение отозвано, false — сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, userId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.revokeChannelAdminInvite(userId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name getSubscribers
 * @description Retrieves the list of subscribers for a channel using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel to mute
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const getSubscribers = async (req, res) => {
  /*
    #swagger.summary = 'Подписчики канала (только из ваших контактов)'
    #swagger.description = '<p>Запрашивает подписчиков канала и возвращает только тех, кто есть в списке контактов текущего аккаунта, вместе с их ролью в канале.</p><p><b>Когда использовать:</b> чтобы увидеть, кто из ваших контактов подписан на канал и кто в нём админ.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Это <b>не</b> полный список подписчиков: подписчики, которых нет в ваших контактах, не возвращаются (ограничение WhatsApp Web).</li><li>Если <code>limit</code> не передан (или 0 / null), запрашивается максимально допустимое WhatsApp количество подписчиков.</li><li>Получение списка подписчиков обычно доступно владельцу/админам канала; для чужого канала WhatsApp может вернуть ошибку (500) — точное поведение зависит от сервера WhatsApp.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: [{contact: {...}, role: ...}]}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              limit: {
                type: 'number',
                description: 'Необязательно, по умолчанию null — максимальное разрешённое WhatsApp число. Сколько подписчиков запросить у сервера (до фильтрации по контактам, поэтому в ответе их может быть меньше).',
                example: 100
              }
            }
          },
          examples: {
            all: { summary: 'Без лимита', value: { chatId: '120363098765432101@newsletter' } },
            limited: { summary: 'Не более 100', value: { chatId: '120363098765432101@newsletter', limit: 100 } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив объектов {contact, role}: contact — контакт (фрагмент), role — роль в канале (строка из WhatsApp Web). Пустой массив, если никого из ваших контактов нет среди подписчиков или канал не найден внутри WhatsApp Web.',
      content: {
        'application/json': {
          example: {
            success: true,
            result: [
              {
                contact: {
                  id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' },
                  number: '79991234567',
                  name: 'Иван Петров',
                  pushname: 'Ivan',
                  isMyContact: true,
                  isUser: true
                },
                role: '<роль из WhatsApp Web>'
              }
            ]
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, limit = null } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.getSubscribers(limit)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name deleteChannel
 * @description Deletes the channel you created
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const deleteChannel = async (req, res) => {
  /*
    #swagger.summary = 'Удалить свой канал'
    #swagger.description = '<p>Удаляет канал, созданный (принадлежащий) текущим аккаунтом. <b>Действие необратимо</b>: канал, его публикации и подписчики будут потеряны.</p><p><b>Когда использовать:</b> только для окончательного удаления своего канала. Чтобы просто перестать получать публикации чужого канала — <code>POST /client/unsubscribeFromChannel</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Удалить можно только канал, владельцем которого является аккаунт сессии; иначе <code>result: false</code> или 500.</li><li>В установленной версии whatsapp-web.js (1.34.6) метод <code>Client.deleteChannel</code> обращается к <code>this.client.pupPage</code>, которого у Client нет, поэтому вызов, скорее всего, завершится 500 <code>Cannot read properties of undefined (reading pupPage)</code>. Перед использованием в продакшене проверьте на тестовом канале.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id удаляемого канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              }
            }
          },
          examples: {
            channel: { summary: 'Удалить канал', value: { chatId: '120363098765432101@newsletter' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — канал удалён, false — сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Исключение whatsapp-web.js / Puppeteer; в whatsapp-web.js 1.34.6 ожидаемо из-за ошибки в библиотеке (см. описание). В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            libBug: { summary: 'Ошибка библиотеки 1.34.6', value: { success: false, error: 'Cannot read properties of undefined (reading \'pupPage\')' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.deleteChannel()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name setReactionSetting
 * @description Updates the channel description
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const setReactionSetting = async (req, res) => {
  /*
    #swagger.summary = 'Настроить доступные реакции в канале'
    #swagger.description = '<p>Задаёт, какие реакции подписчики могут ставить на публикации канала.</p><p><b>Значения reactionCode:</b></p><ul><li><code>0</code> — реакции отключены (NONE);</li><li><code>1</code> — только базовые: 👍 ❤️ 😂 😮 😢 🙏 (BASIC);</li><li><code>2</code> — любые реакции (ALL).</li></ul><p><b>Ограничения и подводные камни:</b></p><ul><li>Передавайте <b>число</b>, не строку: <code>"1"</code> или любое значение вне 0/1/2 молча даёт <code>result: false</code> без изменений.</li><li>Если <code>reactionCode</code> не передан, используется <code>0</code> — реакции будут <b>отключены</b>.</li><li>Нужны права владельца/администратора канала, иначе <code>result: false</code>.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'reactionCode'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              reactionCode: {
                type: 'number',
                enum: [0, 1, 2],
                description: 'Настройка реакций: 0 — нет реакций, 1 — базовые (👍 ❤️ 😂 😮 😢 🙏), 2 — все. Формально необязателен (по умолчанию 0 — реакции отключаются), передавайте явно. Только число.',
                example: 1
              }
            }
          },
          examples: {
            basic: { summary: 'Только базовые реакции', value: { chatId: '120363098765432101@newsletter', reactionCode: 1 } },
            all: { summary: 'Все реакции', value: { chatId: '120363098765432101@newsletter', reactionCode: 2 } },
            none: { summary: 'Отключить реакции', value: { chatId: '120363098765432101@newsletter', reactionCode: 0 } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — настройка применена; false — недопустимое значение reactionCode, нет прав или сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, reactionCode = 0 } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.setReactionSetting(reactionCode)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name setDescription
 * @description Updates the channel description
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const setDescription = async (req, res) => {
  /*
    #swagger.summary = 'Изменить описание канала'
    #swagger.description = '<p>Меняет текст описания канала.</p><p><b>Когда использовать:</b> обновить описание канала, которым вы владеете или администрируете.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если <code>newDescription</code> не передан, отправляется пустая строка — описание будет очищено. Это же можно использовать намеренно, чтобы удалить описание.</li><li>Нужны права владельца/администратора канала, иначе <code>result: false</code>.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              newDescription: {
                type: 'string',
                description: 'Новое описание канала. По умолчанию пустая строка (описание будет очищено).',
                example: 'Официальный канал магазина: новинки и скидки'
              }
            }
          },
          examples: {
            update: { summary: 'Новое описание', value: { chatId: '120363098765432101@newsletter', newDescription: 'Официальный канал магазина: новинки и скидки' } },
            clear: { summary: 'Очистить описание', value: { chatId: '120363098765432101@newsletter', newDescription: '' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — описание изменено, false — нет прав или сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, newDescription = '' } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    const result = await chat.setDescription(newDescription)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function
 * @async
 * @name setProfilePicture
 * @description Updates the channel profile picture
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the channel
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and channel information
 * @throws {Error} - Throws an error if channel is not found or if there is a server error
 */
const setProfilePicture = async (req, res) => {
  /*
    #swagger.summary = 'Изменить аватар канала'
    #swagger.description = '<p>Устанавливает новое изображение профиля канала — по ссылке или из base64. Изображение автоматически обрезается и масштабируется до 640×640 и конвертируется в JPEG.</p><p><b>Когда использовать:</b> смена аватара канала, которым вы владеете или администрируете.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Передайте <b>одно</b> из полей: <code>newProfilePictureUrl</code> (сервер скачает файл) или <code>newProfilePictureMedia</code> (base64). Если переданы оба, используется <code>newProfilePictureMedia</code> (при наличии <code>data</code>), но URL всё равно будет скачан.</li><li>Если не передать ни одно из полей, в WhatsApp уходит пустая картинка (null) — не вызывайте метод так, результат не гарантирован.</li><li>Передавайте именно изображение (JPEG/PNG); base64 — без префикса <code>data:...;base64,</code>.</li><li>Нужны права владельца/администратора канала, иначе <code>result: false</code>.</li><li><code>chatId</code> — только канал (<code>...@newsletter</code>), иначе 400.</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        "application/json": {
          schema: {
            type: 'object',
            required: ['chatId'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id канала в формате <число>@newsletter. Обязателен.',
                example: '120363098765432101@newsletter'
              },
              newProfilePictureUrl: {
                type: 'string',
                description: 'http(s)-ссылка на изображение. Нужно это поле ИЛИ newProfilePictureMedia.',
                example: 'https://example.com/logo.jpg'
              },
              newProfilePictureMedia: {
                type: 'object',
                description: 'Изображение в base64: {mimetype, data}. Нужно это поле ИЛИ newProfilePictureUrl. Имеет приоритет над URL.',
                properties: {
                  mimetype: { type: 'string', example: 'image/jpeg' },
                  data: { type: 'string', description: 'base64 без префикса data:...;base64,', example: '/9j/4AAQSkZJRgABAQAAAQABAAD...' }
                }
              }
            }
          },
          examples: {
            url: { summary: 'По ссылке', value: { chatId: '120363098765432101@newsletter', newProfilePictureUrl: 'https://example.com/logo.jpg' } },
            base64: { summary: 'Из base64', value: { chatId: '120363098765432101@newsletter', newProfilePictureMedia: { mimetype: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'true — аватар изменён, false — нет прав или сервер WhatsApp отклонил операцию.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Переданный chatId принадлежит не каналу (личный чат или группа).',
      content: { 'application/json': { example: { success: false, error: 'The chat is not a channel' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо канал не найден / недоступен этой сессии (error: Channel not Found), либо сессия не готова (session_not_found, session_not_connected, browser tab closed, session closed).',
      content: {
        'application/json': {
          examples: {
            channel: { summary: 'Канал не найден', value: { success: false, error: 'Channel not Found' } },
            session: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            notConnected: { summary: 'Сессия не авторизована', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Не удалось скачать изображение по URL, повреждённые данные изображения или другое исключение whatsapp-web.js / Puppeteer. В error — текст исключения.',
      content: { 'application/json': { schema: { '$ref': '#/definitions/ErrorResponse' } } }
    }
  */
  try {
    const { chatId, newProfilePictureUrl, newProfilePictureMedia } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Channel not Found')
      return
    }
    if (!chat.isChannel) {
      sendErrorResponse(res, 400, 'The chat is not a channel')
      return
    }
    let messageMedia =
      newProfilePictureUrl &&
      (await MessageMedia.fromUrl(newProfilePictureUrl, { unsafeMime: true }))
    if (newProfilePictureMedia?.data) {
      messageMedia = new MessageMedia(
        newProfilePictureMedia.mimetype,
        newProfilePictureMedia.data,
        null,
        null
      )
    }
    const result = await chat.setProfilePicture(messageMedia)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  sendMessage,
  fetchMessages,
  sendSeen,
  mute,
  unmute,
  acceptChannelAdminInvite,
  sendChannelAdminInvite,
  revokeChannelAdminInvite,
  transferChannelOwnership,
  demoteChannelAdmin,
  getSubscribers,
  setProfilePicture,
  setDescription,
  setSubject,
  setReactionSetting,
  deleteChannel
}
