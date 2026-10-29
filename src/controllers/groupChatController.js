const { MessageMedia } = require('whatsapp-web.js')
const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')

/**
 * Retrieves information about a chat based on the provided chatId
 *
 * @async
 * @function getClassInfo
 * @param {object} req - The request object
 * @param {object} res - The response object
 * @param {string} req.body.chatId - The chatId of the chat to retrieve information about
 * @param {string} req.params.sessionId - The sessionId of the client making the request
 * @throws {Error} The chat is not a group.
 * @returns {Promise<void>} - A JSON response with success true and chat object containing chat information
 */
const getClassInfo = async (req, res) => {
  /*
    #swagger.summary = 'Получить группу (метаданные и участников)'
    #swagger.description = '<p>Возвращает объект группы whatsapp-web.js (GroupChat) по её id: название, число непрочитанных, последнее сообщение и <code>groupMetadata</code> — владелец, описание, настройки и полный список участников с флагами администратора.</p><p><b>Когда использовать:</b> чтобы получить список участников и админов группы, проверить настройки (кто может писать / менять данные), узнать, являетесь ли вы администратором, перед вызовом остальных методов раздела Group Chat.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> должен быть id группы вида <code>...@g.us</code>. Для личного чата (<code>...@c.us</code>) вернётся 500 «The chat is not a group».</li><li>Если группа не найдена у этого аккаунта (вы не участник или id с опечаткой), возвращается 500 с текстом исключения.</li><li>Участники, скрытые за LID, по возможности подменяются на номер (<code>...@c.us</code>); если номер неизвестен, id остаётся вида <code>...@lid</code>.</li><li>Поле <code>isReadOnly</code> для группы означает «писать могут только администраторы» (announce).</li></ul><p><b>Ответ:</b> <code>{success: true, chat: {...}}</code>.</p>'
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
                description: 'id группы в формате ...@g.us (берётся из /client/getChats, /client/createGroup или webhook-событий)',
                example: '120363012345678901@g.us'
              }
            }
          },
          examples: {
            group: { summary: 'Группа', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Объект группы (сокращённый пример; набор полей groupMetadata зависит от версии WhatsApp Web).',
      content: {
        'application/json': {
          example: {
            success: true,
            chat: {
              id: { server: 'g.us', user: '120363012345678901', _serialized: '120363012345678901@g.us' },
              name: 'Команда поддержки',
              isGroup: true,
              isReadOnly: false,
              unreadCount: 0,
              timestamp: 1730000000,
              archived: false,
              pinned: false,
              isMuted: false,
              muteExpiration: 0,
              groupMetadata: {
                id: { server: 'g.us', user: '120363012345678901', _serialized: '120363012345678901@g.us' },
                creation: 1700000000,
                owner: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' },
                subject: 'Команда поддержки',
                desc: 'Рабочий чат',
                restrict: false,
                announce: false,
                size: 2,
                participants: [
                  { id: { server: 'c.us', user: '79991234567', _serialized: '79991234567@c.us' }, isAdmin: true, isSuperAdmin: true },
                  { id: { server: 'c.us', user: '79997654321', _serialized: '79997654321@c.us' }, isAdmin: false, isSuperAdmin: false }
                ]
              }
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    res.json({ success: true, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Adds participants to a group chat.
 * @async
 * @function
 * @param {Object} req - The request object containing the chatId and participantIds in the body.
 * @param {string} req.body.chatId - The ID of the group chat.
 * @param {Array<string>} req.body.participantIds - An array of participant IDs to be added to the group.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object containing a success flag and the updated participants list.
 * @throws {Error} Throws an error if the chat is not a group chat.
*/
const addParticipants = async (req, res) => {
  /*
    #swagger.summary = 'Добавить участников в группу'
    #swagger.description = '<p>Добавляет один или несколько контактов в группу. Для каждого участника возвращается отдельный код результата. Если человек запретил добавлять себя в группы, по умолчанию ему отправляется личное приглашение (inviteV4).</p><p><b>Когда использовать:</b> автоматическое добавление сотрудников / клиентов в рабочую группу сразу после её создания или по событию.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права администратора группы. Без них HTTP-ответ всё равно 200 с <code>success: true</code>, но <code>result</code> — строка «AddParticipantsError: You have no admin rights to add a participant to a group». Проверяйте тип <code>result</code>: объект = результаты по участникам, строка = общая ошибка.</li><li>Ошибка по отдельному участнику не прерывает запрос — смотрите <code>code</code> у каждого id (200 добавлен, 403 можно добавить только по приглашению, 404 номер не зарегистрирован в WhatsApp, 408 недавно вышел из группы, 409 уже участник, 417 нельзя добавить в сообщество, 419 группа заполнена).</li><li>Между добавлениями делается пауза <code>options.sleep</code> (по умолчанию случайная 250–500 мс). Массовое добавление незнакомых номеров — частая причина блокировки аккаунта WhatsApp; добавляйте небольшими партиями.</li><li>Номера передавайте в формате <code>79991234567@c.us</code> (только цифры, с кодом страны); id вида <code>...@lid</code> автоматически переводятся в номер.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: {"&lt;id участника&gt;": {code, message, isInviteV4Sent}}}</code> или <code>{success: true, result: "&lt;текст ошибки&gt;"}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'participantIds'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              participantIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Список id добавляемых контактов (...@c.us или ...@lid). Можно передать одну строку — она будет обёрнута в массив. Устаревшее имя поля contactIds тоже принимается (используется, если participantIds не передан).',
                example: ['79991234567@c.us', '79997654321@c.us']
              },
              options: {
                type: 'object',
                description: 'Необязательно, по умолчанию {}. Поля: sleep — пауза между добавлениями в мс: число или массив [min, max] для случайной паузы (по умолчанию [250, 500]; если max - min меньше 100, используется диапазон [max, max + 100]); autoSendInviteV4 (boolean, по умолчанию true) — отправить личное приглашение тем, кого нельзя добавить напрямую (код 403); comment (string, по умолчанию пустая строка) — текст к такому приглашению.',
                properties: {
                  sleep: { oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }], example: [250, 500] },
                  autoSendInviteV4: { type: 'boolean', example: true },
                  comment: { type: 'string', example: 'Присоединяйтесь к нашей группе' }
                }
              }
            }
          },
          examples: {
            simple: { summary: 'Добавить двух участников', value: { chatId: '120363012345678901@g.us', participantIds: ['79991234567@c.us', '79997654321@c.us'] } },
            withOptions: { summary: 'С паузой 1–2 с и текстом приглашения', value: { chatId: '120363012345678901@g.us', participantIds: ['79991234567@c.us'], options: { sleep: [1000, 2000], autoSendInviteV4: true, comment: 'Присоединяйтесь к нашей группе' } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'HTTP 200 возвращается и при частичной, и при полной неудаче — анализируйте result. Объект: ключ — id участника из запроса, code — код результата, message — пояснение, isInviteV4Sent — было ли отправлено личное приглашение. Строка: общая ошибка (нет прав администратора или пустая группа).',
      content: {
        'application/json': {
          examples: {
            perParticipant: {
              summary: 'Результат по каждому участнику',
              value: {
                success: true,
                result: {
                  '79991234567@c.us': { code: 200, message: 'The participant was added successfully', isInviteV4Sent: false },
                  '79997654321@c.us': { code: 403, message: 'The participant can be added by sending private invitation only', isInviteV4Sent: true },
                  '79990000000@c.us': { code: 404, message: 'The phone number is not registered on WhatsApp', isInviteV4Sent: false }
                }
              }
            },
            notAdmin: {
              summary: 'Нет прав администратора',
              value: { success: true, result: 'AddParticipantsError: You have no admin rights to add a participant to a group' }
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, contactIds, participantIds, options = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    // support old property name
    const addParticipants = participantIds || contactIds
    const participantIdsArray = Array.isArray(addParticipants) ? addParticipants : [addParticipants]
    const result = Object.keys(options).length ? await chat.addParticipants(participantIdsArray, options) : await chat.addParticipants(participantIdsArray)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Removes participants from a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated participants list
 * @throws {Error} If chat is not a group
 */
const removeParticipants = async (req, res) => {
  /*
    #swagger.summary = 'Удалить участников из группы'
    #swagger.description = '<p>Исключает указанных участников из группы.</p><p><b>Когда использовать:</b> модерация, автоматическое удаление уволенных сотрудников / клиентов с истёкшей подпиской.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права администратора группы; без них участники не будут удалены (в зависимости от версии WhatsApp Web возможна ошибка 500 с текстом исключения).</li><li>Id, которых нет среди участников группы, молча пропускаются — ошибки не будет, а ответ всё равно <code>{status: 200}</code>. Ответ не подтверждает, что кто-то действительно удалён; при необходимости проверьте состав через /groupChat/getClassInfo.</li><li>Принимаются id вида <code>...@c.us</code> и <code>...@lid</code> — участник ищется по обоим.</li><li>Действие необратимо: вернуть участника можно только через /groupChat/addParticipants или приглашение.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: {status: 200}}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'participantIds'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              participantIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Список id удаляемых участников (...@c.us или ...@lid). Можно передать одну строку. Устаревшее имя поля contactIds тоже принимается.',
                example: ['79997654321@c.us']
              }
            }
          },
          examples: {
            one: { summary: 'Удалить одного участника', value: { chatId: '120363012345678901@g.us', participantIds: ['79997654321@c.us'] } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Запрос на удаление отправлен. status всегда 200 — это константа whatsapp-web.js, а не подтверждение сервера WhatsApp.',
      content: {
        'application/json': {
          example: { success: true, result: { status: 200 } }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях (например, нет прав администратора) — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, contactIds, participantIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    // support old property name
    const addParticipants = participantIds || contactIds
    const participantIdsArray = Array.isArray(addParticipants) ? addParticipants : [addParticipants]
    const result = await chat.removeParticipants(participantIdsArray)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Promotes participants in a group chat to admin
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated participants list
 * @throws {Error} If chat is not a group
 */
const promoteParticipants = async (req, res) => {
  /*
    #swagger.summary = 'Назначить участников администраторами'
    #swagger.description = '<p>Выдаёт права администратора группы указанным участникам.</p><p><b>Когда использовать:</b> чтобы передать модерацию другим людям или дать боту-помощнику права менять настройки группы.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права администратора группы; без них права не будут выданы (в зависимости от версии WhatsApp Web возможна ошибка 500 с текстом исключения).</li><li>Назначать можно только текущих участников: id, которых нет в группе, молча пропускаются, а ответ всё равно <code>{status: 200}</code>. Результат проверяйте по флагу <code>isAdmin</code> в /groupChat/getClassInfo.</li><li>Принимаются id вида <code>...@c.us</code> и <code>...@lid</code>.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: {status: 200}}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'participantIds'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              participantIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Список id участников группы, которых нужно сделать администраторами (...@c.us или ...@lid). Можно передать одну строку. Устаревшее имя поля contactIds тоже принимается.',
                example: ['79997654321@c.us']
              }
            }
          },
          examples: {
            one: { summary: 'Назначить одного администратора', value: { chatId: '120363012345678901@g.us', participantIds: ['79997654321@c.us'] } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Запрос отправлен. status всегда 200 — это константа whatsapp-web.js, а не подтверждение сервера WhatsApp.',
      content: {
        'application/json': {
          example: { success: true, result: { status: 200 } }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, contactIds, participantIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    // support old property name
    const addParticipants = participantIds || contactIds
    const participantIdsArray = Array.isArray(addParticipants) ? addParticipants : [addParticipants]
    const result = await chat.promoteParticipants(participantIdsArray)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Demotes admin participants in a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated participants list
 * @throws {Error} If chat is not a group
 */
const demoteParticipants = async (req, res) => {
  /*
    #swagger.summary = 'Снять права администратора с участников'
    #swagger.description = '<p>Делает указанных администраторов обычными участниками группы (участники остаются в группе).</p><p><b>Когда использовать:</b> отзыв прав модерации.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права администратора группы; без них права не будут сняты (в зависимости от версии WhatsApp Web возможна ошибка 500 с текстом исключения).</li><li>Id, которых нет среди участников группы, молча пропускаются, а ответ всё равно <code>{status: 200}</code>. Результат проверяйте по флагу <code>isAdmin</code> в /groupChat/getClassInfo.</li><li>Принимаются id вида <code>...@c.us</code> и <code>...@lid</code>.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: {status: 200}}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'participantIds'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              participantIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'Список id администраторов, которых нужно сделать обычными участниками (...@c.us или ...@lid). Можно передать одну строку. Устаревшее имя поля contactIds тоже принимается.',
                example: ['79997654321@c.us']
              }
            }
          },
          examples: {
            one: { summary: 'Снять права с одного администратора', value: { chatId: '120363012345678901@g.us', participantIds: ['79997654321@c.us'] } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Запрос отправлен. status всегда 200 — это константа whatsapp-web.js, а не подтверждение сервера WhatsApp.',
      content: {
        'application/json': {
          example: { success: true, result: { status: 200 } }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, contactIds, participantIds } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    // support old property name
    const addParticipants = participantIds || contactIds
    const participantIdsArray = Array.isArray(addParticipants) ? addParticipants : [addParticipants]
    const result = await chat.demoteParticipants(participantIdsArray)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets the invite code for a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and invite code
 * @throws {Error} If chat is not a group
 */
const getInviteCode = async (req, res) => {
  /*
    #swagger.summary = 'Получить код приглашения в группу'
    #swagger.description = '<p>Возвращает текущий код пригласительной ссылки группы. Полная ссылка: <code>https://chat.whatsapp.com/&lt;inviteCode&gt;</code>.</p><p><b>Когда использовать:</b> чтобы разослать ссылку на вступление в группу (например, клиентам, которых нельзя добавить напрямую — код 403 в /groupChat/addParticipants).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Обычно код доступен только администраторам. Если WhatsApp отказал (ошибка сервера WhatsApp), поле <code>inviteCode</code> в ответе <b>отсутствует</b>, хотя <code>success: true</code> — проверяйте наличие поля.</li><li>Код действует, пока его не сбросят через /groupChat/revokeInvite.</li><li>Принять приглашение другим аккаунтом этого API можно через /client/acceptInvite (передаётся только код, без домена).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, inviteCode: "..."}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              }
            }
          },
          examples: {
            group: { summary: 'Группа', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Код приглашения. Если WhatsApp отказал в выдаче кода (например, нет прав администратора), ответ будет {success: true} без поля inviteCode.',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Код получен', value: { success: true, inviteCode: 'H7dKq2XyZ0aBcDeFgHiJkL' } },
            denied: { summary: 'WhatsApp не выдал код', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const inviteCode = await chat.getInviteCode()
    res.json({ success: true, inviteCode })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets the subject of a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated chat object
 * @throws {Error} If chat is not a group
 */
const setSubject = async (req, res) => {
  /*
    #swagger.summary = 'Изменить название группы'
    #swagger.description = '<p>Меняет название (тему, subject) группы. Все участники увидят системное сообщение об изменении.</p><p><b>Когда использовать:</b> переименование группы, например при смене статуса заказа или проекта.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если в группе включено «изменять данные могут только администраторы» (/groupChat/setInfoAdminsOnly), нужны права администратора. При отказе WhatsApp ответ — HTTP 200 с <code>result: false</code>, а не ошибка.</li><li>Пустое или слишком длинное название WhatsApp может отклонить (тоже <code>result: false</code>).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'subject'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              subject: {
                type: 'string',
                description: 'Новое название группы (обычный текст, эмодзи допустимы)',
                example: 'Заказ №1024 — доставка'
              }
            }
          },
          examples: {
            rename: { summary: 'Переименовать группу', value: { chatId: '120363012345678901@g.us', subject: 'Заказ №1024 — доставка' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — название изменено; false — WhatsApp отклонил изменение (обычно нет прав).',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Изменено', value: { success: true, result: true } },
            denied: { summary: 'Нет прав', value: { success: true, result: false } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, subject } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setSubject(subject)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets the description of a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and updated chat object
 * @throws {Error} If chat is not a group
 */
const setDescription = async (req, res) => {
  /*
    #swagger.summary = 'Изменить описание группы'
    #swagger.description = '<p>Устанавливает новое описание группы (текст под названием в карточке группы).</p><p><b>Когда использовать:</b> чтобы закрепить правила, контакты или ссылки в описании группы.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если включено «изменять данные могут только администраторы», нужны права администратора. При отказе WhatsApp ответ — HTTP 200 с <code>result: false</code>, а не ошибка.</li><li>Пустая строка очищает описание (если WhatsApp это принимает — иначе <code>result: false</code>).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'description'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              description: {
                type: 'string',
                description: 'Новое описание группы',
                example: 'Правила: без спама. Поддержка 9:00–18:00 МСК.'
              }
            }
          },
          examples: {
            set: { summary: 'Задать описание', value: { chatId: '120363012345678901@g.us', description: 'Правила: без спама. Поддержка 9:00–18:00 МСК.' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — описание изменено; false — WhatsApp отклонил изменение (обычно нет прав).',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Изменено', value: { success: true, result: true } },
            denied: { summary: 'Нет прав', value: { success: true, result: false } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, description } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setDescription(description)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Leaves a group chat
 *
 * @async
 * @function
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Returns a JSON object with success flag and outcome of leaving the chat
 * @throws {Error} If chat is not a group
 */
const leave = async (req, res) => {
  /*
    #swagger.summary = 'Выйти из группы'
    #swagger.description = '<p>Аккаунт сессии покидает группу.</p><p><b>Когда использовать:</b> чтобы бот вышел из группы, в которую его добавили по ошибке, или после завершения работы с группой.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Действие необратимо: вернуться можно только по приглашению или если вас снова добавит администратор.</li><li>Если аккаунт сессии — администратор группы, после выхода управление группой через этот аккаунт будет потеряно.</li><li>Чат группы после выхода может остаться в списке чатов; удалить его можно через /chat/delete.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true}</code> — метод whatsapp-web.js ничего не возвращает, поэтому поля <code>result</code> в ответе нет.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              }
            }
          },
          examples: {
            group: { summary: 'Покинуть группу', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Запрос на выход отправлен. Поле result отсутствует (значение undefined не сериализуется в JSON).',
      content: {
        'application/json': {
          example: { success: true }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.leave()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Revokes the invite link for a group chat based on the provided chatId
 *
 * @async
 * @function revokeInvite
 * @param {object} req - The request object
 * @param {object} res - The response object
 * @param {string} req.body.chatId - The chatId of the group chat to revoke the invite for
 * @param {string} req.params.sessionId - The sessionId of the client making the request
 * @throws {Error} The chat is not a group.
 * @returns {Promise<void>} - A JSON response with success true and the new invite code for the group chat
 */
const revokeInvite = async (req, res) => {
  /*
    #swagger.summary = 'Сбросить ссылку-приглашение (новый код)'
    #swagger.description = '<p>Аннулирует текущий код пригласительной ссылки группы и создаёт новый. Возвращает новый код.</p><p><b>Когда использовать:</b> если ссылка утекла или по ней вступают посторонние.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Необратимо: все ранее разосланные ссылки <code>https://chat.whatsapp.com/&lt;старый код&gt;</code> перестают работать.</li><li>Обычно требуются права администратора; при отказе WhatsApp запрос завершится ошибкой 500 с текстом исключения.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: "&lt;новый код&gt;"}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              }
            }
          },
          examples: {
            group: { summary: 'Сбросить ссылку', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Новый код приглашения (строка). Полная ссылка: https://chat.whatsapp.com/ + значение result.',
      content: {
        'application/json': {
          example: { success: true, result: 'K9mPq4RsTuVwXyZ1aB2cD3' }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях (например, WhatsApp отказал в сбросе кода) — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.revokeInvite()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets admins-only status of a group chat's info or messages.
 *
 * @async
 * @function setInfoAdminsOnly
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {string} req.params.sessionId - ID of the user's session.
 * @param {Object} req.body - Request body.
 * @param {string} req.body.chatId - ID of the group chat.
 * @param {boolean} req.body.adminsOnly - Desired admins-only status.
 * @returns {Promise<void>} Promise representing the success or failure of the operation.
 * @throws {Error} If the chat is not a group.
 */
const setInfoAdminsOnly = async (req, res) => {
  /*
    #swagger.summary = 'Разрешить менять данные группы только админам'
    #swagger.description = '<p>Включает или выключает настройку группы «изменять данные группы (название, описание, фото) могут только администраторы».</p><p><b>Когда использовать:</b> чтобы участники не могли переименовывать группу или менять её аватар и описание.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права администратора группы. При отказе WhatsApp ответ — HTTP 200 с <code>result: false</code>, а не ошибка.</li><li>Если <code>adminsOnly</code> не передан, используется <code>true</code> (настройка <b>включается</b>). Чтобы разрешить всем участникам менять данные, передайте <code>false</code> явно.</li><li>Не путать с /groupChat/setMessagesAdminsOnly (кто может отправлять сообщения).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              adminsOnly: {
                type: 'boolean',
                description: 'true — менять данные группы могут только администраторы; false — все участники. Необязательно, по умолчанию true.',
                default: true,
                example: true
              }
            }
          },
          examples: {
            enable: { summary: 'Только администраторы', value: { chatId: '120363012345678901@g.us', adminsOnly: true } },
            disable: { summary: 'Все участники', value: { chatId: '120363012345678901@g.us', adminsOnly: false } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — настройка применена; false — WhatsApp отклонил изменение (обычно нет прав администратора).',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Применено', value: { success: true, result: true } },
            denied: { summary: 'Нет прав', value: { success: true, result: false } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, adminsOnly = true } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setInfoAdminsOnly(adminsOnly)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sets admins-only status of a group chat's messages.
 *
 * @async
 * @function setMessagesAdminsOnly
 * @param {Object} req - Request object.
 * @param {Object} res - Response object.
 * @param {string} req.params.sessionId - ID of the user's session.
 * @param {Object} req.body - Request body.
 * @param {string} req.body.chatId - ID of the group chat.
 * @param {boolean} req.body.adminsOnly - Desired admins-only status.
 * @returns {Promise<void>} Promise representing the success or failure of the operation.
 * @throws {Error} If the chat is not a group.
 */
const setMessagesAdminsOnly = async (req, res) => {
  /*
    #swagger.summary = 'Разрешить писать в группу только админам'
    #swagger.description = '<p>Включает или выключает настройку группы «отправлять сообщения могут только администраторы». Во включённом состоянии группа работает как канал объявлений.</p><p><b>Когда использовать:</b> группы-рассылки и объявления, временное «закрытие» чата для модерации.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нужны права администратора группы. При отказе WhatsApp ответ — HTTP 200 с <code>result: false</code>, а не ошибка.</li><li>Если <code>adminsOnly</code> не передан, используется <code>true</code> (писать смогут <b>только администраторы</b>). Чтобы снова разрешить всем, передайте <code>false</code> явно.</li><li>Текущее состояние видно в поле <code>isReadOnly</code> / <code>groupMetadata.announce</code> ответа /groupChat/getClassInfo.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              adminsOnly: {
                type: 'boolean',
                description: 'true — писать могут только администраторы; false — все участники. Необязательно, по умолчанию true.',
                default: true,
                example: true
              }
            }
          },
          examples: {
            enable: { summary: 'Только администраторы', value: { chatId: '120363012345678901@g.us', adminsOnly: true } },
            disable: { summary: 'Все участники', value: { chatId: '120363012345678901@g.us', adminsOnly: false } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — настройка применена; false — WhatsApp отклонил изменение (обычно нет прав администратора).',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Применено', value: { success: true, result: true } },
            denied: { summary: 'Нет прав', value: { success: true, result: false } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, adminsOnly = true } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.setMessagesAdminsOnly(adminsOnly)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set the group Picture
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.pictureMimetype - The mimetype of the image.
 * @param {Object} req.body.pictureData - The new group picture in base64 format.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const setPicture = async (req, res) => {
  /*
    #swagger.summary = 'Установить аватар группы'
    #swagger.description = '<p>Устанавливает фото (аватар) группы из картинки в base64. Изображение обрезается и масштабируется на стороне WhatsApp Web (JPEG 640x640 и миниатюра 96x96).</p><p><b>Когда использовать:</b> брендирование групп, создаваемых автоматически.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Имя поля — <code>pictureMimeType</code> (с заглавной T); при другом написании MIME-тип не будет передан.</li><li><code>pictureData</code> — чистый base64 <b>без</b> префикса <code>data:image/...;base64,</code>.</li><li>Передавайте изображение (image/jpeg, image/png); другие типы не имеют смысла для аватара.</li><li>Если менять данные группы могут только администраторы, а вы не администратор, ответ — HTTP 200 с <code>result: false</code>.</li><li>Размер тела запроса ограничен <code>MAX_ATTACHMENT_SIZE</code> + 1 МБ (иначе 413).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code>.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['chatId', 'pictureMimeType', 'pictureData'],
            properties: {
              chatId: {
                type: 'string',
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              pictureMimeType: {
                type: 'string',
                description: 'MIME-тип изображения, например image/jpeg или image/png',
                example: 'image/png'
              },
              pictureData: {
                type: 'string',
                description: 'Изображение в base64 без префикса data:...;base64,',
                example: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
              }
            }
          },
          examples: {
            png: { summary: 'PNG в base64', value: { chatId: '120363012345678901@g.us', pictureMimeType: 'image/png', pictureData: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — аватар установлен; false — установить нельзя (нет прав) или WhatsApp отклонил запрос.',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Установлено', value: { success: true, result: true } },
            denied: { summary: 'Нет прав / отклонено', value: { success: true, result: false } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях (например, данные не являются корректным изображением) — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { pictureMimeType, pictureData, chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const media = new MessageMedia(pictureMimeType, pictureData)
    const result = await chat.setPicture(media)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Delete the group Picture
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const deletePicture = async (req, res) => {
  /*
    #swagger.summary = 'Удалить аватар группы'
    #swagger.description = '<p>Удаляет текущее фото (аватар) группы.</p><p><b>Когда использовать:</b> чтобы сбросить аватар группы к стандартному.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если удалить аватар нельзя (нет прав), ответ — HTTP 200 <b>без</b> поля <code>result</code> (метод вернул undefined); при отказе сервера WhatsApp — <code>result: false</code>. Считайте успехом только <code>result: true</code>.</li><li>Если у группы нет аватара / данные аватара ещё не загружены, возможна ошибка 500 с текстом исключения из WhatsApp Web.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: true|false}</code> или <code>{success: true}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              }
            }
          },
          examples: {
            group: { summary: 'Удалить аватар', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'result: true — аватар удалён; false — WhatsApp отклонил запрос; поле отсутствует — удаление недоступно этому аккаунту.',
      content: {
        'application/json': {
          examples: {
            ok: { summary: 'Удалено', value: { success: true, result: true } },
            rejected: { summary: 'Отклонено сервером WhatsApp', value: { success: true, result: false } },
            notAllowed: { summary: 'Удаление недоступно', value: { success: true } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.deletePicture()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get an array of membership requests
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const getGroupMembershipRequests = async (req, res) => {
  /*
    #swagger.summary = 'Получить заявки на вступление в группу'
    #swagger.description = '<p>Возвращает список ожидающих заявок на вступление в группу (когда в группе включено одобрение новых участников администратором).</p><p><b>Когда использовать:</b> перед /groupChat/approveGroupMembershipRequests или /groupChat/rejectGroupMembershipRequests, чтобы решить, кого принять; для модерации по своим правилам (например, только номера из CRM).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Заявки видны администраторам группы; если одобрение участников выключено, список обычно пуст.</li><li>id заявителя может быть вида <code>...@lid</code> (скрытый номер), а не <code>...@c.us</code>.</li><li><code>requestMethod</code>: NonAdminAdd (участник пытался добавить человека), InviteLink (вступление по ссылке), LinkedGroupJoin (вступление из сообщества).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: [{id, addedBy, parentGroupId, requestMethod, t}]}</code>; <code>t</code> — время заявки (Unix, секунды).</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              }
            }
          },
          examples: {
            group: { summary: 'Группа', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив заявок (пустой, если заявок нет). Поля: id — wid заявителя, addedBy — кто создал заявку, parentGroupId — wid сообщества или null, requestMethod — способ, t — время заявки.',
      content: {
        'application/json': {
          example: {
            success: true,
            result: [
              {
                id: { server: 'c.us', user: '79997654321', _serialized: '79997654321@c.us' },
                addedBy: { server: 'c.us', user: '79997654321', _serialized: '79997654321@c.us' },
                parentGroupId: null,
                requestMethod: 'InviteLink',
                t: 1730000000
              }
            ]
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.getGroupMembershipRequests()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Approve membership requests if any
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const approveGroupMembershipRequests = async (req, res) => {
  /*
    #swagger.summary = 'Одобрить заявки на вступление'
    #swagger.description = '<p>Одобряет заявки на вступление в группу: либо указанных заявителей, либо <b>все</b> ожидающие заявки, если <code>options.requesterIds</code> не передан или пуст.</p><p><b>Когда использовать:</b> автоматическая модерация вступления (например, принимать только номера из вашей базы — сначала /groupChat/getGroupMembershipRequests, затем одобрение выбранных id).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><b>Осторожно:</b> без <code>requesterIds</code> одобряются все текущие заявки сразу.</li><li>Нужны права администратора группы.</li><li>Пустой массив <code>result</code> означает «нет заявок» <b>или</b> что во время операции произошла ошибка (whatsapp-web.js перехватывает её и возвращает []). Проверяйте результат повторным запросом заявок.</li><li>Ошибка по конкретному заявителю возвращается в элементе массива: <code>error</code> (код) и <code>message</code> (ParticipantNotFoundError 400, ParticipantNotAuthorizedError 401, ParticipantForbiddenError 403, ParticipantRequestNotFoundError 404, ParticipantTemporarilyBlockedError 408, ParticipantConflictError 409, ParticipantParentLinkedGroupsResourceConstraintError 412, ParticipantResourceConstraintError 500), либо <code>message: "ServerStatusCodeError"</code> без кода.</li><li>Между заявителями делается пауза <code>options.sleep</code> (по умолчанию случайная 250–500 мс).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: [{requesterId, message, error?}]}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              options: {
                type: 'object',
                description: 'Необязательно, по умолчанию {}. requesterIds — id заявителя (строка) или массив id (...@c.us или ...@lid из getGroupMembershipRequests); если не задан или пуст — обрабатываются ВСЕ заявки группы. sleep — пауза между заявителями в мс: число или [min, max] (по умолчанию [250, 500]).',
                properties: {
                  requesterIds: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], example: ['79997654321@c.us'] },
                  sleep: { oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }], example: [250, 500] }
                }
              }
            }
          },
          examples: {
            selected: { summary: 'Одобрить выбранных', value: { chatId: '120363012345678901@g.us', options: { requesterIds: ['79997654321@c.us'] } } },
            all: { summary: 'Одобрить все заявки', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив результатов по заявителям. Успех: message = Approved successfully (без поля error). Ошибка: error — код, message — название ошибки. Пустой массив — заявок нет или операция завершилась ошибкой.',
      content: {
        'application/json': {
          examples: {
            mixed: {
              summary: 'Результаты по заявителям',
              value: {
                success: true,
                result: [
                  { requesterId: '79997654321@c.us', message: 'Approved successfully' },
                  { requesterId: '79990000000@c.us', error: 404, message: 'ParticipantRequestNotFoundError' }
                ]
              }
            },
            empty: { summary: 'Заявок нет', value: { success: true, result: [] } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, options = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.approveGroupMembershipRequests(options)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Reject membership requests if any
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.chatId - ID of the group chat.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the group picture, an error will be thrown.
 */
const rejectGroupMembershipRequests = async (req, res) => {
  /*
    #swagger.summary = 'Отклонить заявки на вступление'
    #swagger.description = '<p>Отклоняет заявки на вступление в группу: либо указанных заявителей, либо <b>все</b> ожидающие заявки, если <code>options.requesterIds</code> не передан или пуст.</p><p><b>Когда использовать:</b> автоматическая модерация — отклонять заявки, не прошедшие вашу проверку (сначала /groupChat/getGroupMembershipRequests).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><b>Осторожно:</b> без <code>requesterIds</code> отклоняются все текущие заявки сразу.</li><li>Нужны права администратора группы.</li><li>Пустой массив <code>result</code> означает «нет заявок» <b>или</b> что во время операции произошла ошибка (whatsapp-web.js перехватывает её и возвращает []).</li><li>Ошибка по конкретному заявителю возвращается в элементе массива: <code>error</code> (код) и <code>message</code> (ParticipantNotFoundError 400, ParticipantNotAuthorizedError 401, ParticipantForbiddenError 403, ParticipantRequestNotFoundError 404, ParticipantTemporarilyBlockedError 408, ParticipantConflictError 409, ParticipantParentLinkedGroupsResourceConstraintError 412, ParticipantResourceConstraintError 500), либо <code>message: "ServerStatusCodeError"</code> без кода.</li><li>Между заявителями делается пауза <code>options.sleep</code> (по умолчанию случайная 250–500 мс).</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, result: [{requesterId, message, error?}]}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              options: {
                type: 'object',
                description: 'Необязательно, по умолчанию {}. requesterIds — id заявителя (строка) или массив id (...@c.us или ...@lid из getGroupMembershipRequests); если не задан или пуст — обрабатываются ВСЕ заявки группы. sleep — пауза между заявителями в мс: число или [min, max] (по умолчанию [250, 500]).',
                properties: {
                  requesterIds: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], example: ['79997654321@c.us'] },
                  sleep: { oneOf: [{ type: 'number' }, { type: 'array', items: { type: 'number' } }], example: [250, 500] }
                }
              }
            }
          },
          examples: {
            selected: { summary: 'Отклонить выбранных', value: { chatId: '120363012345678901@g.us', options: { requesterIds: ['79997654321@c.us'] } } },
            all: { summary: 'Отклонить все заявки', value: { chatId: '120363012345678901@g.us' } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Массив результатов по заявителям. Успех: message = Rejected successfully (без поля error). Ошибка: error — код, message — название ошибки. Пустой массив — заявок нет или операция завершилась ошибкой.',
      content: {
        'application/json': {
          examples: {
            mixed: {
              summary: 'Результаты по заявителям',
              value: {
                success: true,
                result: [
                  { requesterId: '79997654321@c.us', message: 'Rejected successfully' },
                  { requesterId: '79990000000@c.us', error: 404, message: 'ParticipantRequestNotFoundError' }
                ]
              }
            },
            empty: { summary: 'Заявок нет', value: { success: true, result: [] } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «The chat is not a group» — chatId указывает не на группу (например, на личный чат ...@c.us); «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа с таким chatId не найдена у этого аккаунта либо id имеет неверный формат; в остальных случаях — текст исключения whatsapp-web.js / Puppeteer.",
      content: {
        'application/json': {
          examples: {
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, options = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
    const result = await chat.rejectGroupMembershipRequests(options)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Executes a method on the group associated with the given sessionId.
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
    #swagger.summary = 'Вызвать произвольный метод объекта группы'
    #swagger.description = '<p>Вызывает метод объекта <code>GroupChat</code> whatsapp-web.js по имени (<code>chat[method](options)</code>) и возвращает его результат в поле <code>data</code>. Доступны методы GroupChat и унаследованные от Chat: например <code>getLabels</code>, <code>sendMessage</code>, <code>fetchMessages</code>, <code>getInviteCode</code>, <code>setSubject</code>, <code>sendSeen</code>.</p><p><b>Когда использовать:</b> только если нужного действия нет среди готовых эндпоинтов API.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>В метод передаётся <b>не более одного</b> аргумента — значение <code>options</code>. Методы, которым нужны два и более аргументов, вызвать полноценно нельзя.</li><li>Если <code>options</code> ложное значение (<code>false</code>, <code>0</code>, пустая строка, <code>null</code>) или не передан, метод вызывается <b>без аргументов</b>. Например, <code>setMessagesAdminsOnly</code> с <code>options: false</code> выполнится со значением по умолчанию <code>true</code>.</li><li>Если у объекта нет метода с таким именем, возвращается 500 «Method is not implemented». Имя чувствительно к регистру.</li><li>Результат сериализуется в JSON как есть: объекты whatsapp-web.js могут быть большими, значение undefined превращается в отсутствие поля <code>data</code>.</li><li><code>chatId</code> должен быть группой <code>...@g.us</code>, иначе 500 «The chat is not a group».</li></ul><p><b>Ответ:</b> <code>{success: true, data: &lt;результат метода&gt;}</code>.</p>'
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
                description: 'id группы в формате ...@g.us',
                example: '120363012345678901@g.us'
              },
              method: {
                type: 'string',
                description: 'Имя метода объекта GroupChat / Chat из whatsapp-web.js (с учётом регистра)',
                example: 'getLabels'
              },
              options: {
                anyOf: [
                  { type: 'object' },
                  { type: 'string' },
                  { type: 'number' },
                  { type: 'boolean' },
                  { type: 'array' }
                ],
                description: 'Необязательно. Единственный аргумент, передаваемый в метод. Ложное значение или отсутствие поля — метод вызывается без аргументов.'
              }
            }
          },
          examples: {
            getLabels: { summary: 'Метки группы (без аргументов)', value: { chatId: '120363012345678901@g.us', method: 'getLabels' } },
            sendMessage: { summary: 'Отправить текст в группу', value: { chatId: '120363012345678901@g.us', method: 'sendMessage', options: 'Всем привет!' } },
            fetchMessages: { summary: 'Последние 10 сообщений', value: { chatId: '120363012345678901@g.us', method: 'fetchMessages', options: { limit: 10 } } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Результат вызванного метода в поле data (тип зависит от метода).',
      content: {
        'application/json': {
          examples: {
            getLabels: { summary: 'getLabels', value: { success: true, data: [{ id: '1', name: 'Новый клиент', hexColor: '#ff9485' }] } },
            getInviteCode: { summary: 'getInviteCode', value: { success: true, data: 'H7dKq2XyZ0aBcDeFgHiJkL' } }
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Типичные значения error: «Method is not implemented» — у объекта группы нет метода с таким именем; «The chat is not a group» — chatId указывает не на группу; «Cannot read properties of undefined (reading 'isGroup')» или «Evaluation failed: ...» — группа не найдена либо id имеет неверный формат; иначе — исключение, брошенное самим вызванным методом.",
      content: {
        'application/json': {
          examples: {
            noMethod: { summary: 'Метод не существует', value: { success: false, error: 'Method is not implemented' } },
            notGroup: { summary: 'chatId не является группой', value: { success: false, error: 'The chat is not a group' } },
            notFound: { summary: 'Группа не найдена', value: { success: false, error: "Cannot read properties of undefined (reading 'isGroup')" } }
          }
        }
      }
    }
  */
  try {
    const { chatId, method, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const chat = await client.getChatById(chatId)
    if (!chat.isGroup) { throw new Error('The chat is not a group') }
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
  addParticipants,
  demoteParticipants,
  getInviteCode,
  leave,
  promoteParticipants,
  removeParticipants,
  revokeInvite,
  setDescription,
  setInfoAdminsOnly,
  setMessagesAdminsOnly,
  setSubject,
  setPicture,
  deletePicture,
  getGroupMembershipRequests,
  approveGroupMembershipRequests,
  rejectGroupMembershipRequests,
  runMethod
}
