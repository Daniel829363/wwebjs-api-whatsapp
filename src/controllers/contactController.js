const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')

/**
 * Retrieves information about a WhatsApp contact by ID.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to retrieve information for.
 * @throws {Error} If there is an error retrieving the contact information.
 * @returns {Object} The contact information object.
 */
const getClassInfo = async (req, res) => {
  /*
    #swagger.summary = 'Получить контакт по contactId'
    #swagger.description = '<p>Возвращает объект Contact whatsapp-web.js: номер, имя из адресной книги (<code>name</code>), имя профиля WhatsApp (<code>pushname</code>), признаки бизнес-аккаунта, «мой контакт», блокировки и т.п.</p><p><b>Когда использовать:</b> чтобы узнать, как подписан собеседник, сохранён ли он в контактах, заблокирован ли он, является ли бизнес-аккаунтом. Тот же результат даёт /client/getContactById.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Передавайте id с суффиксом <code>@c.us</code>; голый номер или номер с + не подходит.</li><li>WhatsApp Web создаёт объект контакта даже для номера, с которым никогда не было переписки, поэтому успешный ответ не означает, что номер зарегистрирован в WhatsApp — для проверки используйте /client/isRegisteredUser или /client/getNumberId.</li><li><code>name</code>/<code>shortName</code> заполнены только для сохранённых в телефоне контактов; иначе ориентируйтесь на <code>pushname</code>. Для бизнес-аккаунтов может присутствовать <code>businessProfile</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, contact: {...}}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Объект Contact (сокращено).',
      content: { 'application/json': { example: {
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
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    res.json({ success: true, contact })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Blocks a WhatsApp contact by ID.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to block.
 * @throws {Error} If there is an error blocking the contact.
 * @returns {Object} The result of the blocking operation.
 */
const block = async (req, res) => {
  /*
    #swagger.summary = 'Заблокировать контакт'
    #swagger.description = '<p>Блокирует контакт на подключённом аккаунте: он больше не сможет писать и звонить вам.</p><p><b>Когда использовать:</b> для защиты от спама или по запросу оператора. Снять блокировку — /contact/unblock; список заблокированных — /client/getBlockedContacts.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Действие сразу применяется к реальному аккаунту WhatsApp (видно и на телефоне).</li><li>Группы заблокировать нельзя: для id вида ...@g.us метод ничего не делает и возвращает <code>result: false</code>.</li><li>Пока контакт заблокирован, писать ему через API не получится — сначала выполните /contact/unblock.</li></ul><p><b>Ответ:</b> <code>result: true</code> — заблокирован, <code>false</code> — передан id группы.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — контакт заблокирован; false — id относится к группе, блокировка не выполнена.',
      content: { 'application/json': { examples: {
            blocked: { summary: 'Заблокирован', value: { success: true, result: true } },
            group: { summary: 'Передан id группы', value: { success: true, result: false } }
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.block()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the 'About' information of a WhatsApp contact by ID.
 *
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to retrieve 'About' information for.
 * @throws {Error} If there is an error retrieving the contact information.
 * @returns {Object} The 'About' information of the contact.
 */
const getAbout = async (req, res) => {
  /*
    #swagger.summary = 'Получить текст «О себе» (about) контакта'
    #swagger.description = '<p>Возвращает текст статуса «О себе» (about / «Сведения») контакта.</p><p><b>Когда использовать:</b> для обогащения карточки клиента. Это не «истории» (Status-публикации) — их метод не возвращает.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если настройки приватности контакта не позволяют вам видеть «Сведения» или текст недоступен, возвращается <code>result: null</code>.</li></ul><p><b>Ответ:</b> <code>result</code> — строка или null.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result — текст «О себе» или null, если он скрыт настройками приватности или недоступен.',
      content: { 'application/json': { examples: {
            about: { summary: 'Текст доступен', value: { success: true, result: 'На работе, отвечу позже' } },
            hidden: { summary: 'Скрыт приватностью', value: { success: true, result: null } }
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.getAbout()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the chat information of a contact with a given contactId.
 *
 * @async
 * @function getChat
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the chat information of the contact.
 */
const getChat = async (req, res) => {
  /*
    #swagger.summary = 'Получить чат с контактом'
    #swagger.description = '<p>Возвращает объект Chat, соответствующий личной переписке с контактом.</p><p><b>Когда использовать:</b> когда есть contactId, а нужны данные чата (непрочитанные, архив, последнее сообщение). Для личных чатов chatId совпадает с contactId, поэтому можно сразу вызвать /chat/getClassInfo.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Для собственного номера (контакт с <code>isMe: true</code>) возвращается <code>result: null</code>.</li><li>Если переписки ещё не было, WhatsApp Web может вернуть новый пустой чат.</li></ul><p><b>Ответ:</b> <code>result</code> — объект Chat или null.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result — объект Chat (сокращено) или null для собственного номера.',
      content: { 'application/json': { examples: {
            chat: { summary: 'Чат найден', value: { success: true, result: { id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' }, name: 'Иван Петров', isGroup: false, isReadOnly: false, unreadCount: 0, timestamp: 1730000000, archived: false, pinned: false, isMuted: false, muteExpiration: 0 } } },
            me: { summary: 'Собственный номер', value: { success: true, result: null } }
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.getChat()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the formatted number of a contact with a given contactId.
 *
 * @async
 * @function getFormattedNumber
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the formatted number of the contact.
 */
const getFormattedNumber = async (req, res) => {
  /*
    #swagger.summary = 'Получить номер контакта в отформатированном виде'
    #swagger.description = '<p>Возвращает номер телефона контакта в читаемом международном формате, как его показывает WhatsApp (с +, пробелами и дефисами по правилам страны).</p><p><b>Когда использовать:</b> для показа номера человеку (в CRM, отчётах). Для отправки сообщений используйте id вида ...@c.us, а не отформатированную строку.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Формат зависит от страны номера и правил WhatsApp Web — разбирать эту строку программно не рекомендуется.</li><li>Аналог без поиска контакта — /client/getFormattedNumber.</li></ul><p><b>Ответ:</b> <code>result</code> — строка.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result — номер в читаемом международном формате.',
      content: { 'application/json': { example: { success: true, result: '+7 999 123-45-67' } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.getFormattedNumber()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the country code of a contact with a given contactId.
 *
 * @async
 * @function getCountryCode
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the country code of the contact.
 */
const getCountryCode = async (req, res) => {
  /*
    #swagger.summary = 'Получить телефонный код страны контакта'
    #swagger.description = '<p>Возвращает телефонный код страны номера контакта (без +), например <code>7</code> для <code>79991234567@c.us</code>, <code>1</code> для США.</p><p><b>Когда использовать:</b> для маршрутизации клиентов по странам, выбора языка ответа и т.п.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Возвращается строка с цифрами кода, а не ISO-код страны («7», а не «RU»). Один код может соответствовать нескольким странам (7 — Россия и Казахстан).</li><li>Аналог без поиска контакта — /client/getCountryCode.</li></ul><p><b>Ответ:</b> <code>result</code> — строка с кодом.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result — телефонный код страны без +.',
      content: { 'application/json': { example: { success: true, result: '7' } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.getCountryCode()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the profile picture url of a contact with a given contactId.
 *
 * @async
 * @function getProfilePicUrl
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose chat information is being retrieved.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error retrieving the chat information.
 * @returns {Promise<void>} A promise that resolves with the profile picture url of the contact.
 */
const getProfilePicUrl = async (req, res) => {
  /*
    #swagger.summary = 'Получить ссылку на аватар контакта'
    #swagger.description = '<p>Возвращает URL фотографии профиля контакта на серверах WhatsApp.</p><p><b>Когда использовать:</b> для показа аватара клиента в CRM или чат-интерфейсе.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если фото не установлено или скрыто настройками приватности, возвращается <code>result: null</code>.</li><li>Ссылка временная (подписанный URL CDN WhatsApp) и со временем перестаёт открываться. Если аватар нужен надолго — скачайте файл сразу и храните у себя, а не ссылку.</li></ul><p><b>Ответ:</b> <code>result</code> — строка URL или null.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result — URL аватара или null, если фото нет или оно скрыто.',
      content: { 'application/json': { examples: {
            url: { summary: 'Аватар доступен', value: { success: true, result: 'https://pps.whatsapp.net/v/t61.24694-24/123456789_n.jpg?ccb=11-4&oh=01_AdQ&oe=6740A1B2&_nc_cat=1' } },
            hidden: { summary: 'Нет фото или скрыто', value: { success: true, result: null } }
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.getProfilePicUrl() || null
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Unblocks the contact with a given contactId.
 *
 * @async
 * @function unblock
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose contact is being unblocked.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error unblocking the contact.
 * @returns {Promise<void>} A promise that resolves with the result of unblocking the contact.
 */
const unblock = async (req, res) => {
  /*
    #swagger.summary = 'Разблокировать контакт'
    #swagger.description = '<p>Снимает блокировку с контакта, ранее заблокированного через /contact/block или вручную на телефоне.</p><p><b>Когда использовать:</b> чтобы снова получать сообщения от контакта и иметь возможность ему писать.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Для id группы (...@g.us) ничего не делает и возвращает <code>result: false</code>.</li><li>Сообщения, отправленные контактом во время блокировки, не будут доставлены и после разблокировки.</li></ul><p><b>Ответ:</b> <code>result: true</code> — разблокирован, <code>false</code> — передан id группы.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — контакт разблокирован; false — id относится к группе.',
      content: { 'application/json': { examples: {
            unblocked: { summary: 'Разблокирован', value: { success: true, result: true } },
            group: { summary: 'Передан id группы', value: { success: true, result: false } }
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.unblock()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets the contact's common groups with you.
 *
 * @async
 * @function unblock
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.contactId - The ID of the client whose contact is being unblocked.
 * @throws {Error} If the contact with the given contactId is not found or if there is an error unblocking the contact.
 * @returns {Promise<void>} A promise that resolves with the result of unblocking the contact.
 */
const getCommonGroups = async (req, res) => {
  /*
    #swagger.summary = 'Получить общие группы с контактом'
    #swagger.description = '<p>Возвращает список групп, в которых состоите и вы, и указанный контакт.</p><p><b>Когда использовать:</b> чтобы понять, из какой группы/сообщества пришёл клиент, или проверить участие контакта в ваших группах.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Возвращаются только id групп (объекты ChatId), без названий — название получите через /chat/getClassInfo по <code>_serialized</code>.</li><li>Если общих групп нет, возвращается пустой массив.</li></ul><p><b>Ответ:</b> <code>result</code> — массив объектов <code>{server, user, _serialized}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['contactId'],
            properties: {
              contactId: {
                type: 'string',
                description: 'id контакта в формате <код страны><номер>@c.us (только цифры, без +, пробелов и скобок). Можно получить из /client/getContacts, /client/getNumberId или из поля from входящего сообщения.',
                example: '79991234567@c.us'
              }
            }
          },
          examples: {
            contact: { summary: 'Контакт', value: { contactId: '79991234567@c.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result — массив id общих групп (может быть пустым).',
      content: { 'application/json': { example: {
            success: true,
            result: [
              { server: 'g.us', user: '120363012345678901', _serialized: '120363012345678901@g.us' }
            ]
          } } }
    }
    #swagger.responses[500] = {
      description: 'Server failure. Контакт не получен (error: Contact not found), либо исключение whatsapp-web.js / Puppeteer — например, при синтаксически неверном contactId. В error — текст исключения.',
      content: {
        'application/json': {
          examples: {
            contact_not_found: { summary: 'Контакт не найден', value: { success: false, error: 'Contact not found' } },
            other: { summary: 'Другое исключение', value: { success: false, error: 'Protocol error (Runtime.callFunctionOn): Target closed.' } }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    if (!contact) {
      throw new Error('Contact not found')
    }
    const result = await contact.getCommonGroups()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  block,
  getAbout,
  getChat,
  unblock,
  getFormattedNumber,
  getCountryCode,
  getProfilePicUrl,
  getCommonGroups
}
