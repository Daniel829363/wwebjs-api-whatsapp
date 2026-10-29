const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')
const { logger } = require('../logger')

/**
 * @function
 * @async
 * @name getClassInfo
 * @description Gets information about a chat using the chatId and sessionId
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string} req.body.chatId - The ID of the chat to get information for
 * @param {string} req.params.sessionId - The ID of the session to use
 * @returns {Object} - Returns a JSON object with the success status and chat information
 * @throws {Error} - Throws an error if chat is not found or if there is a server error
 */
const getClassInfo = async (req, res) => {
  /*
    #swagger.summary = 'Получить объект чата по chatId'
    #swagger.description = '<p>Возвращает объект чата whatsapp-web.js (Chat, для групп — GroupChat с полем <code>groupMetadata</code>) по его id.</p><p><b>Когда использовать:</b> чтобы узнать название чата, число непрочитанных, признак архива/закрепления/отключения звука, последнее сообщение; для группы — участников, владельца и настройки (в <code>groupMetadata</code>).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>chatId передаётся в теле, а не в пути. Формат: <code>79991234567@c.us</code> (только цифры, без +, пробелов и скобок) или <code>120363012345678901@g.us</code>. Голый номер без суффикса не подходит.</li><li>Синтаксически неверный id обычно приводит к 500 с текстом исключения whatsapp-web.js, а не к 404.</li><li>Если чата нет в списке чатов, WhatsApp Web может создать его «на лету» (пустой чат) — наличие ответа не гарантирует, что переписка существовала.</li></ul><p><b>Ответ:</b> <code>{success: true, chat: {...}}</code>. Объект содержит много полей; ниже — сокращённый пример.</p>'
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
                description: 'id чата: личный <код страны><номер>@c.us (только цифры, без +) или группа ...@g.us. Получить можно из /client/getChats или /client/getNumberId.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } },
            group: { summary: 'Группа', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Чат найден. Поле chat — сериализованный объект Chat/GroupChat (сокращено).',
      content: {
        'application/json': {
          example: {
            success: true,
            chat: {
              id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' },
              name: 'Иван Петров',
              isGroup: false,
              isReadOnly: false,
              unreadCount: 2,
              timestamp: 1730000000,
              archived: false,
              pinned: false,
              isMuted: false,
              muteExpiration: 0,
              lastMessage: {
                id: { fromMe: false, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'false_79991234567@c.us_3EB0C767D82E4B5A1F2C' },
                body: 'Привет!',
                type: 'chat',
                timestamp: 1730000000,
                from: '79991234567@c.us',
                to: '79990000000@c.us',
                fromMe: false,
                hasMedia: false
              }
            }
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    res.json({ success: true, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Clears all messages in a chat.
 *
 * @function
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {string} req.body.chatId - The ID of the chat to clear messages from.
 * @throws {Error} If the chat is not found or there is an internal server error.
 * @returns {Object} The success status and the cleared messages.
 */
const clearMessages = async (req, res) => {
  /*
    #swagger.summary = 'Очистить все сообщения в чате'
    #swagger.description = '<p>Удаляет всю историю сообщений указанного чата <b>на вашей стороне</b> (аналог «Очистить чат» в WhatsApp). Сам чат остаётся в списке чатов.</p><p><b>Когда использовать:</b> чтобы очистить переписку на подключённом аккаунте, не удаляя чат целиком (для удаления чата — /chat/delete).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><b>Необратимо:</b> восстановить очищенные сообщения через API нельзя.</li><li>У собеседника сообщения не удаляются — это не «удалить у всех».</li><li>После очистки /message/... по старым messageId перестанут находить сообщения.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если чат найден и очищен, false — если WhatsApp Web не нашёл чат.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } },
            group: { summary: 'Группа', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Операция выполнена. result: true — очищено, false — чат не найден внутри WhatsApp Web.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.clearMessages()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Stops typing or recording in chat immediately.
 *
 * @function
 * @async
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {string} req.body.chatId - ID of the chat to clear the state for.
 * @param {string} req.params.sessionId - ID of the session the chat belongs to.
 * @returns {Promise<void>} - A Promise that resolves with a JSON object containing a success flag and the result of clearing the state.
 * @throws {Error} - If there was an error while clearing the state.
 */
const clearState = async (req, res) => {
  /*
    #swagger.summary = 'Сбросить статус «печатает» / «записывает аудио»'
    #swagger.description = '<p>Немедленно прекращает показ собеседнику индикатора «печатает...» или «записывает аудио...», включённого через /chat/sendStateTyping или /chat/sendStateRecording.</p><p><b>Когда использовать:</b> бот «печатал», но решил не отвечать или ответ уже отправлен раньше, чем истекли ~25 секунд индикатора.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если индикатор не был включён, вызов просто ничего не меняет.</li><li>После отправки сообщения индикатор обычно гаснет сам — вызывать этот метод после каждой отправки не обязательно.</li></ul><p><b>Ответ:</b> <code>result: true</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Индикатор сброшен.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.clearState()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Delete a chat.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.chatId - The ID of the chat to be deleted.
 * @returns {Object} A JSON response indicating whether the chat was deleted successfully.
 * @throws {Object} If there is an error while deleting the chat, an error response is sent with a status code of 500.
 * @throws {Object} If the chat is not found, an error response is sent with a status code of 404.
 */
const deleteChat = async (req, res) => {
  /*
    #swagger.summary = 'Удалить чат'
    #swagger.description = '<p>Удаляет чат из списка чатов подключённого аккаунта вместе с его историей (аналог «Удалить чат» в WhatsApp).</p><p><b>Когда использовать:</b> чтобы убрать чат из списка (/client/getChats). Если нужно только стереть сообщения и оставить чат — используйте /chat/clearMessages; чтобы просто скрыть — /client/archiveChat.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><b>Необратимо:</b> история на этом аккаунте теряется.</li><li>Удаление только у вас: у собеседника переписка остаётся. Новое входящее сообщение снова создаст чат.</li><li>Удаление группового чата не означает выход из группы — для выхода используйте /groupChat/leave.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если чат удалён, false — если WhatsApp Web не нашёл чат.</p>'
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
                description: 'id удаляемого чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Операция выполнена. result: true — чат удалён, false — чат не найден внутри WhatsApp Web.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.delete()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Fetches messages from a specified chat.
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
    #swagger.summary = 'Загрузить сообщения чата (историю)'
    #swagger.description = '<p>Возвращает сообщения указанного чата, отсортированные от старых к новым. Служебные уведомления (вступление в группу, смена темы и т.п.) исключаются.</p><p><b>Когда использовать:</b> чтобы прочитать историю переписки, найти <code>id.id</code> сообщения для методов /message/..., выгрузить последние N сообщений или сообщения после определённого момента.</p><p><b>Параметры searchOptions:</b></p><ul><li><code>limit</code> (number) — сколько последних сообщений вернуть. Если сообщений в памяти меньше, сервер догружает более ранние из истории, пока не наберёт limit или история не закончится. Возвращаются самые новые limit сообщений.</li><li><code>fromMe</code> (boolean) — true: только свои исходящие, false: только входящие. Не передавайте поле, если нужны все.</li><li><code>since</code> (number) — Unix-время в <b>секундах</b> (не миллисекундах): вернуть только сообщения не старше этого момента.</li></ul><p><b>Ограничения и подводные камни:</b></p><ul><li>Если <code>searchOptions</code> пустой или не передан, возвращаются только сообщения, уже загруженные в WhatsApp Web (их количество не гарантировано) — для предсказуемого результата всегда задавайте <code>limit</code>.</li><li>Большой <code>limit</code> (сотни и тысячи) заметно замедляет ответ: история догружается порциями через браузер.</li><li>Сочетание <code>since</code> с <code>limit</code>: фильтр по времени не останавливает догрузку — если подходящих сообщений меньше limit, сервер будет загружать историю до её начала. Для больших чатов это долго.</li><li>Догружается только та история, которая доступна связанному устройству (WhatsApp Web), полной истории с телефона может не быть.</li><li>Ответ может быть большим: каждое сообщение содержит также поле <code>_data</code> с сырыми данными. Медиа не включается — скачивайте через /message/downloadMedia.</li></ul><p><b>Ответ:</b> <code>{success: true, messages: [Message, ...]}</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              },
              searchOptions: {
                type: 'object',
                description: 'Необязательные параметры выборки. По умолчанию {} — без limit возвращаются только уже загруженные в память сообщения.',
                properties: {
                  limit: { type: 'integer', description: 'Сколько последних сообщений вернуть (больше 0).', example: 50 },
                  fromMe: { type: 'boolean', description: 'true — только свои сообщения, false — только входящие; не передавать — все.', example: false },
                  since: { type: 'integer', description: 'Unix-время в секундах; вернуть сообщения начиная с этого момента.', example: 1730000000 }
                }
              }
            }
          },
          examples: {
            last50: { summary: 'Последние 50 сообщений', value: { chatId: '79991234567@c.us', searchOptions: { limit: 50 } } },
            incomingOnly: { summary: 'Последние 20 входящих', value: { chatId: '79991234567@c.us', searchOptions: { limit: 20, fromMe: false } } },
            groupSince: { summary: 'Группа: сообщения начиная с момента времени', value: { chatId: '120363012345678901@g.us', searchOptions: { limit: 100, since: 1730000000 } } },
            loaded: { summary: 'Без опций (только загруженные в память)', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив сообщений (от старых к новым). Объекты Message сокращены; в реальном ответе есть также _data и другие поля.',
      content: {
        'application/json': {
          example: {
            success: true,
            messages: [
              {
                id: { fromMe: false, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'false_79991234567@c.us_3EB0C767D82E4B5A1F2C' },
                ack: 3,
                hasMedia: false,
                body: 'Здравствуйте! Есть в наличии?',
                type: 'chat',
                timestamp: 1730000000,
                from: '79991234567@c.us',
                to: '79990000000@c.us',
                deviceType: 'android',
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
              },
              {
                id: { fromMe: true, remote: '79991234567@c.us', id: '3EB0A1B2C3D4E5F60718', _serialized: 'true_79991234567@c.us_3EB0A1B2C3D4E5F60718' },
                ack: 2,
                hasMedia: true,
                body: 'Фото товара',
                type: 'image',
                timestamp: 1730000060,
                from: '79990000000@c.us',
                to: '79991234567@c.us',
                fromMe: true,
                hasQuotedMsg: true
              }
            ]
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    */
    const { chatId, searchOptions = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const messages = Object.keys(searchOptions).length ? await chat.fetchMessages(searchOptions) : await chat.fetchMessages()
    res.json({ success: true, messages })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets the contact for a chat
 * @async
 * @function
 * @param {Object} req - The HTTP request object
 * @param {Object} res - The HTTP response object
 * @param {string} req.params.sessionId - The ID of the current session
 * @param {string} req.body.chatId - The ID of the chat to get the contact for
 * @returns {Promise<void>} - Promise that resolves with the chat's contact information
 * @throws {Error} - Throws an error if chat is not found or if there is an error getting the contact information
 */
const getContact = async (req, res) => {
  /*
    #swagger.summary = 'Получить контакт, соответствующий чату'
    #swagger.description = '<p>Возвращает объект Contact для указанного чата: имя из адресной книги, pushname (имя, которое человек указал в WhatsApp), номер, признаки бизнес-аккаунта, блокировки и т.п.</p><p><b>Когда использовать:</b> когда у вас есть chatId (например, из webhook) и нужны данные собеседника. Если у вас уже есть contactId, удобнее /client/getContactById или /contact/getClassInfo.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Для группы (...@g.us) возвращается «контакт» самой группы (isGroup: true), а не участники — участники лежат в <code>groupMetadata.participants</code> ответа /chat/getClassInfo.</li><li>Поля <code>name</code>/<code>shortName</code> заполнены только если номер сохранён в контактах телефона; иначе используйте <code>pushname</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, contact: {...}}</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Контакт чата (объект Contact, сокращено).',
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
              pushname: 'Ivan',
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
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const contact = await chat.getContact()
    res.json({ success: true, contact })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a recording state to a WhatsApp chat.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the recording state to.
 * @returns {object} - An object containing a success message and the result of the sendStateRecording method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const sendStateRecording = async (req, res) => {
  /*
    #swagger.summary = 'Показать «записывает аудио...»'
    #swagger.description = '<p>Включает у собеседника индикатор «записывает аудио...» в указанном чате. Индикатор держится около 25 секунд или до отправки сообщения / вызова /chat/clearState.</p><p><b>Когда использовать:</b> перед отправкой голосового сообщения ботом, чтобы поведение выглядело естественно.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Для длинной «записи» вызывайте повторно не чаще, чем раз в ~20 секунд.</li><li>Метод только меняет индикатор — аудио он не отправляет (для этого /client/sendMessage).</li></ul><p><b>Ответ:</b> <code>result: true</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Индикатор включён.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.sendStateRecording()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a typing state to a WhatsApp chat.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const sendStateTyping = async (req, res) => {
  /*
    #swagger.summary = 'Показать «печатает...»'
    #swagger.description = '<p>Включает у собеседника индикатор «печатает...» в указанном чате. Индикатор держится около 25 секунд или до отправки сообщения / вызова /chat/clearState.</p><p><b>Когда использовать:</b> перед отправкой ответа ботом — сделать паузу в несколько секунд с индикатором, затем /client/sendMessage. Это выглядит естественнее и снижает риск блокировки за «роботизированное» поведение.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Для долгого «набора» вызывайте повторно не чаще, чем раз в ~20 секунд.</li><li>Метод только меняет индикатор — сообщение он не отправляет.</li></ul><p><b>Ответ:</b> <code>result: true</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } },
            group: { summary: 'Группа', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Индикатор включён.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.sendStateTyping()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a seen state to a WhatsApp chat.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const sendSeen = async (req, res) => {
  /*
    #swagger.summary = 'Пометить чат прочитанным'
    #swagger.description = '<p>Помечает все сообщения чата как прочитанные (собеседник увидит синие галочки, если у обеих сторон включены отчёты о прочтении).</p><p><b>Когда использовать:</b> после обработки входящих сообщений ботом. Если на сервере включено <code>SET_MESSAGES_AS_SEEN=TRUE</code>, входящие помечаются прочитанными автоматически и вызывать метод не нужно.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> обязателен — без него сразу 400 <code>chatId is required</code>.</li><li>Помечается весь чат целиком, а не отдельное сообщение.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если чат найден и помечен, иначе false.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us. Обязателен.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Операция выполнена. result: true — помечено, false — чат не найден внутри WhatsApp Web.',
      content: { 'application/json': { example: { success: true, result: true } } }
    }
    #swagger.responses[400] = {
      description: 'Bad Request. В теле не передан chatId.',
      content: { 'application/json': { example: { success: false, error: 'chatId is required' } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Для найденного объекта чата нет метода sendSeen (error: sendSeen method not available for this chat), либо исключение whatsapp-web.js / Puppeteer — в error его текст.',
      content: {
        'application/json': {
          examples: {
            not_available: { summary: 'Метод недоступен для этого чата', value: { success: false, error: 'sendSeen method not available for this chat' } },
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    
    if (typeof chat.sendSeen !== 'function') {
      sendErrorResponse(res, 500, 'sendSeen method not available for this chat')
      return
    }
    
    const result = await chat.sendSeen()
    res.json({ success: true, result })
  } catch (error) {
    logger.error({ err: error, sessionId: req.params.sessionId, chatId: req.body.chatId }, 'Error in chat.sendSeen')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Mark this chat as unread.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const markUnread = async (req, res) => {
  /*
    #swagger.summary = 'Пометить чат непрочитанным'
    #swagger.description = '<p>Ставит на чате отметку «непрочитано» (как долгое нажатие → «Пометить как непрочитанное» в WhatsApp). Сообщения при этом не меняются.</p><p><b>Когда использовать:</b> чтобы оставить чат «на потом» для оператора, который работает с этим же номером в телефоне или WhatsApp Web.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Отметка видна только вам, собеседник её не видит.</li><li>Метод не возвращает данных: в ответе есть только <code>success</code> (поле result отсутствует).</li><li>Аналог в разделе Client — /client/markChatUnread.</li></ul><p><b>Ответ:</b> <code>{success: true}</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Чат помечен непрочитанным. Поле result не возвращается (метод whatsapp-web.js ничего не возвращает).',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.markUnread()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sync history.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const syncHistory = async (req, res) => {
  /*
    #swagger.summary = 'Запросить синхронизацию истории чата с телефона'
    #swagger.description = '<p>Отправляет на основной телефон запрос на догрузку истории указанного чата в WhatsApp Web (связанное устройство).</p><p><b>Когда использовать:</b> если /chat/fetchMessages возвращает слишком мало старых сообщений, потому что история не была передана на связанное устройство.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Запрос асинхронный: метод только инициирует синхронизацию. Сообщения появляются позже, и только если телефон онлайн. Повторите /chat/fetchMessages через некоторое время.</li><li>Запрос отправляется только если для чата история ещё не была полностью передана; иначе возвращается false и ничего не происходит.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если запрос отправлен, false — если синхронизация не требуется или недоступна.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — запрос синхронизации отправлен, false — не отправлен.',
      content: {
        'application/json': {
          examples: {
            requested: { summary: 'Запрос отправлен', value: { success: true, result: true } },
            notNeeded: { summary: 'Синхронизация не требуется', value: { success: true, result: false } }
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const result = await chat.syncHistory()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Return array of all labels.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const getLabels = async (req, res) => {
  /*
    #swagger.summary = 'Метки (labels) чата'
    #swagger.description = '<p>Возвращает метки WhatsApp Business, назначенные указанному чату.</p><p><b>Когда использовать:</b> в CRM-сценариях на бизнес-аккаунте — узнать, какие метки («Новый клиент», «Оплачено» и т.п.) стоят на чате. Список всех меток аккаунта — /client/getLabels.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Метки есть только в WhatsApp Business. На обычном аккаунте возвращается пустой массив.</li></ul><p><b>Ответ:</b> <code>{success: true, labels: [{id, name, hexColor}]}</code>.</p>'
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
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            personal: { summary: 'Личный чат', value: { chatId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив меток чата (может быть пустым).',
      content: {
        'application/json': {
          example: {
            success: true,
            labels: [
              { id: '1', name: 'Новый клиент', hexColor: '#ff9485' },
              { id: '5', name: 'Оплачено', hexColor: '#64c4ff' }
            ]
          }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
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
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    const labels = await chat.getLabels()
    res.json({ success: true, labels })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Add or remove labels.
 * @async
 * @function
 * @param {object} req - The request object.
 * @param {object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {object} req.body - The request body.
 * @param {string} req.body.chatId - The ID of the chat to send the typing state to.
 * @returns {object} - An object containing a success message and the result of the sendStateTyping method.
 * @throws {object} - An error object containing a status code and error message if an error occurs.
 */
const changeLabels = async (req, res) => {
  /*
    #swagger.summary = 'Установить набор меток (labels) чата'
    #swagger.description = '<p>Задаёт метки WhatsApp Business для указанного чата. Переданный список становится <b>полным</b> набором меток чата: метки из <code>labelIds</code> добавляются, а все прочие метки, уже стоявшие на чате, снимаются.</p><p><b>Когда использовать:</b> для перевода клиента между этапами воронки на бизнес-аккаунте. id меток берите из /client/getLabels.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает только на WhatsApp Business; на обычном аккаунте WhatsApp Web выбрасывает ошибку <code>[LT01] Only Whatsapp business</code> (вернётся 500).</li><li>Чтобы добавить одну метку, не потеряв остальные, сначала получите текущие через /chat/getLabels и передайте объединённый список.</li><li>Пустой массив <code>[]</code> снимает все метки.</li><li>Несуществующие id меток молча игнорируются.</li><li>Метод не создаёт новые метки — только назначает существующие.</li></ul><p><b>Ответ:</b> <code>{success: true}</code> без данных.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'labelIds'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              },
              labelIds: {
                type: 'array',
                items: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
                description: 'Полный список id меток, которые должны остаться на чате (строки или числа, см. /client/getLabels). Остальные метки чата будут сняты.',
                example: ['1', '5']
              }
            }
          },
          examples: {
            set: { summary: 'Оставить метки 1 и 5', value: { chatId: '79991234567@c.us', labelIds: ['1', '5'] } },
            clear: { summary: 'Снять все метки', value: { chatId: '79991234567@c.us', labelIds: [] } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Метки применены. Данные не возвращаются.',
      content: { 'application/json': { example: { success: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, labelIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    await chat.changeLabels(labelIds)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Executes a method on the chat associated with the given sessionId.
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
    #swagger.summary = 'Вызвать произвольный метод объекта Chat'
    #swagger.description = '<p>Находит чат по <code>chatId</code> и вызывает у объекта whatsapp-web.js Chat (или GroupChat для групп) метод с именем <code>method</code>. Результат метода возвращается в поле <code>data</code>.</p><p><b>Когда использовать:</b> только если нужного действия нет в отдельных эндпоинтах. Примеры методов Chat: <code>archive</code>, <code>unarchive</code>, <code>pin</code>, <code>unpin</code>, <code>mute</code>, <code>unmute</code>, <code>getPinnedMessages</code>, <code>getCustomerNote</code>, <code>addOrEditCustomerNote</code>; у GroupChat дополнительно методы управления группой. Полный список — в документации whatsapp-web.js для вашей версии.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Методу передаётся <b>не более одного</b> аргумента: если <code>options</code> задан (не пустая строка, не null), вызывается <code>chat[method](options)</code>, иначе <code>chat[method]()</code>. Методы с двумя и более аргументами так не вызвать.</li><li>Если у объекта нет функции с таким именем — 500 <code>Method is not implemented</code>.</li><li>Можно вызвать и разрушительные методы (<code>delete</code>, <code>clearMessages</code>, <code>sendMessage</code> и т.п.) — доступ к эндпоинту равен полному управлению чатом.</li><li>Результат сериализуется в JSON как есть; методы, возвращающие объекты с циклическими ссылками, могут вызвать ошибку 500.</li></ul><p><b>Ответ:</b> <code>{success: true, data: результат метода}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'method'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id чата: личный ...@c.us или группа ...@g.us.',
                example: '79991234567@c.us'
              },
              method: {
                type: 'string',
                description: 'Имя метода объекта Chat/GroupChat whatsapp-web.js (регистр важен).',
                example: 'getPinnedMessages'
              },
              options: {
                anyOf: [
                  { type: 'object' },
                  { type: 'string' }
                ],
                description: 'Единственный аргумент, передаваемый в метод. Не передавайте поле, если метод вызывается без аргументов.'
              }
            }
          },
          examples: {
            noArgs: { summary: 'Метод без аргументов', value: { chatId: '79991234567@c.us', method: 'getPinnedMessages' } },
            withArg: { summary: 'Метод с одним аргументом (заметка клиента)', value: { chatId: '79991234567@c.us', method: 'addOrEditCustomerNote', options: 'VIP-клиент, звонить после 18:00' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Метод выполнен; в data — его результат (тип зависит от метода).',
      content: { 'application/json': { example: { success: true, data: true } } }
    }
    #swagger.responses[404] = {
      description: 'Not Found. Либо сессия не готова (error: session_not_found, session_not_connected, browser tab closed, session closed), либо чат с указанным chatId не найден (error: Chat not Found).',
      content: {
        'application/json': {
          examples: {
            chat_not_found: { summary: 'Чат не найден', value: { success: false, error: 'Chat not Found' } },
            session_not_found: { summary: 'Сессия не запущена', value: { success: false, error: 'session_not_found' } },
            session_not_connected: { summary: 'Сессия не авторизована / не CONNECTED', value: { success: false, error: 'session_not_connected' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: 'Server failure. У объекта чата нет метода с таким именем (error: Method is not implemented), либо исключение, брошенное самим методом / whatsapp-web.js / Puppeteer.',
      content: {
        'application/json': {
          examples: {
            not_implemented: { summary: 'Неизвестный метод', value: { success: false, error: 'Method is not implemented' } },
            other: { summary: 'Исключение внутри метода', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { chatId, method, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat) {
      sendErrorResponse(res, 404, 'Chat not Found')
      return
    }
    if (typeof chat[method] !== 'function') {
      throw new Error('Method is not implemented')
    }
    const result = options ? await chat[method](options) : await chat[method]()
    res.json({ success: true, data: result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  clearMessages,
  clearState,
  deleteChat,
  fetchMessages,
  getContact,
  sendStateRecording,
  sendStateTyping,
  sendSeen,
  markUnread,
  syncHistory,
  getLabels,
  changeLabels,
  runMethod
}
