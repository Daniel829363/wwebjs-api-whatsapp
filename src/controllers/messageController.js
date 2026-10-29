const { MessageMedia, Location, Poll } = require('whatsapp-web.js')
const { Readable } = require('stream')
const { sessions } = require('../sessions')
const { sendErrorResponse, decodeBase64 } = require('../utils')

/**
 * Get message by its ID from a given chat using the provided client.
 * @async
 * @function
 * @param {object} client - The chat client.
 * @param {string} messageId - The ID of the message to get.
 * @param {string} chatId - The ID of the chat to search in.
 * @returns {Promise<object>} - A Promise that resolves with the message object that matches the provided ID, or undefined if no such message exists.
 * @throws {Error} - Throws an error if the provided client, message ID or chat ID is invalid.
 */
const _getMessageById = async (client, messageId, chatId) => {
  const chat = await client.getChatById(chatId)
  const messages = await chat.fetchMessages({ limit: 100 })
  return messages.find((message) => { return message.id.id === messageId })
}

/**
 * Gets information about a message's class.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise<void>} - A Promise that resolves with no value when the function completes.
 */
const getClassInfo = async (req, res) => {
  /*
    #swagger.summary = 'Получить сообщение по id'
    #swagger.description = '<p>Находит сообщение по <code>chatId</code> + <code>messageId</code> и возвращает полный объект Message из whatsapp-web.js.</p><p><b>Когда использовать:</b> чтобы получить актуальное состояние сообщения (ack, isStarred, hasReaction, hasMedia, body после редактирования) или проверить, что сообщение доступно для остальных методов <code>/message/...</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>messageId</code> — короткий <code>id.id</code> (например <code>3EB0C767D82E4B5A1F2C</code>), а не <code>id._serialized</code> вида <code>false_79991234567@c.us_3EB0...</code>.</li><li>Сообщение ищется только среди <b>последних 100</b> сообщений чата (служебные уведомления не учитываются); более старое даст 500 <code>Message not found</code>.</li><li><code>chatId</code> — чат, где лежит сообщение: для личной переписки это номер собеседника (<code>...@c.us</code>), для группы — <code>...@g.us</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, message: Message}</code>. Объект также содержит поле <code>_data</code> с сырыми данными WhatsApp Web (в примере опущено).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение: личный чат 79991234567@c.us или группа 120363012345678901@g.us', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (поле id.id объекта Message из webhook или /chat/fetchMessages), не _serialized. Ищется среди последних 100 сообщений чата.', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            personal: { summary: 'Сообщение в личном чате', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } },
            group: { summary: 'Сообщение в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Сообщение найдено.',
      content: {
        'application/json': {
          example: {
            success: true,
            message: {
              id: { fromMe: false, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'false_79991234567@c.us_3EB0C767D82E4B5A1F2C' },
              ack: 3,
              hasMedia: false,
              body: 'Привет!',
              type: 'chat',
              timestamp: 1730000000,
              from: '79991234567@c.us',
              to: '79990000000@c.us',
              deviceType: 'web',
              isForwarded: false,
              forwardingScore: 0,
              isStatus: false,
              isStarred: false,
              fromMe: false,
              hasQuotedMsg: false,
              hasReaction: false,
              vCards: [],
              mentionedIds: [],
              groupMentions: [],
              isGif: false,
              links: []
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer (например, неверный chatId).',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    res.json({ success: true, message })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Deletes a message.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @param {boolean} req.body.everyone - Whether to delete the message for everyone or just the sender.
 * @returns {Promise<void>} - A Promise that resolves with no value when the function completes.
 */
const deleteMessage = async (req, res) => {
  /*
    #swagger.summary = 'Удалить сообщение (у себя или у всех)'
    #swagger.description = '<p>Удаляет сообщение из чата: только у себя или у всех участников (<code>everyone: true</code>).</p><p><b>Когда использовать:</b> отозвать ошибочно отправленное сообщение или очистить сообщение у себя.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Действие <b>необратимо</b>.</li><li><code>everyone: true</code> сработает, только если WhatsApp разрешает отзыв: это ваше сообщение (в пределах допустимого WhatsApp срока) или вы администратор группы. Иначе сообщение молча удаляется <b>только у вас</b> — ошибки не будет.</li><li>Если <code>everyone</code> не передан, сообщение удаляется только у вас.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true}</code> — метод whatsapp-web.js ничего не возвращает, поэтому поле <code>result</code> в JSON отсутствует. Успешный ответ не гарантирует удаление у всех.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' },
              everyone: { type: 'boolean', description: 'true — удалить у всех (если WhatsApp разрешает отзыв: своё сообщение или вы админ группы). Не передан / false — удалить только у себя.', example: true },
              clearMedia: { type: 'boolean', description: 'Удалить также связанный медиафайл с устройства. По умолчанию true.', example: true }
            }
          },
          examples: {
            forEveryone: { summary: 'Удалить у всех', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', everyone: true } },
            forMe: { summary: 'Удалить только у себя, оставить медиа на устройстве', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C', everyone: false, clearMedia: false } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Команда удаления выполнена.',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId, everyone, clearMedia = true } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.delete(everyone, clearMedia)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Downloads media from a message.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @param {boolean} req.body.everyone - Whether to download the media for everyone or just the sender.
 * @returns {Promise<void>} - A Promise that resolves with no value when the function completes.
 */
const downloadMedia = async (req, res) => {
  /*
    #swagger.summary = 'Скачать медиа сообщения (base64 в JSON)'
    #swagger.description = '<p>Скачивает и расшифровывает вложение сообщения (фото, видео, аудио, документ, стикер) и возвращает его в JSON как base64.</p><p><b>Когда использовать:</b> чтобы получить файл входящего сообщения, особенно если он больше <code>MAX_ATTACHMENT_SIZE</code> и поэтому не пришёл событием webhook <code>media</code>. Для получения «сырого» файла без base64 используйте <code>/message/downloadMediaAsData</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Сообщение без вложения (<code>hasMedia: false</code>) → 500 <code>Message media not found</code>.</li><li>Если медиа больше недоступно на серверах WhatsApp (устарело, удалено, идёт повторная загрузка), ответ будет <code>{success: true}</code> <b>без поля messageMedia</b> — проверяйте его наличие.</li><li>При сбое стандартного способа скачивания сервер пробует альтернативный; если оба не сработали — 500 <code>Failed to download media: ... (Alternative method also failed: ...)</code>.</li><li>Ответ может быть очень большим: base64 примерно на 33% больше файла; <code>MAX_ATTACHMENT_SIZE</code> этот метод не ограничивает.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, messageMedia: {mimetype, data, filename, filesize}}</code>, где <code>data</code> — base64 без префикса <code>data:...;base64,</code>; <code>filename</code> и <code>filesize</code> могут быть null.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения с вложением (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            photo: { summary: 'Фото из личного чата', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Медиа скачано (или недоступно — тогда поле messageMedia отсутствует).',
      content: {
        'application/json': {
          examples: {
            downloaded: { summary: 'Файл получен', value: { success: true, messageMedia: { mimetype: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQAAAQABAAD...', filename: null, filesize: 48213 } } },
            unavailable: { summary: 'Медиа недоступно на серверах WhatsApp', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено (Message not found), в сообщении нет вложения (Message media not found), не удалось скачать файл (Failed to download media: ...) или другое исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            noMedia: { summary: 'В сообщении нет медиа', value: { success: false, error: 'Message media not found' } },
            downloadFailed: { summary: 'Оба способа скачивания не сработали', value: { success: false, error: 'Failed to download media: ... (Alternative method also failed: ...)' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    if (!message.hasMedia) { throw new Error('Message media not found') }
    
    let messageMedia
    try {
      // Try standard download method
      messageMedia = await message.downloadMedia()
    } catch (downloadError) {
      // If download fails, try alternative method using puppeteer page evaluation
      if (downloadError.message && (downloadError.message.includes('addAnnotations') || downloadError.message.includes('Cannot read properties of undefined'))) {
        try {
          // Use puppeteer to download media directly bypassing the addAnnotations call
          messageMedia = await client.pupPage.evaluate(async (msgId, msgChatId) => {
            const msg = (window.Store?.Msg || window.require('WAWebCollections').Msg).get(msgId)
            if (!msg) return null
            
            // Try to get the media directly without using the problematic method
            const mediaObject = msg.mediaObject || msg.clientUrl
            if (mediaObject) {
              const mediaBlob = await msg.downloadMedia()
              return mediaBlob
            }
            return null
          }, message.id._serialized, chatId)
          
          if (!messageMedia) {
            throw new Error('Failed to download media using alternative method')
          }
        } catch (altError) {
          throw new Error('Failed to download media: ' + downloadError.message + ' (Alternative method also failed: ' + altError.message + ')')
        }
      } else {
        throw downloadError
      }
    }
    
    res.json({ success: true, messageMedia })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Downloads media from a message and sends it as binary data.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise<void>} - A Promise that resolves with no value when the function completes.
 */
const downloadMediaAsData = async (req, res) => {
  /*
    #swagger.summary = 'Скачать медиа сообщения как файл (бинарные данные)'
    #swagger.description = '<p>Скачивает вложение сообщения и отдаёт его <b>как файл</b> (бинарный поток), а не JSON.</p><p><b>Когда использовать:</b> чтобы сохранить файл напрямую на диск / передать дальше без декодирования base64 (например, <code>curl -o file.jpg</code>). Для JSON с base64 используйте <code>/message/downloadMedia</code>.</p><p><b>Заголовки успешного ответа:</b></p><ul><li><code>Content-Type</code> — mimetype файла (например <code>image/jpeg</code>, <code>audio/ogg; codecs=opus</code>);</li><li><code>Content-Length</code> — размер из метаданных WhatsApp, если известен;</li><li><code>Content-Disposition: attachment; filename=...</code> — только если у файла есть имя (обычно у документов), имя URL-кодировано.</li></ul><p><b>Ограничения и подводные камни:</b></p><ul><li>Ошибки возвращаются обычным JSON <code>{success: false, error}</code> — проверяйте HTTP-код и <code>Content-Type</code> ответа.</li><li>Нет вложения → 500 <code>Message media not found</code>. Если медиа больше недоступно на серверах WhatsApp, метод вернёт 500 с текстом исключения о деструктуризации (<code>Cannot destructure property ... of ... as it is undefined.</code>).</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li><li>В Swagger UI файл можно сохранить по ссылке «Download file» в ответе.</li></ul>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения с вложением (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            document: { summary: 'Документ из группы', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure (JSON). Сообщение не найдено (Message not found), нет вложения (Message media not found), не удалось скачать файл (Failed to download media: ...) или другое исключение.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            noMedia: { summary: 'В сообщении нет медиа', value: { success: false, error: 'Message media not found' } },
            unavailable: { summary: 'Медиа недоступно на серверах WhatsApp', value: { success: false, error: "Cannot destructure property 'data' of 'messageMedia' as it is undefined." } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    if (!message.hasMedia) { throw new Error('Message media not found') }
    
    let messageMedia
    try {
      // Try standard download method
      messageMedia = await message.downloadMedia()
    } catch (downloadError) {
      // If download fails, try alternative method using puppeteer page evaluation
      if (downloadError.message && (downloadError.message.includes('addAnnotations') || downloadError.message.includes('Cannot read properties of undefined'))) {
        try {
          // Use puppeteer to download media directly bypassing the addAnnotations call
          messageMedia = await client.pupPage.evaluate(async (msgId, msgChatId) => {
            const msg = (window.Store?.Msg || window.require('WAWebCollections').Msg).get(msgId)
            if (!msg) return null
            
            // Try to get the media directly without using the problematic method
            const mediaObject = msg.mediaObject || msg.clientUrl
            if (mediaObject) {
              const mediaBlob = await msg.downloadMedia()
              return mediaBlob
            }
            return null
          }, message.id._serialized, chatId)
          
          if (!messageMedia) {
            throw new Error('Failed to download media using alternative method')
          }
        } catch (altError) {
          throw new Error('Failed to download media: ' + downloadError.message + ' (Alternative method also failed: ' + altError.message + ')')
        }
      } else {
        throw downloadError
      }
    }
    
    const { data, mimetype, filename, filesize } = messageMedia
    /* #swagger.responses[200] = {
        description: 'Бинарное содержимое файла. Фактический Content-Type равен mimetype вложения (image/jpeg, video/mp4, audio/ogg; codecs=opus, application/pdf и т.д.); при наличии данных добавляются Content-Length и Content-Disposition: attachment; filename=...',
        content: {
          'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
        }
      }
    */
    res.writeHead(200, {
      ...(mimetype && { 'Content-Type': mimetype }),
      ...(filesize && { 'Content-Length': filesize }),
      ...(filename && { 'Content-Disposition': `attachment; filename=${encodeURIComponent(filename)}` })
    })
    const readableStream = new Readable({
      read () {
        for (const chunk of decodeBase64(data)) {
          this.push(chunk)
        }
        this.push(null)
      }
    })
    readableStream.on('end', () => {
      res.end()
    })
    readableStream.pipe(res)
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Forwards a message to a destination chat.
 * @async
 * @function forward
 * @param {Object} req - The request object received by the server.
 * @param {Object} req.body - The body of the request object.
 * @param {string} req.body.messageId - The ID of the message to forward.
 * @param {string} req.body.chatId - The ID of the chat that contains the message to forward.
 * @param {string} req.body.destinationChatId - The ID of the chat to forward the message to.
 * @param {string} req.params.sessionId - The ID of the session to use the Telegram API with.
 * @param {Object} res - The response object to be sent back to the client.
 * @returns {Object} - The response object with a JSON body containing the result of the forward operation.
 * @throws Will throw an error if the message is not found or if there is an error during the forward operation.
 */
const forward = async (req, res) => {
  /*
    #swagger.summary = 'Переслать сообщение в другой чат'
    #swagger.description = '<p>Пересылает сообщение (с вложением, если оно есть) из чата <code>chatId</code> в чат <code>destinationChatId</code>. У получателя сообщение помечается как «Пересланное».</p><p><b>Когда использовать:</b> переслать полученное или своё сообщение в другой личный чат или группу без повторной загрузки медиа.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>По документации whatsapp-web.js пересылка работает только в чаты, с которыми уже была переписка; иначе может завершиться ошибкой.</li><li>Пересылается одно сообщение за вызов; <code>destinationChatId</code> — строка, не массив.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений исходного чата.</li><li>Без <code>destinationChatId</code> будет 500 <code>Cannot read properties of undefined (reading id)</code>.</li></ul><p><b>Ответ:</b> <code>{success: true}</code> — метод ничего не возвращает (поле <code>result</code> отсутствует), id нового сообщения не выдаётся; его можно получить из webhook <code>message_create</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId', 'destinationChatId'],
            properties: {
              chatId: { type: 'string', description: 'id исходного чата, где лежит сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id пересылаемого сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' },
              destinationChatId: { type: 'string', description: 'id чата-получателя: личный ...@c.us или группа ...@g.us', example: '79997654321@c.us' }
            }
          },
          examples: {
            toPerson: { summary: 'Переслать в личный чат', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', destinationChatId: '79997654321@c.us' } },
            toGroup: { summary: 'Переслать в группу', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', destinationChatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Сообщение переслано.',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer (например, при пересылке в недоступный чат).',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId, destinationChatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.forward(destinationChatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets information about a message.
 * @async
 * @function getInfo
 * @param {Object} req - The request object received by the server.
 * @param {Object} req.body - The body of the request object.
 * @param {string} req.body.messageId - The ID of the message to get information about.
 * @param {string} req.body.chatId - The ID of the chat that contains the message to get information about.
 * @param {string} req.params.sessionId - The ID of the session to use the Telegram API with.
 * @param {Object} res - The response object to be sent back to the client.
 * @returns {Object} - The response object with a JSON body containing the information about the message.
 * @throws Will throw an error if the message is not found or if there is an error during the get info operation.
 */
const getInfo = async (req, res) => {
  /*
    #swagger.summary = 'Статус доставки и прочтения сообщения'
    #swagger.description = '<p>Возвращает, кому сообщение доставлено, кто его прочитал и прослушал (для голосовых).</p><p><b>Когда использовать:</b> проверить статус своего отправленного сообщения, особенно в группе (по каждому участнику). Для простого статуса в личном чате достаточно поля <code>ack</code> сообщения или webhook <code>message_ack</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает <b>только для своих</b> сообщений (<code>fromMe: true</code>); для входящих возвращается <code>info: null</code> (HTTP 200).</li><li>Если сообщение отправлено менее ~1,25 с назад, ответ задерживается примерно на 1,1–1,2 с.</li><li>Получатели, скрывшие отчёты о прочтении, в <code>read</code> не попадут.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, info}</code>, где <code>info</code> содержит массивы <code>delivery</code>, <code>read</code>, <code>played</code> (элементы <code>{id, t}</code>, <code>t</code> — unix-время в секундах) и счётчики <code>deliveryRemaining</code>, <code>readRemaining</code>, <code>playedRemaining</code>; либо <code>info: null</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '120363012345678901@g.us' },
              messageId: { type: 'string', description: 'Короткий id СВОЕГО отправленного сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            group: { summary: 'Своё сообщение в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Информация о доставке (или null для чужого сообщения).',
      content: {
        'application/json': {
          examples: {
            own: {
              summary: 'Своё сообщение в группе',
              value: {
                success: true,
                info: {
                  delivery: [{ id: { server: 'c.us', user: '79997654321', _serialized: '79997654321@c.us' }, t: 1730000005 }],
                  deliveryRemaining: 0,
                  played: [],
                  playedRemaining: 2,
                  read: [{ id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' }, t: 1730000060 }],
                  readRemaining: 1
                }
              }
            },
            notOwn: { summary: 'Входящее (чужое) сообщение', value: { success: true, info: null } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const info = await message.getInfo()
    res.json({ success: true, info })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves a list of contacts mentioned in a specific message
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object
 * @param {Object} req.body - The request body
 * @param {string} req.body.messageId - The ID of the message to retrieve mentions from
 * @param {string} req.body.chatId - The ID of the chat where the message was sent
 * @param {string} req.params.sessionId - The ID of the session for the client making the request
 * @param {Object} res - The HTTP response object
 * @returns {Promise<void>} - The JSON response with the list of contacts
 * @throws {Error} - If there's an error retrieving the message or mentions
 */
const getMentions = async (req, res) => {
  /*
    #swagger.summary = 'Контакты, упомянутые в сообщении (@)'
    #swagger.description = '<p>Возвращает контакты, упомянутые в сообщении через @ (по списку <code>mentionedIds</code> сообщения).</p><p><b>Когда использовать:</b> бот в группе должен понять, кого отметили в сообщении (например, реагировать, только когда упомянули ваш номер).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если упоминаний нет — <code>contacts: []</code>.</li><li>Упоминания групп сюда не входят — для них <code>/message/getGroupMentions</code>.</li><li>Для каждого упомянутого id выполняется отдельный запрос контакта; в группах с LID id может иметь вид <code>...@lid</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, contacts: Contact[]}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (обычно группа ...@g.us)', example: '120363012345678901@g.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            group: { summary: 'Сообщение в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Список упомянутых контактов (может быть пустым).',
      content: {
        'application/json': {
          example: {
            success: true,
            contacts: [
              {
                id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' },
                number: '79991234567',
                isBusiness: false,
                isEnterprise: false,
                name: 'Иван Петров',
                pushname: 'Иван',
                shortName: 'Иван',
                type: 'in',
                isMe: false,
                isUser: true,
                isGroup: false,
                isWAContact: true,
                isMyContact: true,
                isBlocked: false
              }
            ]
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const contacts = await message.getMentions()
    res.json({ success: true, contacts })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the order information contained in a specific message
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object
 * @param {Object} req.body - The request body
 * @param {string} req.body.messageId - The ID of the message to retrieve the order from
 * @param {string} req.body.chatId - The ID of the chat where the message was sent
 * @param {string} req.params.sessionId - The ID of the session for the client making the request
 * @param {Object} res - The HTTP response object
 * @returns {Promise<void>} - The JSON response with the order information
 * @throws {Error} - If there's an error retrieving the message or order information
 */
const getOrder = async (req, res) => {
  /*
    #swagger.summary = 'Детали заказа из сообщения-заказа'
    #swagger.description = '<p>Для сообщения типа <code>order</code> (заказ из каталога WhatsApp Business) возвращает состав и сумму заказа.</p><p><b>Когда использовать:</b> бизнес-аккаунт получил заказ из каталога и нужно получить список товаров, количество и итог.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает только для сообщений с <code>type: order</code>. Для любого другого сообщения (или если детали не удалось получить) ответ <code>{success: true}</code> <b>без поля order</b>.</li><li>Суммы (<code>subtotal</code>, <code>total</code>) и цены — строки в формате WhatsApp.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, order: {products, subtotal, total, currency, createdAt}}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id личного чата с покупателем (...@c.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения-заказа (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            order: { summary: 'Сообщение-заказ', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Детали заказа или ответ без поля order, если сообщение не является заказом.',
      content: {
        'application/json': {
          examples: {
            order: {
              summary: 'Сообщение-заказ',
              value: {
                success: true,
                order: {
                  products: [{ id: '5432109876543210', price: '1500000', thumbnailUrl: 'https://mmg.whatsapp.net/...', currency: 'RUB', name: 'Футболка', quantity: 2, data: null }],
                  subtotal: '3000000',
                  total: '3000000',
                  currency: 'RUB',
                  createdAt: 1730000000
                }
              }
            },
            notOrder: { summary: 'Сообщение не является заказом', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const order = await message.getOrder()
    res.json({ success: true, order })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the payment information from a specific message identified by its ID.
 *
 * @async
 * @function getPayment
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID associated with the client making the request.
 * @param {Object} req.body - The message ID and chat ID associated with the message to retrieve payment information from.
 * @param {string} req.body.messageId - The ID of the message to retrieve payment information from.
 * @param {string} req.body.chatId - The ID of the chat the message is associated with.
 * @returns {Object} An object containing a success status and the payment information for the specified message.
 * @throws {Object} If the specified message is not found or if an error occurs during the retrieval process.
 */
const getPayment = async (req, res) => {
  /*
    #swagger.summary = 'Детали платежа из платёжного сообщения'
    #swagger.description = '<p>Для сообщения типа <code>payment</code> (WhatsApp Pay) возвращает сумму, валюту, получателя и статус платежа.</p><p><b>Когда использовать:</b> обработка платежей WhatsApp Pay (доступно только в странах, где работает WhatsApp Pay).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает только для сообщений с <code>type: payment</code>; для остальных ответ <code>{success: true}</code> <b>без поля payment</b>.</li><li><code>paymentAmount1000</code> — сумма, умноженная на 1000 (1.00 = 1000).</li><li><code>paymentStatus</code>: 0 UNKNOWN_STATUS, 1 PROCESSING, 2 SENT, 3 NEED_TO_ACCEPT, 4 COMPLETE, 5 COULD_NOT_COMPLETE, 6 REFUNDED, 7 EXPIRED, 8 REJECTED, 9 CANCELLED, 10 WAITING_FOR_PAYER, 11 WAITING.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, payment: {id, paymentCurrency, paymentAmount1000, paymentMessageReceiverJid, paymentTransactionTimestamp, paymentStatus, paymentTxnStatus, paymentNote}}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата с платёжным сообщением (...@c.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id платёжного сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            payment: { summary: 'Платёжное сообщение', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Детали платежа или ответ без поля payment, если сообщение не платёжное.',
      content: {
        'application/json': {
          examples: {
            payment: {
              summary: 'Платёжное сообщение',
              value: {
                success: true,
                payment: {
                  id: { fromMe: false, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'false_79991234567@c.us_3EB0C767D82E4B5A1F2C' },
                  paymentCurrency: 'INR',
                  paymentAmount1000: 150000,
                  paymentMessageReceiverJid: { server: 'c.us', user: '79990000000', _serialized: '79990000000@c.us' },
                  paymentTransactionTimestamp: 1730000000,
                  paymentStatus: 4,
                  paymentTxnStatus: 0,
                  paymentNote: 'За заказ'
                }
              }
            },
            notPayment: { summary: 'Сообщение не платёжное', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const payment = await message.getPayment()
    res.json({ success: true, payment })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the quoted message information from a specific message identified by its ID.
 *
 * @async
 * @function getQuotedMessage
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID associated with the client making the request.
 * @param {Object} req.body - The message ID and chat ID associated with the message to retrieve quoted message information from.
 * @param {string} req.body.messageId - The ID of the message to retrieve quoted message information from.
 * @param {string} req.body.chatId - The ID of the chat the message is associated with.
 * @returns {Object} An object containing a success status and the quoted message information for the specified message.
 * @throws {Object} If the specified message is not found or if an error occurs during the retrieval process.
 */
const getQuotedMessage = async (req, res) => {
  /*
    #swagger.summary = 'Получить сообщение, на которое ответили (цитату)'
    #swagger.description = '<p>Если сообщение является ответом (reply) на другое сообщение, возвращает цитируемое сообщение целиком.</p><p><b>Когда использовать:</b> бот получил ответ пользователя и нужно понять, на какое сообщение (например, на какой вопрос или товар) он отвечает.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если сообщение не является ответом (<code>hasQuotedMsg: false</code>), ответ <code>{success: true}</code> <b>без поля quotedMessage</b>.</li><li>Поиск среди последних 100 сообщений чата применяется к исходному <code>messageId</code>; цитата берётся из данных самого сообщения-ответа.</li><li><code>messageId</code> — короткий <code>id.id</code> сообщения-ответа, не цитаты.</li></ul><p><b>Ответ:</b> <code>{success: true, quotedMessage: Message}</code> (поле <code>_data</code> в примере опущено).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение-ответ (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения-ответа (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            reply: { summary: 'Сообщение-ответ', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Цитируемое сообщение или ответ без поля quotedMessage.',
      content: {
        'application/json': {
          examples: {
            quoted: {
              summary: 'Есть цитата',
              value: {
                success: true,
                quotedMessage: {
                  id: { fromMe: true, remote: '79991234567@c.us', id: '3EB0A1B2C3D4E5F60718', _serialized: 'true_79991234567@c.us_3EB0A1B2C3D4E5F60718' },
                  ack: 3,
                  hasMedia: false,
                  body: 'Какой размер вам нужен?',
                  type: 'chat',
                  timestamp: 1729999900,
                  from: '79990000000@c.us',
                  to: '79991234567@c.us',
                  fromMe: true,
                  hasQuotedMsg: false,
                  hasReaction: false
                }
              }
            },
            notReply: { summary: 'Сообщение не является ответом', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const quotedMessage = await message.getQuotedMessage()
    res.json({ success: true, quotedMessage })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * React to a specific message in a chat
 *
 * @async
 * @function react
 * @param {Object} req - The HTTP request object containing the request parameters and body.
 * @param {Object} res - The HTTP response object to send the result.
 * @param {string} req.params.sessionId - The ID of the session to use.
 * @param {Object} req.body - The body of the request.
 * @param {string} req.body.messageId - The ID of the message to react to.
 * @param {string} req.body.chatId - The ID of the chat the message is in.
 * @param {string} req.body.reaction - The reaction to add to the message.
 * @returns {Object} The HTTP response containing the result of the operation.
 * @throws {Error} If there was an error during the operation.
 */
const react = async (req, res) => {
  /*
    #swagger.summary = 'Поставить или снять реакцию-эмодзи'
    #swagger.description = '<p>Ставит на сообщение реакцию-эмодзи от имени сессии или снимает её.</p><p><b>Когда использовать:</b> подтвердить получение (например 👍), отметить обработанную заявку, снять ранее поставленную реакцию.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>От одного аккаунта на сообщении может быть только одна реакция — новая заменяет старую.</li><li>Пустая строка <code>""</code> или отсутствие поля <code>reaction</code> <b>снимает</b> реакцию (значение по умолчанию — пустая строка).</li><li>Передавайте ровно один эмодзи, а не текст или код вида <code>:thumbsup:</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true}</code> — метод ничего не возвращает (поле <code>result</code> отсутствует).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' },
              reaction: { type: 'string', description: 'Один эмодзи. Пустая строка (по умолчанию) — снять свою реакцию.', example: '👍' }
            }
          },
          examples: {
            set: { summary: 'Поставить реакцию', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', reaction: '👍' } },
            remove: { summary: 'Снять реакцию', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', reaction: '' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Реакция отправлена.',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId, reaction = '' } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.react(reaction)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Reply to a specific message in a chat
 *
 * @async
 * @function reply
 * @param {Object} req - The HTTP request object containing the request parameters and body.
 * @param {Object} res - The HTTP response object to send the result.
 * @param {string} req.params.sessionId - The ID of the session to use.
 * @param {string} req.body.messageId - The ID of the message to reply to.
 * @param {string} req.body.chatId - The ID of the chat the message is in.
 * @param {string} req.body.content - The content of the message to send.
 * @param {string} req.body.destinationChatId - The ID of the chat to send the reply to.
 * @param {Object} req.body.options - Additional options for sending the message.
 * @returns {Object} The HTTP response containing the result of the operation.
 * @throws {Error} If there was an error during the operation.
 */
const reply = async (req, res) => {
  /*
    #swagger.summary = 'Ответить на сообщение (с цитатой)'
    #swagger.description = '<p>Отправляет новое сообщение в чат <code>chatId</code> как ответ на сообщение <code>messageId</code> — у получателя оно отображается с цитатой исходного.</p><p><b>Когда использовать:</b> ответить на конкретный вопрос пользователя или в группе так, чтобы было понятно, к какому сообщению относится ответ. Для обычной отправки без цитаты используйте <code>/client/sendMessage</code>.</p><p><b>Значения contentType и формат content:</b></p><ul><li><code>string</code> — <code>content</code>: текст. Можно приложить медиа через <code>options.media: {mimetype, data}</code> — тогда текст станет подписью; имя файла при этом сбрасывается в null.</li><li><code>MessageMedia</code> — <code>content: {mimetype, data, filename, filesize}</code>, <code>data</code> — base64 без префикса <code>data:...;base64,</code>.</li><li><code>MessageMediaFromURL</code> — <code>content</code>: строка URL; сервер сам скачает файл (mimetype определяется по ответу).</li><li><code>Location</code> — <code>content: {latitude, longitude, description}</code>.</li><li><code>Contact</code> — <code>content: {contactId}</code>: визитка контакта; суффикс <code>@c.us</code> добавляется автоматически, если его нет.</li><li><code>Poll</code> — <code>content: {pollName, pollOptions: [строки], options: {allowMultipleAnswers}}</code>; перед отправкой сервер открывает окно чата (нужно для событий голосования).</li></ul><p><b>Ограничения и подводные камни:</b></p><ul><li>Любое другое значение <code>contentType</code> (или его отсутствие) → 400.</li><li>Для <code>Location</code> поле <code>description</code> в установленной версии whatsapp-web.js фактически игнорируется (передаётся строкой вместо объекта <code>{name, address}</code>) — отправляется только точка на карте.</li><li><code>options</code> — объект MessageSendOptions whatsapp-web.js (<code>mentions</code>, <code>linkPreview</code>, <code>sendAudioAsVoice</code>, <code>sendMediaAsDocument</code>, <code>sendMediaAsSticker</code>, <code>caption</code>, <code>isViewOnce</code> и др.); <code>quotedMessageId</code> подставляется автоматически, передавать его не нужно.</li><li>Ответ отправляется в <code>chatId</code> — тот же чат, где лежит исходное сообщение.</li><li>Размер тела запроса ограничен <code>MAX_ATTACHMENT_SIZE</code> + 1 МБ (иначе 413); крупные файлы отправляйте через <code>MessageMediaFromURL</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, repliedMessage: Message}</code> — отправленное сообщение-ответ (поле <code>_data</code> в примере опущено).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        "application/json": {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId', 'contentType', 'content'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id чата, в котором находится исходное сообщение; ответ будет отправлен сюда же (...@c.us или ...@g.us)',
                example: '79991234567@c.us'
              },
              messageId: {
                type: 'string',
                description: 'Короткий id сообщения, на которое отвечаем (id.id), не _serialized',
                example: '3EB0C767D82E4B5A1F2C'
              },
              contentType: {
                type: 'string',
                enum: ['string', 'MessageMedia', 'MessageMediaFromURL', 'Location', 'Contact', 'Poll'],
                description: 'Тип содержимого ответа. Определяет формат поля content.',
                example: 'string'
              },
              content: {
                description: 'Содержимое ответа: строка (для string и MessageMediaFromURL) или объект (для MessageMedia, Location, Contact, Poll) — см. описание метода и примеры.',
                anyOf: [{ type: 'string' }, { type: 'object' }],
                example: 'Да, есть в наличии'
              },
              options: {
                type: 'object',
                description: 'Необязательные MessageSendOptions whatsapp-web.js: mentions (массив id), linkPreview, sendAudioAsVoice, sendMediaAsDocument, sendMediaAsSticker, isViewOnce, caption, media (для contentType string) и др.'
              }
            }
          },
          examples: {
            string: { summary: 'Текстовый ответ', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'string', content: 'Да, есть в наличии' } },
            stringWithMedia: { summary: 'Текст + картинка (подпись)', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'string', content: 'Вот фото товара', options: { media: { mimetype: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } } } },
            MessageMedia: { summary: 'Файл в base64', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'MessageMedia', content: { mimetype: 'application/pdf', data: 'JVBERi0xLjQKJ...', filename: 'price.pdf' } } },
            MessageMediaFromURL: { summary: 'Файл по ссылке', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'MessageMediaFromURL', content: 'https://example.com/files/price.pdf', options: { sendMediaAsDocument: true } } },
            Location: { summary: 'Геопозиция', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'Location', content: { latitude: 55.7558, longitude: 37.6173, description: 'Москва' } } },
            Contact: { summary: 'Визитка контакта', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'Contact', content: { contactId: '79997654321@c.us' } } },
            Poll: { summary: 'Опрос', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'Poll', content: { pollName: 'Когда удобно?', pollOptions: ['Утром', 'Вечером'], options: { allowMultipleAnswers: false } } } },
            mention: { summary: 'Ответ в группе с упоминанием', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C', contentType: 'string', content: '@79991234567 принято', options: { mentions: ['79991234567@c.us'] } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Ответ отправлен.',
      content: {
        'application/json': {
          example: {
            success: true,
            repliedMessage: {
              id: { fromMe: true, remote: '79991234567@c.us', id: '3EB0A1B2C3D4E5F60718', _serialized: 'true_79991234567@c.us_3EB0A1B2C3D4E5F60718' },
              ack: 0,
              hasMedia: false,
              body: 'Да, есть в наличии',
              type: 'chat',
              timestamp: 1730000100,
              from: '79990000000@c.us',
              to: '79991234567@c.us',
              fromMe: true,
              hasQuotedMsg: true,
              hasReaction: false,
              mentionedIds: []
            }
          }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. Не передан или неизвестен contentType.',
      content: { 'application/json': { example: { success: false, error: 'contentType invalid, must be string, MessageMedia, MessageMediaFromURL, Location, Contact or Poll' } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found), неверный формат content (например, нет content.contactId), не удалось скачать файл по URL, либо другое исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId, content, contentType, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    let contentMessage
    switch (contentType) {
      case 'string':
        if (options?.media) {
          const media = options.media
          media.filename = null
          media.filesize = null
          options.media = new MessageMedia(media.mimetype, media.data, media.filename, media.filesize)
        }
        contentMessage = content
        break
      case 'MessageMediaFromURL': {
        contentMessage = await MessageMedia.fromUrl(content, { unsafeMime: true })
        break
      }
      case 'MessageMedia': {
        contentMessage = new MessageMedia(content.mimetype, content.data, content.filename, content.filesize)
        break
      }
      case 'Location': {
        contentMessage = new Location(content.latitude, content.longitude, content.description)
        break
      }
      case 'Contact': {
        const contactId = content.contactId.endsWith('@c.us') ? content.contactId : `${content.contactId}@c.us`
        contentMessage = await client.getContactById(contactId)
        break
      }
      case 'Poll': {
        contentMessage = new Poll(content.pollName, content.pollOptions, content.options)
        // fix for poll events not being triggered (open the chat that you sent the poll)
        await client.interface.openChatWindow(chatId)
        break
      }
      default:
        return sendErrorResponse(res, 400, 'contentType invalid, must be string, MessageMedia, MessageMediaFromURL, Location, Contact or Poll')
    }
    const repliedMessage = await message.reply(contentMessage, chatId, options)
    res.json({ success: true, repliedMessage })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function star
 * @async
 * @description Stars a message by message ID and chat ID.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise} A Promise that resolves with the result of the message.star() call.
 * @throws {Error} If message is not found, it throws an error with the message "Message not found".
 */
const star = async (req, res) => {
  /*
    #swagger.summary = 'Добавить сообщение в избранное'
    #swagger.description = '<p>Помечает сообщение звёздочкой («Избранные сообщения») в аккаунте сессии.</p><p><b>Когда использовать:</b> отметить важные сообщения (заказы, договорённости), чтобы потом найти их в WhatsApp; состояние видно в поле <code>isStarred</code> сообщения.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Отметка видна только вам, собеседник её не видит.</li><li>Если WhatsApp не разрешает пометить это сообщение (проверка canStarMsg), действие молча не выполняется — ответ всё равно <code>{success: true}</code>. Проверить результат можно через <code>/message/getClassInfo</code> (<code>isStarred</code>).</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true}</code> (поле <code>result</code> отсутствует — метод ничего не возвращает).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            star: { summary: 'Пометить сообщение', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Команда выполнена.',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.star()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function unstar
 * @async
 * @description Unstars a message by message ID and chat ID.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise} A Promise that resolves with the result of the message.unstar() call.
 * @throws {Error} If message is not found, it throws an error with the message "Message not found".
 */
const unstar = async (req, res) => {
  /*
    #swagger.summary = 'Убрать сообщение из избранного'
    #swagger.description = '<p>Снимает с сообщения отметку «Избранное» (звёздочку). Обратная операция к <code>/message/star</code>.</p><p><b>Когда использовать:</b> сообщение больше не нужно держать в избранном.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если сообщение не было в избранном или WhatsApp не разрешает операцию, ничего не происходит — ответ всё равно <code>{success: true}</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true}</code> (поле <code>result</code> отсутствует).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            unstar: { summary: 'Снять отметку', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Команда выполнена.',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.unstar()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function getReactions
 * @async
 * @description Gets the reactions associated with the given message.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise} A Promise that resolves with the result of the message.getReactions() call.
 * @throws {Error} If message is not found, it throws an error with the message "Message not found".
 */
const getReactions = async (req, res) => {
  /*
    #swagger.summary = 'Реакции на сообщение'
    #swagger.description = '<p>Возвращает все реакции-эмодзи на сообщение, сгруппированные по эмодзи, со списком отправителей.</p><p><b>Когда использовать:</b> подсчитать реакции (например, голосование эмодзи), узнать, кто отреагировал. Для получения реакций в реальном времени используйте webhook <code>message_reaction</code> (по умолчанию отключён в <code>DISABLED_CALLBACKS</code>).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если реакций нет (<code>hasReaction: false</code>), ответ <code>{success: true}</code> <b>без поля result</b>.</li><li><code>senders[].timestamp</code> — unix-время в секундах; <code>senderId</code> в группах может быть вида <code>...@lid</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, result: [{id, aggregateEmoji, hasReactionByMe, senders: Reaction[]}]}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '120363012345678901@g.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            group: { summary: 'Сообщение в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Список реакций или ответ без поля result, если реакций нет.',
      content: {
        'application/json': {
          examples: {
            withReactions: {
              summary: 'Есть реакции',
              value: {
                success: true,
                result: [
                  {
                    id: '👍',
                    aggregateEmoji: '👍',
                    hasReactionByMe: false,
                    senders: [
                      {
                        id: { fromMe: false, remote: '120363012345678901@g.us', id: '3EB0F1E2D3C4B5A69788', participant: '79991234567@c.us', _serialized: 'false_120363012345678901@g.us_3EB0F1E2D3C4B5A69788_79991234567@c.us' },
                        orphan: 0,
                        timestamp: 1730000200,
                        reaction: '👍',
                        read: false,
                        msgId: { fromMe: true, remote: '120363012345678901@g.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'true_120363012345678901@g.us_3EB0C767D82E4B5A1F2C' },
                        senderId: '79991234567@c.us',
                        ack: 1
                      }
                    ]
                  }
                ]
              }
            },
            noReactions: { summary: 'Реакций нет', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.getReactions()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function getReactions
 * @async
 * @description Gets groups mentioned in this message
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise} A Promise that resolves with the result of the message.getReactions() call.
 * @throws {Error} If message is not found, it throws an error with the message "Message not found".
 */
const getGroupMentions = async (req, res) => {
  /*
    #swagger.summary = 'Группы, упомянутые в сообщении'
    #swagger.description = '<p>Возвращает группы, упомянутые в сообщении, по полю <code>groupMentions</code> сообщения.</p><p><b>Когда использовать:</b> разобрать сообщение с упоминаниями групп и получить их объекты (id, название, метаданные). Для упоминаний людей — <code>/message/getMentions</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если групп в сообщении не упомянуто — <code>result: []</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, result: GroupChat[]}</code> (объекты групп сокращены в примере).</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '120363012345678901@g.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            group: { summary: 'Сообщение в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Список упомянутых групп (может быть пустым).',
      content: {
        'application/json': {
          example: {
            success: true,
            result: [
              {
                groupMetadata: { id: { server: 'g.us', user: '120363011111111111', _serialized: '120363011111111111@g.us' }, subject: 'Объявления', owner: { server: 'c.us', user: '79990000000', _serialized: '79990000000@c.us' }, participants: [] },
                id: { server: 'g.us', user: '120363011111111111', _serialized: '120363011111111111@g.us' },
                name: 'Объявления',
                isGroup: true,
                isReadOnly: false,
                unreadCount: 0,
                timestamp: 1730000000,
                archived: false,
                pinned: false,
                isMuted: false,
                muteExpiration: 0
              }
            ]
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const result = await message.getGroupMentions()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function edit
 * @async
 * @description Edits the current message
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise} A Promise that resolves with the result of the message.edit() call.
 * @throws {Error} If message is not found, it throws an error with the message "Message not found".
 */
const edit = async (req, res) => {
  /*
    #swagger.summary = 'Редактировать своё сообщение'
    #swagger.description = '<p>Заменяет текст своего отправленного сообщения (или подпись к медиа) на <code>content</code>. У собеседника сообщение помечается как «Изменено».</p><p><b>Когда использовать:</b> исправить опечатку или обновить текст уже отправленного ботом сообщения (например, статус заказа).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Можно редактировать <b>только свои</b> сообщения (<code>fromMe: true</code>) и только текст или подпись, в пределах срока, который разрешает WhatsApp. Медиафайл, геопозицию, опрос заменить нельзя.</li><li>Если редактирование невозможно (чужое сообщение, истёк срок, неподходящий тип), ответ <b>HTTP 200</b> с <code>message: null</code> — ошибки не будет, проверяйте поле.</li><li><code>content</code> — только строка; для упоминаний в новом тексте передайте <code>options.mentions</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, message: Message}</code> — отредактированное сообщение, либо <code>message: null</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId', 'content'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id СВОЕГО сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' },
              content: { type: 'string', description: 'Новый текст сообщения (или новая подпись к медиа)', example: 'Ваш заказ №1024 отправлен' },
              options: { type: 'object', description: 'Необязательные MessageEditOptions whatsapp-web.js: linkPreview (boolean, по умолчанию true), mentions (массив id вида 79991234567@c.us), groupMentions (массив {subject, id}), extra (объект). По умолчанию {}.', example: { linkPreview: false } }
            }
          },
          examples: {
            text: { summary: 'Исправить текст', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', content: 'Ваш заказ №1024 отправлен' } },
            mention: { summary: 'Текст с упоминанием в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C', content: '@79991234567 заказ готов', options: { mentions: ['79991234567@c.us'] } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Сообщение отредактировано, либо message: null, если редактирование невозможно.',
      content: {
        'application/json': {
          examples: {
            edited: {
              summary: 'Отредактировано',
              value: {
                success: true,
                message: {
                  id: { fromMe: true, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'true_79991234567@c.us_3EB0C767D82E4B5A1F2C' },
                  ack: 1,
                  hasMedia: false,
                  body: 'Ваш заказ №1024 отправлен',
                  type: 'chat',
                  timestamp: 1730000000,
                  from: '79990000000@c.us',
                  to: '79991234567@c.us',
                  fromMe: true,
                  latestEditSenderTimestampMs: 1730000300000
                }
              }
            },
            notEditable: { summary: 'Нельзя отредактировать (чужое, истёк срок, неподходящий тип)', value: { success: true, message: null } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId, content, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const editedMessage = await message.edit(content, options)
    res.json({ success: true, message: editedMessage })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * @function getContact
 * @async
 * @description Gets groups mentioned in this message
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.messageId - The message ID.
 * @param {string} req.body.chatId - The chat ID.
 * @returns {Promise} A Promise that resolves with the result of the message.getReactions() call.
 * @throws {Error} If message is not found, it throws an error with the message "Message not found".
 */
const getContact = async (req, res) => {
  /*
    #swagger.summary = 'Контакт автора сообщения'
    #swagger.description = '<p>Возвращает контакт, который отправил сообщение: в личном чате — собеседник (или вы сами для своих сообщений), в группе — конкретный участник-автор.</p><p><b>Когда использовать:</b> узнать имя (<code>pushname</code>, <code>name</code>), номер и тип аккаунта автора сообщения, например, чтобы обратиться к нему по имени в ответе.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>name</code> заполнено, только если контакт сохранён в телефонной книге аккаунта сессии; <code>pushname</code> — имя, которое пользователь указал в своём профиле.</li><li>В группах автор может быть представлен LID (<code>...@lid</code>) вместо номера.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, contact: Contact}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '120363012345678901@g.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' }
            }
          },
          examples: {
            group: { summary: 'Автор сообщения в группе', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C' } },
            personal: { summary: 'Сообщение в личном чате', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Контакт автора.',
      content: {
        'application/json': {
          example: {
            success: true,
            contact: {
              id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' },
              number: '79991234567',
              isBusiness: false,
              isEnterprise: false,
              name: 'Иван Петров',
              pushname: 'Иван',
              shortName: 'Иван',
              type: 'in',
              isMe: false,
              isUser: true,
              isGroup: false,
              isWAContact: true,
              isMyContact: true,
              isBlocked: false
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено среди последних 100 сообщений чата (Message not found) либо исключение whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    const contact = await message.getContact()
    res.json({ success: true, contact })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Executes a method on the message associated with the given sessionId.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const runMethod = async (req, res) => {
  /*
    #swagger.summary = 'Вызвать произвольный метод объекта Message'
    #swagger.description = '<p>Находит сообщение и вызывает у объекта Message из whatsapp-web.js метод с именем <code>method</code>, возвращая его результат.</p><p><b>Когда использовать:</b> только если нужного действия нет среди отдельных методов API. Примеры методов Message в установленной версии: <code>pin</code> (аргумент — длительность в секундах), <code>unpin</code>, <code>getPollVotes</code>, <code>vote</code> (аргумент — массив выбранных вариантов), <code>acceptGroupV4Invite</code>, <code>getChat</code>, <code>reload</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>В метод передаётся <b>не более одного</b> аргумента: значение <code>options</code> целиком (если оно непустое/истинное). Методы с несколькими аргументами (например <code>delete(everyone, clearMedia)</code>) так вызвать полностью нельзя — используйте специальные эндпоинты.</li><li>Если <code>options</code> — falsy (не передан, <code>false</code>, <code>0</code>, пустая строка), метод вызывается без аргументов.</li><li>Имя метода не ограничено белым списком — можно вызвать любой метод, включая разрушающие (например <code>delete</code>). Не принимайте значение <code>method</code> от внешних пользователей.</li><li>Нет такого метода → 500 <code>Method is not implemented</code>.</li><li><code>messageId</code> — короткий <code>id.id</code>; поиск только среди последних 100 сообщений чата.</li></ul><p><b>Ответ:</b> <code>{success: true, data: результат метода}</code>; если метод ничего не возвращает, поле <code>data</code> отсутствует.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'messageId', 'method'],
            properties: {
              chatId: { type: 'string', description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)', example: '79991234567@c.us' },
              messageId: { type: 'string', description: 'Короткий id сообщения (id.id), не _serialized', example: '3EB0C767D82E4B5A1F2C' },
              method: { type: 'string', description: 'Имя метода объекта Message из whatsapp-web.js (с учётом регистра)', example: 'pin' },
              options: {
                anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'number' }, { type: 'array' }],
                description: 'Единственный аргумент, передаваемый в метод как есть. Не передавайте, если метод без аргументов.',
                example: 86400
              }
            }
          },
          examples: {
            pin: { summary: 'Закрепить сообщение на 24 часа', value: { chatId: '79991234567@c.us', messageId: '3EB0C767D82E4B5A1F2C', method: 'pin', options: 86400 } },
            getPollVotes: { summary: 'Голоса в опросе (без аргументов)', value: { chatId: '120363012345678901@g.us', messageId: '3EB0C767D82E4B5A1F2C', method: 'getPollVotes' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Метод выполнен. data — то, что вернул метод (отсутствует, если метод ничего не вернул).',
      content: {
        'application/json': {
          examples: {
            pin: { summary: 'pin вернул true', value: { success: true, data: true } },
            noResult: { summary: 'Метод ничего не вернул', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Сообщение не найдено (Message not found), у Message нет метода с таким именем (Method is not implemented) или исключение внутри вызванного метода.',
      content: {
        'application/json': {
          examples: {
            messageNotFound: { summary: 'Сообщение не найдено', value: { success: false, error: 'Message not found' } },
            notImplemented: { summary: 'Неизвестный метод', value: { success: false, error: 'Method is not implemented' } }
          }
        }
      }
    }
  */
  try {
    const { messageId, chatId, method, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const message = await _getMessageById(client, messageId, chatId)
    if (!message) { throw new Error('Message not found') }
    if (typeof message[method] !== 'function') {
      throw new Error('Method is not implemented')
    }
    const result = options ? await message[method](options) : await message[method]()
    res.json({ success: true, data: result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  deleteMessage,
  downloadMedia,
  downloadMediaAsData,
  forward,
  getInfo,
  getMentions,
  getOrder,
  getPayment,
  getQuotedMessage,
  react,
  reply,
  star,
  unstar,
  getReactions,
  getGroupMentions,
  edit,
  getContact,
  runMethod
}
