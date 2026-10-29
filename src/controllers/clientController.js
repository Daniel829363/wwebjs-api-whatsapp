const { MessageMedia, Location, Poll } = require('whatsapp-web.js')
const { sessions } = require('../sessions')
const { sendErrorResponse } = require('../utils')
const { logger } = require('../logger')

/**
 * Send a message to a chat using the WhatsApp API
 *
 * @async
 * @function sendMessage
 * @param {Object} req - The request object containing the request parameters
 * @param {Object} req.body - The request body containing the chatId, content, contentType and options
 * @param {string} req.body.chatId - The chat id where the message will be sent
 * @param {string|Object} req.body.content - The message content to be sent, can be a string or an object containing the MessageMedia data
 * @param {string} req.body.contentType - The type of the message content, must be one of the following: 'string', 'MessageMedia', 'MessageMediaFromURL', 'Location', 'Buttons', or 'List'
 * @param {Object} req.body.options - Additional options to be passed to the WhatsApp API
 * @param {string} req.params.sessionId - The id of the WhatsApp session to be used
 * @param {Object} res - The response object
 * @returns {Object} - The response object containing a success flag and the sent message data
 * @throws {Error} - If there is an error while sending the message
 */
const sendMessage = async (req, res) => {
  /*
    #swagger.summary = 'Отправить сообщение (текст, медиа, геолокация, контакт, опрос)'
    #swagger.description = '<p>Отправляет сообщение в личный чат, группу, канал или статус от имени сессии. Тип содержимого задаётся полем <code>contentType</code>, само содержимое — полем <code>content</code>.</p><p><b>Когда использовать:</b> основной метод отправки. Ответ на конкретное сообщение — через <code>options.quotedMessageId</code> (или <code>/message/reply</code>), упоминания — через <code>options.mentions</code>.</p><p><b>Варианты contentType:</b></p><ul><li><code>string</code> — <code>content</code>: текст. Можно приложить медиа через <code>options.media</code> = <code>{mimetype, data, filename?, filesize?}</code>, тогда текст станет подписью.</li><li><code>MessageMedia</code> — <code>content</code>: <code>{mimetype, data, filename?, filesize?}</code>, <code>data</code> — base64 без префикса <code>data:...;base64,</code>.</li><li><code>MessageMediaFromURL</code> — <code>content</code>: URL файла (строка). Файл скачивает сервер API, поэтому URL должен быть доступен с сервера. Доп. настройки — <code>mediaFromURLOptions</code>.</li><li><code>Location</code> — <code>content</code>: <code>{latitude, longitude, description?}</code>.</li><li><code>Contact</code> — <code>content</code>: <code>{contactId}</code> (карточка контакта; <code>@c.us</code> добавляется автоматически).</li><li><code>Poll</code> — <code>content</code>: <code>{pollName, pollOptions: [..], options?: {allowMultipleAnswers}}</code>.</li></ul><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Сервер по умолчанию ждёт фактической отправки (<code>waitUntilMsgSent: true</code>), поэтому ответ может занять несколько секунд.</li><li>Размер JSON-тела ограничен <code>MAX_ATTACHMENT_SIZE</code> + 1 МБ (иначе 413); base64 увеличивает файл примерно на 33%. Крупные файлы отправляйте через <code>MessageMediaFromURL</code>.</li><li>В каналы (<code>@newsletter</code>) можно отправлять только текст, изображение, стикер, gif, видео, голосовое и опрос; в статус (<code>status@broadcast</code>) — текст, изображение, gif, аудио и видео. Неподдерживаемый тип (документ, цитата, геолокация, контакт, view once и т.п.) не отправляется: ответ 200 с <code>message: null</code>.</li><li>Для <code>Location</code> поле <code>description</code> в установленной версии whatsapp-web.js игнорируется (подпись к точке не отображается) — передаются только координаты.</li><li>Для <code>Contact</code> контакт должен существовать в WhatsApp; отсутствие <code>content.contactId</code> даёт 500.</li><li>Упоминание: id в <code>options.mentions</code> и текст <code>@79991234567</code> в самом сообщении.</li><li>Массовая рассылка незнакомым номерам ведёт к блокировке номера WhatsApp — делайте паузы.</li></ul><p><b>Ответ:</b> <code>message</code> — объект отправленного сообщения whatsapp-web.js (id, ack, body, type, timestamp, from, to и др., а также сырое поле <code>_data</code>). <code>message.id.id</code> — короткий id для методов <code>/message/...</code>, <code>message.id._serialized</code> — для <code>quotedMessageId</code>. Если сообщение не удалось создать, поле <code>message</code> может отсутствовать или быть <code>null</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId",
              "contentType",
              "content"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "Получатель: 79991234567@c.us (личный), 120363012345678901@g.us (группа), ...@newsletter (канал), status@broadcast (статус)",
                "example": "79991234567@c.us"
              },
              "contentType": {
                "type": "string",
                "enum": [
                  "string",
                  "MessageMedia",
                  "MessageMediaFromURL",
                  "Location",
                  "Contact",
                  "Poll"
                ],
                "description": "Тип содержимого. Любое другое значение — ответ 400 invalid contentType",
                "example": "string"
              },
              "content": {
                "description": "Содержимое: строка (string — текст, MessageMediaFromURL — URL) или объект (MessageMedia: {mimetype, data, filename?, filesize?}; Location: {latitude, longitude, description?}; Contact: {contactId}; Poll: {pollName, pollOptions, options?})",
                "oneOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "object"
                  }
                ],
                "example": "Привет!"
              },
              "options": {
                "type": "object",
                "description": "Необязательные параметры отправки whatsapp-web.js (MessageSendOptions). По умолчанию {}; сервер добавляет waitUntilMsgSent: true",
                "properties": {
                  "caption": {
                    "type": "string",
                    "description": "Подпись к изображению/видео/документу (для MessageMedia и MessageMediaFromURL)",
                    "example": "Ваш счёт"
                  },
                  "quotedMessageId": {
                    "type": "string",
                    "description": "Сериализованный id сообщения, на которое отвечаем (message.id._serialized), например false_79991234567@c.us_3EB0A1B2C3D4E5F60718",
                    "example": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                  },
                  "ignoreQuoteErrors": {
                    "type": "boolean",
                    "description": "Если цитату получить не удалось — отправить без цитаты (по умолчанию true)",
                    "example": true
                  },
                  "mentions": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "id упоминаемых пользователей (...@c.us). В тексте должно быть @<номер>",
                    "example": [
                      "79991234567@c.us"
                    ]
                  },
                  "groupMentions": {
                    "type": "array",
                    "items": {
                      "type": "object"
                    },
                    "description": "Упоминания групп: [{subject: \"Название\", id: \"...@g.us\"}]",
                    "example": [
                      {
                        "subject": "Команда проекта",
                        "id": "120363012345678901@g.us"
                      }
                    ]
                  },
                  "linkPreview": {
                    "type": "boolean",
                    "description": "Показывать превью ссылок (по умолчанию true)",
                    "example": true
                  },
                  "sendAudioAsVoice": {
                    "type": "boolean",
                    "description": "Отправить аудио как голосовое сообщение (лучше всего audio/ogg; codecs=opus)",
                    "example": false
                  },
                  "sendVideoAsGif": {
                    "type": "boolean",
                    "description": "Отправить видео как GIF",
                    "example": false
                  },
                  "sendMediaAsSticker": {
                    "type": "boolean",
                    "description": "Отправить изображение/видео как стикер (конвертируется в webp)",
                    "example": false
                  },
                  "stickerName": {
                    "type": "string",
                    "description": "Название стикера (при sendMediaAsSticker)",
                    "example": "My pack"
                  },
                  "stickerAuthor": {
                    "type": "string",
                    "description": "Автор стикера (при sendMediaAsSticker)",
                    "example": "WWebJS API"
                  },
                  "stickerCategories": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Эмодзи-категории стикера (при sendMediaAsSticker)",
                    "example": [
                      "😀"
                    ]
                  },
                  "sendMediaAsDocument": {
                    "type": "boolean",
                    "description": "Отправить медиа как документ (без сжатия)",
                    "example": false
                  },
                  "sendMediaAsHd": {
                    "type": "boolean",
                    "description": "Отправить изображение в HD-качестве",
                    "example": false
                  },
                  "isViewOnce": {
                    "type": "boolean",
                    "description": "Фото/видео «на один просмотр»",
                    "example": false
                  },
                  "parseVCards": {
                    "type": "boolean",
                    "description": "Автоматически распознавать vCard в тексте и отправлять как контакт (по умолчанию true)",
                    "example": true
                  },
                  "sendSeen": {
                    "type": "boolean",
                    "description": "Пометить чат прочитанным после отправки (по умолчанию true)",
                    "example": true
                  },
                  "waitUntilMsgSent": {
                    "type": "boolean",
                    "description": "Ждать результата отправки. В этом API по умолчанию true",
                    "example": true
                  },
                  "media": {
                    "type": "object",
                    "description": "Только для contentType string: медиа {mimetype, data (base64), filename?, filesize?}; текст content станет подписью. Без mimetype или data — 400 invalid media options",
                    "example": {
                      "mimetype": "image/png",
                      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                      "filename": "pixel.png"
                    }
                  },
                  "invokedBotWid": {
                    "type": "string",
                    "description": "id бота при упоминании бота (например Meta AI)"
                  },
                  "extra": {
                    "type": "object",
                    "description": "Дополнительные внутренние опции whatsapp-web.js"
                  }
                }
              },
              "mediaFromURLOptions": {
                "type": "object",
                "description": "Только для MessageMediaFromURL: опции MessageMedia.fromUrl. По умолчанию {} + unsafeMime: true",
                "properties": {
                  "unsafeMime": {
                    "type": "boolean",
                    "description": "Разрешить скачивание, даже если MIME-тип нельзя определить по URL (по умолчанию true). При false и URL без расширения — 500 Unable to determine MIME type using URL...",
                    "example": true
                  },
                  "filename": {
                    "type": "string",
                    "description": "Имя файла для получателя (по умолчанию — из Content-Disposition или из пути URL)",
                    "example": "invoice.pdf"
                  },
                  "reqOptions": {
                    "type": "object",
                    "description": "Опции HTTP-запроса fetch при скачивании (например headers)",
                    "example": {
                      "headers": {
                        "Authorization": "Bearer <token>"
                      }
                    }
                  }
                }
              }
            }
          },
          "examples": {
            "string": {
              "summary": "Текст",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "string",
                "content": "Hello World!"
              }
            },
            "reply": {
              "summary": "Текст с ответом на сообщение",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "string",
                "content": "Да, всё верно",
                "options": {
                  "quotedMessageId": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                }
              }
            },
            "mention": {
              "summary": "Упоминание участника в группе",
              "value": {
                "chatId": "120363012345678901@g.us",
                "contentType": "string",
                "content": "@79991234567 посмотри, пожалуйста",
                "options": {
                  "mentions": [
                    "79991234567@c.us"
                  ]
                }
              }
            },
            "stringWithMedia": {
              "summary": "Текст + медиа через options.media (текст станет подписью)",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "string",
                "content": "Подпись к картинке",
                "options": {
                  "media": {
                    "mimetype": "image/png",
                    "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                    "filename": "pixel.png"
                  }
                }
              }
            },
            "MessageMedia": {
              "summary": "Изображение base64 с подписью",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "MessageMedia",
                "content": {
                  "mimetype": "image/jpeg",
                  "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                  "filename": "image.jpg"
                },
                "options": {
                  "caption": "Фото товара"
                }
              }
            },
            "document": {
              "summary": "PDF как документ",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "MessageMedia",
                "content": {
                  "mimetype": "application/pdf",
                  "data": "JVBERi0xLjQKJcfsj6IKNSAwIG9iago8PC9MZW5ndGggNiAwIFI+PgpzdHJlYW0K",
                  "filename": "invoice.pdf"
                },
                "options": {
                  "sendMediaAsDocument": true,
                  "caption": "Счёт №42"
                }
              }
            },
            "voice": {
              "summary": "Голосовое сообщение по URL",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "MessageMediaFromURL",
                "content": "https://example.com/audio/hello.ogg",
                "options": {
                  "sendAudioAsVoice": true
                }
              }
            },
            "MessageMediaFromURL": {
              "summary": "Файл по ссылке",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "MessageMediaFromURL",
                "content": "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=Example",
                "mediaFromURLOptions": {
                  "filename": "qr.png"
                },
                "options": {
                  "caption": "Ваш QR-код"
                }
              }
            },
            "sticker": {
              "summary": "Стикер из картинки",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "MessageMediaFromURL",
                "content": "https://example.com/images/cat.png",
                "options": {
                  "sendMediaAsSticker": true,
                  "stickerName": "Cats",
                  "stickerAuthor": "WWebJS API"
                }
              }
            },
            "Location": {
              "summary": "Геолокация",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "Location",
                "content": {
                  "latitude": 55.7539,
                  "longitude": 37.6208,
                  "description": "Красная площадь"
                }
              }
            },
            "Contact": {
              "summary": "Карточка контакта",
              "value": {
                "chatId": "79991234567@c.us",
                "contentType": "Contact",
                "content": {
                  "contactId": "79997654321@c.us"
                }
              }
            },
            "Poll": {
              "summary": "Опрос",
              "value": {
                "chatId": "120363012345678901@g.us",
                "contentType": "Poll",
                "content": {
                  "pollName": "Cats or Dogs?",
                  "pollOptions": [
                    "Cats",
                    "Dogs"
                  ],
                  "options": {
                    "allowMultipleAnswers": true
                  }
                }
              }
            },
            "channel": {
              "summary": "Публикация в канал",
              "value": {
                "chatId": "120363098765432101@newsletter",
                "contentType": "string",
                "content": "Новая акция уже на сайте!"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Сообщение отправлено. message — объект Message whatsapp-web.js (в примере сокращён; реальный объект содержит также сырое поле _data). message: null — тип содержимого не поддерживается для канала или статуса.",
      "content": {
        "application/json": {
          "examples": {
            "sent": {
              "summary": "Сообщение отправлено",
              "value": {
                "success": true,
                "message": {
                  "id": {
                    "fromMe": true,
                    "remote": "79991234567@c.us",
                    "id": "3EB0C767D82E4B5A1F2C",
                    "_serialized": "true_79991234567@c.us_3EB0C767D82E4B5A1F2C"
                  },
                  "ack": 1,
                  "hasMedia": false,
                  "body": "Привет!",
                  "type": "chat",
                  "timestamp": 1730000000,
                  "from": "79990000000@c.us",
                  "to": "79991234567@c.us",
                  "deviceType": "web",
                  "isForwarded": false,
                  "forwardingScore": 0,
                  "isStatus": false,
                  "isStarred": false,
                  "fromMe": true,
                  "hasQuotedMsg": false,
                  "hasReaction": false,
                  "vCards": [],
                  "mentionedIds": [],
                  "groupMentions": [],
                  "isGif": false,
                  "links": []
                }
              }
            },
            "unsupported": {
              "summary": "Тип не поддерживается для канала/статуса",
              "value": {
                "success": true,
                "message": null
              }
            }
          }
        }
      }
    }
    #swagger.responses[400] = {
      "description": "Bad Request. invalid contentType — contentType не входит в список string, MessageMedia, MessageMediaFromURL, Location, Contact, Poll. invalid media options — для contentType string передан options.media без mimetype или data.",
      "content": {
        "application/json": {
          "examples": {
            "invalidContentType": {
              "summary": "Неизвестный contentType",
              "value": {
                "success": false,
                "error": "invalid contentType"
              }
            },
            "invalidMedia": {
              "summary": "options.media без mimetype или data",
              "value": {
                "success": false,
                "error": "invalid media options"
              }
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      "description": "Ошибка внутри whatsapp-web.js / Puppeteer. Например: неверный chatId, недоступный URL файла, некорректный base64, отсутствует content.contactId для Contact, неизвестный MIME при mediaFromURLOptions.unsafeMime = false.",
      "content": {
        "application/json": {
          "examples": {
            "mime": {
              "summary": "Не определён MIME-тип URL (unsafeMime: false)",
              "value": {
                "success": false,
                "error": "Unable to determine MIME type using URL. Set unsafeMime to true to download it anyway."
              }
            },
            "other": {
              "summary": "Прочая ошибка",
              "value": {
                "success": false,
                "error": "Protocol error (Runtime.callFunctionOn): Target closed."
              }
            }
          }
        }
      }
    }
  */

  try {
    const { chatId, content, contentType, options = {}, mediaFromURLOptions = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const sendOptions = { waitUntilMsgSent: true, ...options }

    let messageOut
    switch (contentType) {
      case 'string':
        if (sendOptions?.media) {
          const { mimetype, data, filename = null, filesize = null } = sendOptions.media
          if (!mimetype || !data) {
            return sendErrorResponse(res, 400, 'invalid media options')
          }
          sendOptions.media = new MessageMedia(mimetype, data, filename, filesize)
        }
        messageOut = await client.sendMessage(chatId, content, sendOptions)
        break
      case 'MessageMediaFromURL': {
        const messageMediaFromURL = await MessageMedia.fromUrl(content, { unsafeMime: true, ...mediaFromURLOptions })
        messageOut = await client.sendMessage(chatId, messageMediaFromURL, sendOptions)
        break
      }
      case 'MessageMedia': {
        const messageMedia = new MessageMedia(content.mimetype, content.data, content.filename, content.filesize)
        messageOut = await client.sendMessage(chatId, messageMedia, sendOptions)
        break
      }
      case 'Location': {
        const location = new Location(content.latitude, content.longitude, content.description)
        messageOut = await client.sendMessage(chatId, location, sendOptions)
        break
      }
      case 'Contact': {
        const contactId = content.contactId.endsWith('@c.us') ? content.contactId : `${content.contactId}@c.us`
        const contact = await client.getContactById(contactId)
        messageOut = await client.sendMessage(chatId, contact, sendOptions)
        break
      }
      case 'Poll': {
        const poll = new Poll(content.pollName, content.pollOptions, content.options)
        messageOut = await client.sendMessage(chatId, poll, sendOptions)
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
 * Get session information for a given sessionId
 *
 * @function getClientInfo
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId for which the session info is requested
 * @returns {Object} - Response object with session info
 * @throws Will throw an error if session info cannot be retrieved
 */
const getClassInfo = (req, res) => {
  /*
    #swagger.summary = 'Информация о подключённом аккаунте'
    #swagger.description = '<p>Возвращает сведения о WhatsApp-аккаунте, к которому привязана сессия: имя профиля, собственный id (wid) и платформу телефона.</p><p><b>Когда использовать:</b> узнать, какой номер подключён к сессии (например, после сканирования QR), получить свой id для сравнения с <code>from</code> во входящих сообщениях.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>sessionInfo.pushname</code> — отображаемое имя; <code>sessionInfo.wid</code> / <code>sessionInfo.me</code> — id аккаунта; <code>sessionInfo.platform</code> — платформа телефона (например android, iphone, smba — WhatsApp Business Android, smbi — Business iOS); <code>phone</code> устарело и обычно пустое.</p>'
    #swagger.responses[200] = {
      "description": "Информация об аккаунте (объект ClientInfo whatsapp-web.js).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "sessionInfo": {
              "pushname": "Мой магазин",
              "wid": {
                "server": "c.us",
                "user": "79990000000",
                "_serialized": "79990000000@c.us"
              },
              "me": {
                "server": "c.us",
                "user": "79990000000",
                "_serialized": "79990000000@c.us"
              },
              "platform": "smba"
            }
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const sessionInfo = client.info
    res.json({ success: true, sessionInfo })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Check if a user is registered on WhatsApp
 *
 * @async
 * @function isRegisteredUser
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId in which the user is registered
 * @param {string} req.body.id - The id of the user to check
 * @returns {Object} - Response object with a boolean indicating whether the user is registered
 * @throws Will throw an error if user registration cannot be checked
 */
const isRegisteredUser = async (req, res) => {
  /*
    #swagger.summary = 'Проверить, зарегистрирован ли номер в WhatsApp'
    #swagger.description = '<p>Проверяет, есть ли у номера аккаунт WhatsApp. Возвращает только true/false.</p><p><b>Когда использовать:</b> перед отправкой на новый номер. Если нужен также правильный id для отправки — используйте <code>/client/getNumberId</code> (он возвращает id или null и заменяет этот метод).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>number</code> обязателен и должен быть строкой: только цифры с кодом страны (<code>79991234567</code>) или <code>79991234567@c.us</code>. Отсутствие поля даёт 500.</li><li>Не передавайте <code>+</code>, пробелы, скобки, ведущие 8/0 вместо кода страны — номер будет считаться незарегистрированным.</li><li>Каждый вызов — запрос к серверам WhatsApp; не проверяйте тысячи номеров подряд.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если номер зарегистрирован.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "number"
            ],
            "properties": {
              "number": {
                "type": "string",
                "description": "Номер в международном формате только цифрами (79991234567) или id 79991234567@c.us. Без +, пробелов, скобок и дефисов",
                "example": "79991234567"
              }
            }
          },
          "examples": {
            "digits": {
              "summary": "Номер цифрами",
              "value": {
                "number": "79991234567"
              }
            },
            "id": {
              "summary": "Готовый id",
              "value": {
                "number": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — true/false.",
      "content": {
        "application/json": {
          "examples": {
            "registered": {
              "summary": "Зарегистрирован",
              "value": {
                "success": true,
                "result": true
              }
            },
            "notRegistered": {
              "summary": "Не зарегистрирован",
              "value": {
                "success": true,
                "result": false
              }
            }
          }
        }
      }
    }
  */
  try {
    const { number } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.isRegisteredUser(number)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the registered WhatsApp ID for a number
 *
 * @async
 * @function getNumberId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId in which the user is registered
 * @param {string} req.body.id - The id of the user to check
 * @returns {Object} - Response object with a boolean indicating whether the user is registered
 * @throws Will throw an error if user registration cannot be checked
 */
const getNumberId = async (req, res) => {
  /*
    #swagger.summary = 'Получить WhatsApp-id номера (или null)'
    #swagger.description = '<p>Проверяет номер на серверах WhatsApp и возвращает его настоящий id. Если номер не зарегистрирован в WhatsApp — <code>result: null</code>.</p><p><b>Когда использовать:</b> перед первой отправкой на номер из вашей базы: берите <code>result._serialized</code> и используйте его как <code>chatId</code>. Это надёжнее, чем склеивать <code>номер@c.us</code> вручную (например, для номеров, у которых WhatsApp хранит id в другом формате).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>number</code> обязателен (строка). Суффикс <code>@c.us</code> добавляется автоматически, если его нет.</li><li>Только цифры с кодом страны: <code>79991234567</code>. Не используйте <code>+7 (999) 123-45-67</code> или <code>89991234567</code>.</li><li>Не подходит для групп и каналов.</li></ul><p><b>Ответ:</b> <code>result</code> — объект id <code>{server, user, _serialized}</code> или <code>null</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "number"
            ],
            "properties": {
              "number": {
                "type": "string",
                "description": "Номер в международном формате только цифрами (79991234567) или id 79991234567@c.us. Без +, пробелов, скобок и дефисов",
                "example": "79991234567"
              }
            }
          },
          "examples": {
            "digits": {
              "summary": "Номер цифрами",
              "value": {
                "number": "79991234567"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — id номера или null, если номер не зарегистрирован.",
      "content": {
        "application/json": {
          "examples": {
            "found": {
              "summary": "Номер есть в WhatsApp",
              "value": {
                "success": true,
                "result": {
                  "server": "c.us",
                  "user": "79991234567",
                  "_serialized": "79991234567@c.us"
                }
              }
            },
            "notFound": {
              "summary": "Номера нет в WhatsApp",
              "value": {
                "success": true,
                "result": null
              }
            }
          }
        }
      }
    }
  */
  try {
    const { number } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getNumberId(number)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Create a group with the given name and participants
 *
 * @async
 * @function createGroup
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId in which to create the group
 * @param {string} req.body.name - The name of the group to create
 * @param {Array} req.body.participants - Array of user ids to add to the group
 * @returns {Object} - Response object with information about the created group
 * @throws Will throw an error if group cannot be created
 */
const createGroup = async (req, res) => {
  /*
    #swagger.summary = 'Создать группу'
    #swagger.description = '<p>Создаёт новую группу с указанным названием и участниками. Текущий аккаунт становится создателем (superadmin).</p><p><b>Когда использовать:</b> автоматическое создание групп (проект, заказ, поддержка). Дальше управляйте группой через <code>/groupChat/...</code>, используя <code>response.gid._serialized</code> как <code>chatId</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Поле названия — <code>title</code> (не <code>name</code>).</li><li><code>participants</code> — строка или массив id вида <code>79991234567@c.us</code>. Номера, которых нет в WhatsApp, не добавляются (statusCode 404 в результате).</li><li>Если пользователь запретил добавлять себя в группы, он не будет добавлен (statusCode 403); при <code>options.autoSendInviteV4</code> = true (по умолчанию) ему отправляется личное приглашение (<code>isInviteV4Sent</code>).</li><li>Если создание не удалось, ответ всё равно HTTP 200, а <code>response</code> — строка <code>CreateGroupError: An unknown error occupied while creating a group</code>. Проверяйте тип поля <code>response</code>.</li><li>Частое создание групп и массовое добавление незнакомых номеров может привести к блокировке номера.</li></ul><p><b>Ответ:</b> <code>response.gid</code> — id новой группы; <code>response.participants</code> — результат по каждому участнику: <code>statusCode</code> (200 — добавлен, 403 — только по приглашению, 404 — номер не в WhatsApp), <code>message</code>, <code>isGroupCreator</code>, <code>isInviteV4Sent</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "title"
            ],
            "properties": {
              "title": {
                "type": "string",
                "description": "Название группы",
                "example": "Команда проекта"
              },
              "participants": {
                "oneOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  }
                ],
                "description": "Участники: один id строкой или массив id (...@c.us). Можно не передавать — группа будет создана только с вами",
                "example": [
                  "79991234567@c.us",
                  "79997654321@c.us"
                ]
              },
              "options": {
                "type": "object",
                "description": "Необязательные настройки группы (по умолчанию {}). Пустой объект = настройки по умолчанию",
                "properties": {
                  "messageTimer": {
                    "type": "number",
                    "description": "Исчезающие сообщения, секунды (0 — выкл., по умолчанию 0). Не действует, если группа создаётся только с вами",
                    "example": 0
                  },
                  "parentGroupId": {
                    "type": "string",
                    "description": "id сообщества (...@g.us), к которому привязать группу",
                    "example": "120363011111111111@g.us"
                  },
                  "autoSendInviteV4": {
                    "type": "boolean",
                    "description": "Отправлять личное приглашение тем, кого нельзя добавить напрямую (по умолчанию true)",
                    "example": true
                  },
                  "comment": {
                    "type": "string",
                    "description": "Текст к такому приглашению (по умолчанию пусто)",
                    "example": "Присоединяйтесь к группе проекта"
                  },
                  "memberAddMode": {
                    "type": "boolean",
                    "description": "true — добавлять участников могут только админы (по умолчанию false)",
                    "example": false
                  },
                  "membershipApprovalMode": {
                    "type": "boolean",
                    "description": "true — вступление только после одобрения админом (по умолчанию false)",
                    "example": false
                  },
                  "isRestrict": {
                    "type": "boolean",
                    "description": "Ограничение на изменение данных группы. Внимание: в установленной версии whatsapp-web.js значение передаётся инвертированным (restrict = !isRestrict) — проверьте результат в группе",
                    "example": true
                  },
                  "announce": {
                    "type": "boolean",
                    "description": "true — писать могут только админы (по умолчанию false). В коде библиотеки читается именно announce, а не isAnnounce из её документации",
                    "example": false
                  }
                }
              }
            }
          },
          "examples": {
            "simple": {
              "summary": "Группа с двумя участниками",
              "value": {
                "title": "Команда проекта",
                "participants": [
                  "79991234567@c.us",
                  "79997654321@c.us"
                ]
              }
            },
            "withOptions": {
              "summary": "Группа «только админы пишут» с одобрением вступления",
              "value": {
                "title": "Объявления",
                "participants": [
                  "79991234567@c.us"
                ],
                "options": {
                  "announce": true,
                  "membershipApprovalMode": true,
                  "comment": "Приглашаем в группу объявлений"
                }
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "response — объект результата или строка с ошибкой создания (HTTP при этом 200).",
      "content": {
        "application/json": {
          "examples": {
            "created": {
              "summary": "Группа создана",
              "value": {
                "success": true,
                "response": {
                  "title": "Команда проекта",
                  "gid": {
                    "server": "g.us",
                    "user": "120363012345678901",
                    "_serialized": "120363012345678901@g.us"
                  },
                  "participants": {
                    "79991234567@c.us": {
                      "statusCode": 200,
                      "message": "The participant was added successfully",
                      "isGroupCreator": false,
                      "isInviteV4Sent": false
                    },
                    "79997654321@c.us": {
                      "statusCode": 403,
                      "message": "The participant can be added by sending private invitation only",
                      "isGroupCreator": false,
                      "isInviteV4Sent": true
                    }
                  }
                }
              }
            },
            "failed": {
              "summary": "Создание не удалось",
              "value": {
                "success": true,
                "response": "CreateGroupError: An unknown error occupied while creating a group"
              }
            }
          }
        }
      }
    }
  */
  try {
    const { title, participants, options = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    let response
    if (Object.keys(options).length) {
      response = await client.createGroup(title, participants, options)
    } else {
      response = await client.createGroup(title, participants)
    }
    res.json({ success: true, response })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set the status of the user in a given session
 *
 * @async
 * @function setStatus
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} req.params.sessionId - The sessionId in which to set the status
 * @param {string} req.body.status - The status to set
 * @returns {Object} - Response object indicating success
 * @throws Will throw an error if status cannot be set
 */
const setStatus = async (req, res) => {
  /*
    #swagger.summary = 'Изменить текст «О себе» (about)'
    #swagger.description = '<p>Меняет текст профиля «Сведения / О себе» текущего аккаунта.</p><p><b>Когда использовать:</b> показать клиентам режим работы или актуальную информацию.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Это не «статус» (stories) — для публикации историй используйте <code>/client/sendMessage</code> с <code>chatId: status@broadcast</code>.</li><li><code>status</code> обязателен; WhatsApp ограничивает длину текста (около 139 символов).</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "status"
            ],
            "properties": {
              "status": {
                "type": "string",
                "description": "Новый текст «О себе»",
                "example": "Работаем ежедневно с 9:00 до 21:00"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Текст обновлён.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { status } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setStatus(status)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the contacts of the current session.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID associated with the client.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A Promise that resolves with the retrieved contacts or rejects with an error.
 */
const getContacts = async (req, res) => {
  /*
    #swagger.summary = 'Список всех контактов'
    #swagger.description = '<p>Возвращает все контакты, известные сессии: из адресной книги телефона, а также пользователей, с которыми была переписка, и участников групп.</p><p><b>Когда использовать:</b> синхронизация адресной книги с CRM, поиск id по имени.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Список может быть очень большим (тысячи записей) и содержать группы, LID-идентификаторы (<code>...@lid</code>) и служебные записи — фильтруйте по <code>isUser</code>, <code>isMyContact</code>, <code>isWAContact</code>.</li><li><code>name</code> есть только у контактов из адресной книги; у остальных — <code>pushname</code> (имя, указанное самим пользователем).</li></ul><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>contacts</code> — массив объектов Contact.</p>'
    #swagger.responses[200] = {
      "description": "Массив контактов (объекты Contact whatsapp-web.js, в примере один элемент).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "contacts": [
              {
                "id": {
                  "server": "c.us",
                  "user": "79991234567",
                  "_serialized": "79991234567@c.us"
                },
                "number": "79991234567",
                "isBusiness": false,
                "isEnterprise": false,
                "name": "Иван Петров",
                "pushname": "Ivan",
                "shortName": "Иван",
                "type": "in",
                "isMe": false,
                "isUser": true,
                "isGroup": false,
                "isWAContact": true,
                "isMyContact": true,
                "isBlocked": false
              }
            ]
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const contacts = await client.getContacts()
    res.json({ success: true, contacts })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieve all chats for the given session ID.
 *
 * @function
 * @async
 *
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {Object} res - The response object.
 *
 * @returns {Promise<void>} A Promise that resolves when the operation is complete.
 *
 * @throws {Error} If the operation fails, an error is thrown.
 */
const getChats = async (req, res) => {
  /*
    #swagger.summary = 'Список всех чатов'
    #swagger.description = '<p>Возвращает все чаты сессии: личные, группы и каналы — с количеством непрочитанных и последним сообщением.</p><p><b>Когда использовать:</b> построить список диалогов, найти id групп. Для фильтрации (только непрочитанные, только с определённого времени) используйте <code>POST /client/getChats</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Ответ может быть большим и медленным при сотнях чатов: каждый чат содержит <code>lastMessage</code>.</li><li>Групповые чаты дополнительно содержат <code>groupMetadata</code> (участники, владелец), каналы — <code>channelMetadata</code>.</li></ul><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>chats</code> — массив объектов Chat / GroupChat / Channel.</p>'
    #swagger.responses[200] = {
      "description": "Массив чатов (личный и групповой в примере; объекты сокращены).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "chats": [
              {
                "id": {
                  "server": "c.us",
                  "user": "79991234567",
                  "_serialized": "79991234567@c.us"
                },
                "name": "Иван Петров",
                "isGroup": false,
                "isReadOnly": false,
                "unreadCount": 2,
                "timestamp": 1730000500,
                "archived": false,
                "pinned": false,
                "isMuted": false,
                "muteExpiration": 0,
                "lastMessage": {
                  "id": {
                    "fromMe": false,
                    "remote": "79991234567@c.us",
                    "id": "3EB0A1B2C3D4E5F60718",
                    "_serialized": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                  },
                  "ack": 3,
                  "hasMedia": false,
                  "body": "Добрый день, заказ получил",
                  "type": "chat",
                  "timestamp": 1730000500,
                  "from": "79991234567@c.us",
                  "to": "79990000000@c.us",
                  "fromMe": false,
                  "hasQuotedMsg": false
                }
              },
              {
                "id": {
                  "server": "g.us",
                  "user": "120363012345678901",
                  "_serialized": "120363012345678901@g.us"
                },
                "name": "Команда проекта",
                "isGroup": true,
                "isReadOnly": false,
                "unreadCount": 0,
                "timestamp": 1730000300,
                "archived": false,
                "pinned": true,
                "isMuted": false,
                "muteExpiration": 0,
                "groupMetadata": {
                  "subject": "Команда проекта",
                  "owner": {
                    "server": "c.us",
                    "user": "79990000000",
                    "_serialized": "79990000000@c.us"
                  },
                  "participants": [
                    {
                      "id": {
                        "server": "c.us",
                        "user": "79990000000",
                        "_serialized": "79990000000@c.us"
                      },
                      "isAdmin": true,
                      "isSuperAdmin": true
                    },
                    {
                      "id": {
                        "server": "c.us",
                        "user": "79991234567",
                        "_serialized": "79991234567@c.us"
                      },
                      "isAdmin": false,
                      "isSuperAdmin": false
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const chats = await client.getChats()
    res.json({ success: true, chats })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieve all chats for the given session ID with optional search parameters.
 *
 * @function
 * @async
 *
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {Object} res - The response object.
 *
 * @returns {Promise<void>} A Promise that resolves when the operation is complete.
 *
 * @throws {Error} If the operation fails, an error is thrown.
 */
const getChatsWithSearch = async (req, res) => {
  /*
    #swagger.summary = 'Список чатов с фильтрами (непрочитанные, с даты)'
    #swagger.description = '<p>Как <code>GET /client/getChats</code>, но с фильтрами по непрочитанным и по времени последней активности.</p><p><b>Когда использовать:</b> периодический опрос «что нового» без загрузки всех чатов: <code>unread: true</code> и/или <code>since</code> = время предыдущего опроса.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>since</code> — Unix-время в <b>секундах</b> (не миллисекундах); сравнивается со временем последней активности чата.</li><li>Фильтры работают после события <code>ready</code> (их добавляет патч этого API к whatsapp-web.js).</li><li><code>searchOptions</code> можно не передавать — тогда вернутся все чаты.</li><li>Ответ может быть большим и медленным при сотнях чатов: каждый чат содержит <code>lastMessage</code>.</li><li>Групповые чаты дополнительно содержат <code>groupMetadata</code> (участники, владелец), каналы — <code>channelMetadata</code>.</li></ul><p><b>Ответ:</b> <code>chats</code> — отфильтрованный массив чатов.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [],
            "properties": {
              "searchOptions": {
                "type": "object",
                "description": "Фильтры (по умолчанию {} — без фильтрации)",
                "properties": {
                  "since": {
                    "type": "number",
                    "description": "Вернуть только чаты с активностью не раньше этого Unix-времени (секунды)",
                    "example": 1746618541
                  },
                  "unread": {
                    "type": "boolean",
                    "description": "true — только чаты с непрочитанными сообщениями",
                    "example": true
                  }
                }
              }
            }
          },
          "examples": {
            "unread": {
              "summary": "Только непрочитанные",
              "value": {
                "searchOptions": {
                  "unread": true
                }
              }
            },
            "since": {
              "summary": "Активные с указанного момента",
              "value": {
                "searchOptions": {
                  "since": 1746618541
                }
              }
            },
            "all": {
              "summary": "Без фильтров",
              "value": {}
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Отфильтрованный массив чатов.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "chats": [
              {
                "id": {
                  "server": "c.us",
                  "user": "79991234567",
                  "_serialized": "79991234567@c.us"
                },
                "name": "Иван Петров",
                "isGroup": false,
                "isReadOnly": false,
                "unreadCount": 2,
                "timestamp": 1730000500,
                "archived": false,
                "pinned": false,
                "isMuted": false,
                "muteExpiration": 0,
                "lastMessage": {
                  "id": {
                    "fromMe": false,
                    "remote": "79991234567@c.us",
                    "id": "3EB0A1B2C3D4E5F60718",
                    "_serialized": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                  },
                  "ack": 3,
                  "hasMedia": false,
                  "body": "Добрый день, заказ получил",
                  "type": "chat",
                  "timestamp": 1730000500,
                  "from": "79991234567@c.us",
                  "to": "79990000000@c.us",
                  "fromMe": false,
                  "hasQuotedMsg": false
                }
              }
            ]
          }
        }
      }
    }
  */
  try {
    const { searchOptions = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const chats = await client.getChats(searchOptions)
    res.json({ success: true, chats })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Returns the profile picture URL for a given contact ID.
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {string} req.params.sessionId - The ID of the current session.
 * @param {string} req.body.contactId - The ID of the contact to get the profile picture for.
 * @returns {Promise<void>} - A Promise that resolves with the profile picture URL.
 * @throws {Error} - If there is an error retrieving the profile picture URL.
 */
const getProfilePictureUrl = async (req, res) => {
  /*
    #swagger.summary = 'Ссылка на аватар контакта или группы'
    #swagger.description = '<p>Возвращает URL фото профиля пользователя или группы, если настройки приватности это позволяют.</p><p><b>Когда использовать:</b> показать аватар в CRM/интерфейсе оператора.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если фото нет или скрыто настройками приватности, поле <code>result</code> в ответе <b>отсутствует</b> (HTTP 200, <code>success: true</code>).</li><li>Ссылка временная (подписанный URL CDN WhatsApp) — скачивайте и сохраняйте файл у себя, а не храните ссылку.</li><li><code>contactId</code> — полный id (<code>...@c.us</code> или <code>...@g.us</code>), не просто номер.</li></ul><p><b>Ответ:</b> <code>result</code> — URL изображения.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "contactId"
            ],
            "properties": {
              "contactId": {
                "type": "string",
                "description": "id пользователя (...@c.us) или группы (...@g.us)",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — URL фото; отсутствует, если фото нет или оно скрыто.",
      "content": {
        "application/json": {
          "examples": {
            "found": {
              "summary": "Фото есть",
              "value": {
                "success": true,
                "result": "https://pps.whatsapp.net/v/t61.24694-24/123456789_123456789012345_1234567890123456789_n.jpg?oh=...&oe=6730A1B2"
              }
            },
            "hidden": {
              "summary": "Фото нет или скрыто",
              "value": {
                "success": true
              }
            }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getProfilePicUrl(contactId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Accepts an invite.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.body - The request body.
 * @param {Object} req.params - The request parameters.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {Object} res - The HTTP response object.
 * @returns {Object} The response object.
 * @throws {Error} If there is an error while accepting the invite.
 */
const acceptInvite = async (req, res) => {
  /*
    #swagger.summary = 'Вступить в группу по коду приглашения'
    #swagger.description = '<p>Вступает в группу по коду из ссылки-приглашения.</p><p><b>Когда использовать:</b> подключить бота к группе по ссылке <code>https://chat.whatsapp.com/КОД</code>. Проверить, что это за группа, до вступления можно через <code>/client/getInviteInfo</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Передавайте только код (часть после <code>https://chat.whatsapp.com/</code>), не ссылку целиком.</li><li>Отозванный или неверный код приводит к ошибке 500 (текст зависит от ответа WhatsApp).</li></ul><p><b>Ответ:</b> <code>acceptInvite</code> — id группы, в которую вы вступили.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "inviteCode"
            ],
            "properties": {
              "inviteCode": {
                "type": "string",
                "description": "Код приглашения в группу — часть ссылки после https://chat.whatsapp.com/ (саму ссылку целиком не передавайте)",
                "example": "Fk3Lq9XbZ2a8PqR7sT1uVw"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "acceptInvite — сериализованный id группы.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "acceptInvite": "120363012345678901@g.us"
          }
        }
      }
    }
  */
  try {
    const { inviteCode } = req.body
    const client = sessions.get(req.params.sessionId)
    const acceptInvite = await client.acceptInvite(inviteCode)
    res.json({ success: true, acceptInvite })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the version of WhatsApp Web currently being run.
 *
 * @async
 * @function getWWebVersion
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.params - The request parameters.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {Object} res - The HTTP response object.
 * @returns {Object} The response object.
 * @throws {Error} If there is an error while accepting the invite.
 */
const getWWebVersion = async (req, res) => {
  /*
    #swagger.summary = 'Версия WhatsApp Web в сессии'
    #swagger.description = '<p>Возвращает версию WhatsApp Web, загруженную в браузере сессии.</p><p><b>Когда использовать:</b> диагностика проблем совместимости whatsapp-web.js, подбор значения <code>WEB_VERSION</code>.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>result</code> — строка версии.</p>'
    #swagger.responses[200] = {
      "description": "Версия WhatsApp Web.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": "2.3000.1023456789"
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const result = await client.getWWebVersion()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Archives a chat.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.body - The request body.
 * @param {Object} req.params - The request parameters.
 * @param {string} req.params.sessionId - The ID of the session.
 * @param {Object} res - The HTTP response object.
 * @returns {Object} The response object.
 * @throws {Error} If there is an error while archiving the chat.
 */
const archiveChat = async (req, res) => {
  /*
    #swagger.summary = 'Архивировать чат'
    #swagger.description = '<p>Переносит чат в архив.</p><p><b>Когда использовать:</b> скрыть обработанные диалоги. Вернуть — <code>/client/unarchiveChat</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Новое входящее сообщение может вернуть чат из архива (зависит от настроек WhatsApp на телефоне).</li></ul><p><b>Ответ:</b> <code>result</code> — новое состояние архива (всегда <code>true</code>).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Чат архивирован.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": true
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.archiveChat(chatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get the list of blocked contacts for the user's client.
 *
 * @async
 * @function getBlockedContacts
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID to use for the client.
 * @param {Object} res - The response object.
 * @returns {Promise<Object>} - A promise that resolves to an object with a success property and an array of blocked contacts.
 * @throws {Error} - Throws an error if the operation fails.
 */
const getBlockedContacts = async (req, res) => {
  /*
    #swagger.summary = 'Список заблокированных контактов'
    #swagger.description = '<p>Возвращает всех пользователей, заблокированных текущим аккаунтом.</p><p><b>Когда использовать:</b> синхронизация стоп-листа, проверка перед рассылкой. Блокировка/разблокировка — <code>/contact/block</code>, <code>/contact/unblock</code>.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>blockedContacts</code> — массив объектов Contact.</p>'
    #swagger.responses[200] = {
      "description": "Массив заблокированных контактов.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "blockedContacts": [
              {
                "id": {
                  "server": "c.us",
                  "user": "79991234567",
                  "_serialized": "79991234567@c.us"
                },
                "number": "79991234567",
                "isBusiness": false,
                "isEnterprise": false,
                "pushname": "Ivan",
                "shortName": "Иван",
                "type": "in",
                "isMe": false,
                "isUser": true,
                "isGroup": false,
                "isWAContact": true,
                "isMyContact": false,
                "isBlocked": true
              }
            ]
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const blockedContacts = await client.getBlockedContacts()
    res.json({ success: true, blockedContacts })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get the chat with the given ID.
 *
 * @async
 * @function getChatById
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID to use for the client.
 * @param {string} req.body.chatId - The ID of the chat to get.
 * @param {Object} res - The response object.
 * @returns {Promise<Object>} - A promise that resolves to an object with a success property and the chat object.
 * @throws {Error} - Throws an error if the operation fails.
 */
const getChatById = async (req, res) => {
  /*
    #swagger.summary = 'Получить чат по id'
    #swagger.description = '<p>Возвращает объект чата (личного, группы или канала) по его id.</p><p><b>Когда использовать:</b> узнать название, число непрочитанных, последнее сообщение, участников группы (<code>groupMetadata</code>) перед действием с чатом.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Для существующего в WhatsApp пользователя, с которым ещё не было переписки, чат может быть создан локально «на лету».</li><li>Если чат не найден — HTTP 500 с <code>Chat not found</code> (не 404).</li></ul><p><b>Ответ:</b> <code>chat</code> — объект Chat, GroupChat (с <code>groupMetadata</code>) или Channel.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: ...@c.us, ...@g.us или ...@newsletter",
                "example": "79991234567@c.us"
              }
            }
          },
          "examples": {
            "personal": {
              "summary": "Личный чат",
              "value": {
                "chatId": "79991234567@c.us"
              }
            },
            "group": {
              "summary": "Группа",
              "value": {
                "chatId": "120363012345678901@g.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Объект чата.",
      "content": {
        "application/json": {
          "examples": {
            "personal": {
              "summary": "Личный чат",
              "value": {
                "success": true,
                "chat": {
                  "id": {
                    "server": "c.us",
                    "user": "79991234567",
                    "_serialized": "79991234567@c.us"
                  },
                  "name": "Иван Петров",
                  "isGroup": false,
                  "isReadOnly": false,
                  "unreadCount": 2,
                  "timestamp": 1730000500,
                  "archived": false,
                  "pinned": false,
                  "isMuted": false,
                  "muteExpiration": 0,
                  "lastMessage": {
                    "id": {
                      "fromMe": false,
                      "remote": "79991234567@c.us",
                      "id": "3EB0A1B2C3D4E5F60718",
                      "_serialized": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                    },
                    "ack": 3,
                    "hasMedia": false,
                    "body": "Добрый день, заказ получил",
                    "type": "chat",
                    "timestamp": 1730000500,
                    "from": "79991234567@c.us",
                    "to": "79990000000@c.us",
                    "fromMe": false,
                    "hasQuotedMsg": false
                  }
                }
              }
            },
            "group": {
              "summary": "Группа",
              "value": {
                "success": true,
                "chat": {
                  "id": {
                    "server": "g.us",
                    "user": "120363012345678901",
                    "_serialized": "120363012345678901@g.us"
                  },
                  "name": "Команда проекта",
                  "isGroup": true,
                  "isReadOnly": false,
                  "unreadCount": 0,
                  "timestamp": 1730000300,
                  "archived": false,
                  "pinned": true,
                  "isMuted": false,
                  "muteExpiration": 0,
                  "groupMetadata": {
                    "subject": "Команда проекта",
                    "owner": {
                      "server": "c.us",
                      "user": "79990000000",
                      "_serialized": "79990000000@c.us"
                    },
                    "participants": [
                      {
                        "id": {
                          "server": "c.us",
                          "user": "79990000000",
                          "_serialized": "79990000000@c.us"
                        },
                        "isAdmin": true,
                        "isSuperAdmin": true
                      },
                      {
                        "id": {
                          "server": "c.us",
                          "user": "79991234567",
                          "_serialized": "79991234567@c.us"
                        },
                        "isAdmin": false,
                        "isSuperAdmin": false
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      "description": "Chat not found — чат с таким id не найден; иначе — текст исключения whatsapp-web.js / Puppeteer (например, некорректный формат id).",
      "content": {
        "application/json": {
          "examples": {
            "notFound": {
              "summary": "Чат не найден",
              "value": {
                "success": false,
                "error": "Chat not found"
              }
            },
            "other": {
              "summary": "Прочая ошибка",
              "value": {
                "success": false,
                "error": "Protocol error (Runtime.callFunctionOn): Target closed."
              }
            }
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
      throw new Error('Chat not found')
    }
    res.json({ success: true, chat })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get the labels for the chat with the given ID.
 *
 * @async
 * @function getChatLabels
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID to use for the client.
 * @param {string} req.body.chatId - The ID of the chat to get labels for.
 * @param {Object} res - The response object.
 * @returns {Promise<Object>} - A promise that resolves to an object with a success property and an array of labels for the chat.
 * @throws {Error} - Throws an error if the operation fails.
 */
const getChatLabels = async (req, res) => {
  /*
    #swagger.summary = 'Метки, назначенные чату (WhatsApp Business)'
    #swagger.description = '<p>Возвращает метки (labels), назначенные чату.</p><p><b>Когда использовать:</b> узнать статус клиента по меткам (например «Новый клиент», «Оплачено»).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Метки существуют только в аккаунтах <b>WhatsApp Business</b>; в обычном аккаунте список пуст.</li><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li></ul><p><b>Ответ:</b> <code>chatLabels</code> — массив меток <code>{id, name, hexColor}</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Массив меток чата (пустой, если меток нет).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "chatLabels": [
              {
                "id": "1",
                "name": "Новый клиент",
                "hexColor": "#ff9485"
              }
            ]
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chatLabels = await client.getChatLabels(chatId)
    res.json({ success: true, chatLabels })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get the chats with the given label ID.
 *
 * @async
 * @function getChatsByLabelId
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID to use for the client.
 * @param {string} req.body.labelId - The ID of the label to get chats for.
 * @param {Object} res - The response object.
 * @returns {Promise<Object>} - A promise that resolves to an object with a success property and an array of chats with the given label.
 * @throws {Error} - Throws an error if the operation fails.
 */
const getChatsByLabelId = async (req, res) => {
  /*
    #swagger.summary = 'Чаты с указанной меткой (WhatsApp Business)'
    #swagger.description = '<p>Возвращает все чаты, которым назначена метка.</p><p><b>Когда использовать:</b> выборка клиентов по статусу-метке (например, все чаты с меткой «Ожидает оплаты»).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Метки существуют только в аккаунтах <b>WhatsApp Business</b>; в обычном аккаунте список пуст.</li><li><code>labelId</code> берите из <code>/client/getLabels</code>. Несуществующий id даёт 500.</li></ul><p><b>Ответ:</b> <code>chats</code> — массив объектов Chat.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "labelId"
            ],
            "properties": {
              "labelId": {
                "type": "string",
                "description": "id метки (поле id из /client/getLabels), например «1»",
                "example": "1"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Массив чатов с меткой.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "chats": [
              {
                "id": {
                  "server": "c.us",
                  "user": "79991234567",
                  "_serialized": "79991234567@c.us"
                },
                "name": "Иван Петров",
                "isGroup": false,
                "isReadOnly": false,
                "unreadCount": 2,
                "timestamp": 1730000500,
                "archived": false,
                "pinned": false,
                "isMuted": false,
                "muteExpiration": 0,
                "lastMessage": {
                  "id": {
                    "fromMe": false,
                    "remote": "79991234567@c.us",
                    "id": "3EB0A1B2C3D4E5F60718",
                    "_serialized": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                  },
                  "ack": 3,
                  "hasMedia": false,
                  "body": "Добрый день, заказ получил",
                  "type": "chat",
                  "timestamp": 1730000500,
                  "from": "79991234567@c.us",
                  "to": "79990000000@c.us",
                  "fromMe": false,
                  "hasQuotedMsg": false
                }
              }
            ]
          }
        }
      }
    }
  */
  try {
    const { labelId } = req.body
    const client = sessions.get(req.params.sessionId)
    const chats = await client.getChatsByLabelId(labelId)
    res.json({ success: true, chats })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the common groups between the client's session and the specified contact.
 * @async
 * @function getCommonGroups
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID of the client.
 * @param {string} req.body.contactId - The ID of the contact to retrieve the common groups with.
 * @param {Object} res - The response object.
 * @returns {Object} - An object containing a success flag and the retrieved groups.
 * @throws {Error} - If an error occurs while retrieving the common groups.
 */
const getCommonGroups = async (req, res) => {
  /*
    #swagger.summary = 'Общие группы с контактом'
    #swagger.description = '<p>Возвращает id групп, в которых состоите и вы, и указанный пользователь.</p><p><b>Когда использовать:</b> понять, откуда «знаком» пользователь, проверить членство в рабочей группе.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>contactId</code> — полный id <code>...@c.us</code>.</li><li>Если общих групп нет — пустой массив.</li></ul><p><b>Ответ:</b> <code>groups</code> — массив id групп <code>{server, user, _serialized}</code> (не объекты чатов; подробности — через <code>/client/getChatById</code>).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "contactId"
            ],
            "properties": {
              "contactId": {
                "type": "string",
                "description": "id пользователя WhatsApp в формате <код страны><номер>@c.us (сериализованный id)",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Массив id общих групп.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "groups": [
              {
                "server": "g.us",
                "user": "120363012345678901",
                "_serialized": "120363012345678901@g.us"
              }
            ]
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const groups = await client.getCommonGroups(contactId)
    res.json({ success: true, groups })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the contact with the specified ID.
 * @async
 * @function getContactById
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID of the client.
 * @param {string} req.body.contactId - The ID of the contact to retrieve.
 * @param {Object} res - The response object.
 * @returns {Object} - An object containing a success flag and the retrieved contact.
 * @throws {Error} - If an error occurs while retrieving the contact.
 */
const getContactById = async (req, res) => {
  /*
    #swagger.summary = 'Получить контакт по id'
    #swagger.description = '<p>Возвращает объект контакта: имя в адресной книге, pushname, бизнес-аккаунт ли это, заблокирован ли и т.д.</p><p><b>Когда использовать:</b> получить имя отправителя входящего сообщения (<code>message.from</code> / <code>message.author</code>).</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>contactId</code> — полный id (<code>...@c.us</code>, также поддерживается <code>...@lid</code>). Просто номер без суффикса не подойдёт.</li><li>Для незнакомого номера объект вернётся, но <code>name</code> будет пустым, а <code>isMyContact</code> = false.</li><li>Для проверки регистрации номера в WhatsApp используйте <code>/client/getNumberId</code>.</li></ul><p><b>Ответ:</b> <code>contact</code> — объект Contact (у бизнес-аккаунтов дополнительно <code>businessProfile</code>).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "contactId"
            ],
            "properties": {
              "contactId": {
                "type": "string",
                "description": "id пользователя WhatsApp в формате <код страны><номер>@c.us (сериализованный id)",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Объект контакта.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "contact": {
              "id": {
                "server": "c.us",
                "user": "79991234567",
                "_serialized": "79991234567@c.us"
              },
              "number": "79991234567",
              "isBusiness": false,
              "isEnterprise": false,
              "name": "Иван Петров",
              "pushname": "Ivan",
              "shortName": "Иван",
              "type": "in",
              "isMe": false,
              "isUser": true,
              "isGroup": false,
              "isWAContact": true,
              "isMyContact": true,
              "isBlocked": false
            }
          }
        }
      }
    }
  */
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const contact = await client.getContactById(contactId)
    res.json({ success: true, contact })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the invite information for the specified invite code.
 * @async
 * @function getInviteInfo
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The session ID of the client.
 * @param {string} req.body.inviteCode - The invite code to retrieve information for.
 * @param {Object} res - The response object.
 * @returns {Object} - An object containing a success flag and the retrieved invite information.
 * @throws {Error} - If an error occurs while retrieving the invite information.
 */
const getInviteInfo = async (req, res) => {
  /*
    #swagger.summary = 'Информация о группе по коду приглашения'
    #swagger.description = '<p>Возвращает сведения о группе по коду приглашения, не вступая в неё.</p><p><b>Когда использовать:</b> проверить название и размер группы перед <code>/client/acceptInvite</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Передавайте только код (часть после <code>https://chat.whatsapp.com/</code>).</li><li>Неверный или отозванный код даёт ошибку 500.</li><li><code>inviteInfo</code> — «сырой» объект WhatsApp Web; набор полей зависит от версии WhatsApp Web, пример ниже ориентировочный.</li></ul><p><b>Ответ:</b> <code>inviteInfo</code> — данные группы (id, тема, описание, размер, владелец и т.п.).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "inviteCode"
            ],
            "properties": {
              "inviteCode": {
                "type": "string",
                "description": "Код приглашения в группу — часть ссылки после https://chat.whatsapp.com/ (саму ссылку целиком не передавайте)",
                "example": "Fk3Lq9XbZ2a8PqR7sT1uVw"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Данные группы (сырой объект WhatsApp Web, состав полей может отличаться).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "inviteInfo": {
              "id": {
                "server": "g.us",
                "user": "120363012345678901",
                "_serialized": "120363012345678901@g.us"
              },
              "subject": "Команда проекта",
              "size": 12,
              "owner": {
                "server": "c.us",
                "user": "79990000000",
                "_serialized": "79990000000@c.us"
              },
              "creation": 1700000000,
              "desc": "Рабочая группа"
            }
          }
        }
      }
    }
  */
  try {
    const { inviteCode } = req.body
    const client = sessions.get(req.params.sessionId)
    const inviteInfo = await client.getInviteInfo(inviteCode)
    res.json({ success: true, inviteInfo })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the label with the given ID for a particular session.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The ID of the session to retrieve the label for.
 * @param {Object} req.body - The request body object.
 * @param {string} req.body.labelId - The ID of the label to retrieve.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 * @throws {Error} If there is an error retrieving the label.
 */
const getLabelById = async (req, res) => {
  /*
    #swagger.summary = 'Получить метку по id (WhatsApp Business)'
    #swagger.description = '<p>Возвращает одну метку по её id.</p><p><b>Когда использовать:</b> получить название и цвет метки по id (например, из <code>chat.labels</code>).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Метки существуют только в аккаунтах <b>WhatsApp Business</b>; в обычном аккаунте список пуст.</li><li>Несуществующий <code>labelId</code> приводит к ошибке 500.</li></ul><p><b>Ответ:</b> <code>label</code> — <code>{id, name, hexColor}</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "labelId"
            ],
            "properties": {
              "labelId": {
                "type": "string",
                "description": "id метки (поле id из /client/getLabels), например «1»",
                "example": "1"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Метка.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "label": {
              "id": "1",
              "name": "Новый клиент",
              "hexColor": "#ff9485"
            }
          }
        }
      }
    }
  */
  try {
    const { labelId } = req.body
    const client = sessions.get(req.params.sessionId)
    const label = await client.getLabelById(labelId)
    res.json({ success: true, label })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves all labels for a particular session.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The ID of the session to retrieve the labels for.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 * @throws {Error} If there is an error retrieving the labels.
 */
const getLabels = async (req, res) => {
  /*
    #swagger.summary = 'Все метки аккаунта (WhatsApp Business)'
    #swagger.description = '<p>Возвращает все метки, созданные в аккаунте.</p><p><b>Когда использовать:</b> получить id меток для <code>/client/getChatsByLabelId</code> и <code>/client/addOrRemoveLabels</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Метки существуют только в аккаунтах <b>WhatsApp Business</b>; в обычном аккаунте список пуст.</li></ul><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>labels</code> — массив <code>{id, name, hexColor}</code>.</p>'
    #swagger.responses[200] = {
      "description": "Массив меток.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "labels": [
              {
                "id": "1",
                "name": "Новый клиент",
                "hexColor": "#ff9485"
              },
              {
                "id": "5",
                "name": "Оплачено",
                "hexColor": "#64c4ff"
              }
            ]
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const labels = await client.getLabels()
    res.json({ success: true, labels })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Adds or removes labels to/from chats.
 * @async
 * @function
 * @param {Object} req - the request object
 * @param {Object} res - the response object
 * @return {Promise} a Promise that resolves to the JSON response with success status and labels
 * @throws {Error} if an error occurs
 */
const addOrRemoveLabels = async (req, res) => {
  /*
    #swagger.summary = 'Установить набор меток для чатов (WhatsApp Business)'
    #swagger.description = '<p>Назначает указанным чатам метки из <code>labelIds</code>. Важно: метки, которые уже есть у этих чатов, но не перечислены в <code>labelIds</code>, <b>снимаются</b> — метод задаёт итоговый набор меток, а не добавляет к существующим.</p><p><b>Когда использовать:</b> сменить статус клиента (например, заменить «Новый клиент» на «Оплачено»). Чтобы снять все метки, передайте пустой <code>labelIds</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает только в WhatsApp Business. В обычном аккаунте библиотека бросает строку <code>[LT01] Only Whatsapp business</code>, поэтому ответ — HTTP 500 с телом <code>{"success": false}</code> <b>без поля error</b>.</li><li>Оба поля — массивы. Несуществующие id меток и чатов молча игнорируются.</li><li><code>chatIds</code> — полные id (<code>...@c.us</code> / <code>...@g.us</code>).</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "labelIds",
              "chatIds"
            ],
            "properties": {
              "labelIds": {
                "type": "array",
                "items": {
                  "oneOf": [
                    {
                      "type": "string"
                    },
                    {
                      "type": "number"
                    }
                  ]
                },
                "description": "id меток, которые должны остаться у чатов (из /client/getLabels). Пустой массив — снять все метки",
                "example": [
                  "1",
                  "5"
                ]
              },
              "chatIds": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "id чатов (...@c.us / ...@g.us)",
                "example": [
                  "79991234567@c.us"
                ]
              }
            }
          },
          "examples": {
            "set": {
              "summary": "Оставить метки 1 и 5",
              "value": {
                "labelIds": [
                  "1",
                  "5"
                ],
                "chatIds": [
                  "79991234567@c.us"
                ]
              }
            },
            "clear": {
              "summary": "Снять все метки",
              "value": {
                "labelIds": [],
                "chatIds": [
                  "79991234567@c.us"
                ]
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Метки обновлены.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
    #swagger.responses[500] = {
      "description": "Аккаунт не WhatsApp Business (тело без поля error) или другое исключение whatsapp-web.js / Puppeteer.",
      "content": {
        "application/json": {
          "examples": {
            "notBusiness": {
              "summary": "Не WhatsApp Business (без поля error)",
              "value": {
                "success": false
              }
            },
            "other": {
              "summary": "Прочая ошибка",
              "value": {
                "success": false,
                "error": "Protocol error (Runtime.callFunctionOn): Target closed."
              }
            }
          }
        }
      }
    }
  */
  try {
    const { labelIds, chatIds } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.addOrRemoveLabels(labelIds, chatIds)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieves the state for a particular session.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {string} req.params.sessionId - The ID of the session to retrieve the state for.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 * @throws {Error} If there is an error retrieving the state.
 */
const getState = async (req, res) => {
  /*
    #swagger.summary = 'Текущее состояние подключения клиента'
    #swagger.description = '<p>Возвращает состояние WhatsApp Web внутри сессии (<code>CONNECTED</code>, <code>OPENING</code>, <code>UNPAIRED</code> и т.д.).</p><p><b>Когда использовать:</b> быстрая проверка подключения. В отличие от остальных методов <code>/client/...</code>, здесь <b>нет</b> предварительной проверки готовности сессии, поэтому метод работает и пока сессия не авторизована. Для полноценной проверки с понятными сообщениями удобнее <code>/session/status/{sessionId}</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если сессия с таким id не запущена, ответ — <b>HTTP 500</b> (а не 404) с текстом вида <code>Cannot read properties of undefined (reading «getState»)</code>.</li><li>Пока WhatsApp Web ещё загружается, <code>state</code> может быть <code>null</code>.</li></ul><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>state</code> — одно из: CONFLICT, CONNECTED, DEPRECATED_VERSION, OPENING, PAIRING, PROXYBLOCK, SMB_TOS_BLOCK, TIMEOUT, TOS_BLOCK, UNLAUNCHED, UNPAIRED, UNPAIRED_IDLE, либо <code>null</code>. Рабочее состояние — только CONNECTED.</p>'
    #swagger.responses[200] = {
      "description": "state — состояние WhatsApp Web или null.",
      "content": {
        "application/json": {
          "examples": {
            "connected": {
              "summary": "Подключено",
              "value": {
                "success": true,
                "state": "CONNECTED"
              }
            },
            "unpaired": {
              "summary": "Не авторизовано (нужен QR)",
              "value": {
                "success": true,
                "state": "UNPAIRED"
              }
            },
            "loading": {
              "summary": "WhatsApp Web ещё загружается",
              "value": {
                "success": true,
                "state": null
              }
            }
          }
        }
      }
    }
    #swagger.responses[500] = {
      "description": "Сессия с таким id не запущена (TypeError) или браузер сессии недоступен.",
      "content": {
        "application/json": {
          "examples": {
            "noSession": {
              "summary": "Сессия не запущена",
              "value": {
                "success": false,
                "error": "Cannot read properties of undefined (reading 'getState')"
              }
            }
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const state = await client.getState()
    res.json({ success: true, state })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Marks a chat as unread.
 *
 * @async
 * @function markChatUnread
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.chatId - The ID of the chat to mark as unread.
 * @returns {Promise<void>} - A Promise that resolves when the chat is marked as unread.
 * @throws {Error} - If an error occurs while marking the chat as unread.
 */
const markChatUnread = async (req, res) => {
  /*
    #swagger.summary = 'Пометить чат непрочитанным'
    #swagger.description = '<p>Ставит чату отметку «непрочитано» (как долгое нажатие на телефоне).</p><p><b>Когда использовать:</b> вернуть диалог оператору в работу после автоматической обработки.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Если включён <code>SET_MESSAGES_AS_SEEN</code>, следующее входящее сообщение снова пометит чат прочитанным.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Чат помечен непрочитанным.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.markChatUnread(chatId)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Mutes a chat.
 *
 * @async
 * @function muteChat
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.chatId - The ID of the chat to mute.
 * @param {Date} [req.body.unmuteDate] - The date and time when the chat should be unmuted. If not provided, the chat will be muted indefinitely.
 * @returns {Promise<void>} - A Promise that resolves when the chat is muted.
 * @throws {Error} - If an error occurs while muting the chat.
 */
const muteChat = async (req, res) => {
  /*
    #swagger.summary = 'Отключить уведомления чата'
    #swagger.description = '<p>Отключает уведомления чата навсегда или до указанного момента.</p><p><b>Когда использовать:</b> заглушить шумные группы на аккаунте.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li><code>unmuteDate</code> — Unix-время в <b>секундах</b> (сервер умножает его на 1000). Миллисекунды дадут дату далеко в будущем.</li><li>Без <code>unmuteDate</code> (или со значением 0) чат заглушается навсегда.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              },
              "unmuteDate": {
                "oneOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "string"
                  }
                ],
                "description": "Unix-время (секунды), когда уведомления включатся обратно. Не передавайте, чтобы заглушить навсегда",
                "example": 1733489397
              }
            }
          },
          "examples": {
            "forever": {
              "summary": "Навсегда",
              "value": {
                "chatId": "120363012345678901@g.us"
              }
            },
            "until": {
              "summary": "До указанной даты",
              "value": {
                "chatId": "120363012345678901@g.us",
                "unmuteDate": 1733489397
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Уведомления отключены.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { chatId, unmuteDate } = req.body
    const client = sessions.get(req.params.sessionId)
    if (unmuteDate) {
      await client.muteChat(chatId, new Date(unmuteDate * 1000))
    } else {
      await client.muteChat(chatId, null)
    }
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Pins a chat.
 *
 * @async
 * @function pinChat
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {string} req.body.chatId - The ID of the chat to pin.
 * @returns {Promise<void>} - A Promise that resolves when the chat is pinned.
 * @throws {Error} - If an error occurs while pinning the chat.
 */
const pinChat = async (req, res) => {
  /*
    #swagger.summary = 'Закрепить чат'
    #swagger.description = '<p>Закрепляет чат вверху списка.</p><p><b>Когда использовать:</b> выделить важные диалоги на аккаунте.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>WhatsApp позволяет закрепить не более 3 чатов. Если лимит достигнут, чат не закрепляется и <code>result</code> = false (HTTP 200).</li><li>Если чат уже закреплён — сразу <code>result: true</code>.</li></ul><p><b>Ответ:</b> <code>result</code> — закреплён ли чат после операции.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — новое состояние закрепления.",
      "content": {
        "application/json": {
          "examples": {
            "pinned": {
              "summary": "Закреплён",
              "value": {
                "success": true,
                "result": true
              }
            },
            "limit": {
              "summary": "Достигнут лимит 3 закреплённых чатов",
              "value": {
                "success": true,
                "result": false
              }
            }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.pinChat(chatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}
/**
 * Search messages with the given query and options.
 * @async
 * @function searchMessages
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @param {Object} req.body - The request body.
 * @param {string} req.body.query - The search query.
 * @param {Object} [req.body.options] - The search options (optional).
 * @returns {Promise<void>} - A Promise that resolves with the search results.
 * @throws {Error} - If there's an error during the search.
 */
const searchMessages = async (req, res) => {
  /*
    #swagger.summary = 'Поиск сообщений по тексту'
    #swagger.description = '<p>Ищет сообщения по тексту во всех чатах или в одном чате — как поиск в WhatsApp Web.</p><p><b>Когда использовать:</b> найти сообщение по номеру заказа, ключевому слову и т.п.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Поиск идёт по сообщениям, доступным WhatsApp Web на этом устройстве; очень старая история может быть не загружена.</li><li>Постраничный вывод: <code>options.page</code> и <code>options.limit</code>; для поиска в одном чате — <code>options.chatId</code>.</li><li><code>query</code> обязателен.</li></ul><p><b>Ответ:</b> <code>messages</code> — массив объектов Message.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "query"
            ],
            "properties": {
              "query": {
                "type": "string",
                "description": "Текст для поиска",
                "example": "заказ 1234"
              },
              "options": {
                "type": "object",
                "description": "Необязательные параметры поиска",
                "properties": {
                  "chatId": {
                    "type": "string",
                    "description": "Искать только в этом чате (...@c.us / ...@g.us)",
                    "example": "79991234567@c.us"
                  },
                  "page": {
                    "type": "number",
                    "description": "Номер страницы результатов",
                    "example": 1
                  },
                  "limit": {
                    "type": "number",
                    "description": "Количество результатов на странице",
                    "example": 10
                  }
                }
              }
            }
          },
          "examples": {
            "all": {
              "summary": "Во всех чатах",
              "value": {
                "query": "заказ 1234"
              }
            },
            "inChat": {
              "summary": "В одном чате, первые 10",
              "value": {
                "query": "счёт",
                "options": {
                  "chatId": "79991234567@c.us",
                  "page": 1,
                  "limit": 10
                }
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Найденные сообщения.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "messages": [
              {
                "id": {
                  "fromMe": false,
                  "remote": "79991234567@c.us",
                  "id": "3EB0A1B2C3D4E5F60718",
                  "_serialized": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
                },
                "ack": 3,
                "hasMedia": false,
                "body": "Добрый день, заказ получил",
                "type": "chat",
                "timestamp": 1730000500,
                "from": "79991234567@c.us",
                "to": "79990000000@c.us",
                "fromMe": false,
                "hasQuotedMsg": false
              }
            ]
          }
        }
      }
    }
  */
  try {
    const { query, options } = req.body
    const client = sessions.get(req.params.sessionId)
    let messages
    if (options) {
      messages = await client.searchMessages(query, options)
    } else {
      messages = await client.searchMessages(query)
    }
    res.json({ success: true, messages })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send presence available to the XMPP server.
 * @async
 * @function sendPresenceAvailable
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @returns {Promise<void>} - A Promise that resolves with the presence status.
 * @throws {Error} - If there's an error during the presence sending.
 */
const sendPresenceAvailable = async (req, res) => {
  /*
    #swagger.summary = 'Показать статус «в сети»'
    #swagger.description = '<p>Отмечает аккаунт как «в сети» (online) для собеседников.</p><p><b>Когда использовать:</b> имитировать присутствие оператора; вернуть «не в сети» — <code>/client/sendPresenceUnavailable</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Видимость статуса зависит от настроек приватности аккаунта («Время посещения и в сети»).</li></ul><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.responses[200] = {
      "description": "Статус «в сети» отправлен.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    await client.sendPresenceAvailable()
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send presence unavailable to the XMPP server.
 * @async
 * @function sendPresenceUnavailable
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.params.sessionId - The session ID.
 * @returns {Promise<void>} - A Promise that resolves with the presence status.
 * @throws {Error} - If there's an error during the presence sending.
 */
const sendPresenceUnavailable = async (req, res) => {
  /*
    #swagger.summary = 'Показать статус «не в сети»'
    #swagger.description = '<p>Отмечает аккаунт как «не в сети» (offline).</p><p><b>Когда использовать:</b> после <code>/client/sendPresenceAvailable</code>, чтобы аккаунт не висел «в сети» постоянно.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.responses[200] = {
      "description": "Статус «не в сети» отправлен.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    await client.sendPresenceUnavailable()
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Send a 'seen' message status for a given chat ID.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.body.chatId - The ID of the chat to set the seen status for.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue sending the seen status message, an error will be thrown.
 */
const sendSeen = async (req, res) => {
  /*
    #swagger.summary = 'Пометить сообщения чата прочитанными'
    #swagger.description = '<p>Отправляет отметку «прочитано» (синие галочки) для чата.</p><p><b>Когда использовать:</b> когда оператор или бот обработал входящие сообщения. При <code>SET_MESSAGES_AS_SEEN=TRUE</code> это делается автоматически.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> обязателен — без него ответ 400 <code>chatId is required</code>.</li><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Если у аккаунта отключены отчёты о прочтении, собеседник синих галочек не увидит.</li></ul><p><b>Ответ:</b> <code>result</code> — true при успехе, false — чат не найден.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — true, если отметка отправлена; false, если чат не найден.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": true
          }
        }
      }
    }
    #swagger.responses[400] = {
      "description": "Bad Request: в теле нет chatId.",
      "content": {
        "application/json": {
          "example": {
            "success": false,
            "error": "chatId is required"
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    
    if (!chatId) {
      return sendErrorResponse(res, 400, 'chatId is required')
    }
    
    const result = await client.sendSeen(chatId)
    res.json({ success: true, result })
  } catch (error) {
    logger.error({ err: error, sessionId: req.params.sessionId, chatId: req.body.chatId }, 'Error in sendSeen')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set the display name for the user's WhatsApp account.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.body.displayName - The new display name to set for the user's WhatsApp account.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the display name, an error will be thrown.
 */
const setDisplayName = async (req, res) => {
  /*
    #swagger.summary = 'Изменить отображаемое имя профиля'
    #swagger.description = '<p>Меняет имя профиля (pushname) — его видят пользователи, у которых ваш номер не сохранён в контактах, рядом с номером в группах и в профиле.</p><p><b>Когда использовать:</b> задать название компании/бота.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если WhatsApp не позволяет менять имя (WhatsApp Web сообщает, что для аккаунта смена имени недоступна), имя не меняется и <code>result</code> = false при HTTP 200.</li><li><code>displayName</code> обязателен.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если имя изменено.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "displayName"
            ],
            "properties": {
              "displayName": {
                "type": "string",
                "description": "Новое отображаемое имя",
                "example": "Мой магазин"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — удалось ли сменить имя.",
      "content": {
        "application/json": {
          "examples": {
            "changed": {
              "summary": "Имя изменено",
              "value": {
                "success": true,
                "result": true
              }
            },
            "notAllowed": {
              "summary": "Изменение запрещено WhatsApp",
              "value": {
                "success": true,
                "result": false
              }
            }
          }
        }
      }
    }
  */
  try {
    const { displayName } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.setDisplayName(displayName)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Unarchive a chat for the user's WhatsApp account.
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {string} req.body.chatId - The ID of the chat to unarchive.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue unarchiving the chat, an error will be thrown.
 */
const unarchiveChat = async (req, res) => {
  /*
    #swagger.summary = 'Вернуть чат из архива'
    #swagger.description = '<p>Убирает чат из архива.</p><p><b>Когда использовать:</b> вернуть диалог в основной список после <code>/client/archiveChat</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li></ul><p><b>Ответ:</b> <code>result</code> — новое состояние архива (всегда <code>false</code>, это не признак ошибки).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Чат разархивирован (result: false — чат больше не в архиве).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": false
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.unarchiveChat(chatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Unmutes the chat identified by chatId using the client associated with the given sessionId.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const unmuteChat = async (req, res) => {
  /*
    #swagger.summary = 'Включить уведомления чата'
    #swagger.description = '<p>Снимает режим «без звука» с чата.</p><p><b>Когда использовать:</b> отменить <code>/client/muteChat</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li></ul><p><b>Ответ:</b> <code>result.isMuted</code> — заглушен ли чат после операции (ожидается false), <code>result.muteExpiration</code> — время окончания заглушки (0 — не заглушен).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Новое состояние уведомлений.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": {
              "isMuted": false,
              "muteExpiration": 0
            }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.unmuteChat(chatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Unpins the chat identified by chatId using the client associated with the given sessionId.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unpin.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const unpinChat = async (req, res) => {
  /*
    #swagger.summary = 'Открепить чат'
    #swagger.description = '<p>Открепляет чат.</p><p><b>Когда использовать:</b> отменить <code>/client/pinChat</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li></ul><p><b>Ответ:</b> <code>result</code> — новое состояние закрепления, всегда <code>false</code> (в том числе если чат не был закреплён).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Чат откреплён.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": false
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.unpinChat(chatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Update the profile Picture of the session user
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} req.body.media - The new profile picture to set for the user's WhatsApp account.
 * @param {string} req.params.sessionId - The ID of the session for the user.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue setting the profile picture, an error will be thrown.
 */

const setProfilePicture = async (req, res) => {
  /*
    #swagger.summary = 'Установить фото профиля'
    #swagger.description = '<p>Устанавливает фото профиля текущего аккаунта из изображения в base64.</p><p><b>Когда использовать:</b> задать логотип компании/бота.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Передавайте изображение (JPEG/PNG); оно автоматически обрезается и масштабируется до 640×640 (миниатюра 96×96). Используйте квадратные изображения.</li><li><code>pictureData</code> — чистый base64 без префикса <code>data:image/...;base64,</code>.</li><li>Размер тела ограничен <code>MAX_ATTACHMENT_SIZE</code> + 1 МБ.</li><li>Не изображение (например application/pdf) — ошибка 500 <code>Media is not an image</code>.</li><li>Если WhatsApp отклонил изменение, <code>result</code> = false при HTTP 200.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если фото обновлено.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "pictureMimetype",
              "pictureData"
            ],
            "properties": {
              "pictureMimetype": {
                "type": "string",
                "description": "MIME-тип изображения",
                "example": "image/png"
              },
              "pictureData": {
                "type": "string",
                "description": "Изображение в base64 (без префикса data:)",
                "example": "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII="
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — обновлено ли фото.",
      "content": {
        "application/json": {
          "examples": {
            "ok": {
              "summary": "Фото обновлено",
              "value": {
                "success": true,
                "result": true
              }
            },
            "rejected": {
              "summary": "WhatsApp отклонил изменение",
              "value": {
                "success": true,
                "result": false
              }
            }
          }
        }
      }
    }
  */

  try {
    const { pictureMimetype, pictureData } = req.body
    const client = sessions.get(req.params.sessionId)
    const media = new MessageMedia(pictureMimetype, pictureData)
    const result = await client.setProfilePicture(media)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Delete the profile Picture of the session user
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue deleting the profile picture, an error will be thrown.
 */

const deleteProfilePicture = async (req, res) => {
  /*
    #swagger.summary = 'Удалить фото профиля'
    #swagger.description = '<p>Удаляет фото профиля текущего аккаунта.</p><p><b>Когда использовать:</b> сбросить аватар. Действие нельзя отменить — для восстановления загрузите фото заново через <code>/client/setProfilePicture</code>.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>result</code> — true, если фото удалено.</p>'
    #swagger.responses[200] = {
      "description": "result — удалено ли фото.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": true
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const result = await client.deleteProfilePicture()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set auto load download audio value
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue deleting the profile picture, an error will be thrown.
 */

const setAutoDownloadAudio = async (req, res) => {
  /*
    #swagger.summary = 'Автозагрузка аудио: вкл/выкл'
    #swagger.description = '<p>Включает или выключает автоматическую загрузку аудио в WhatsApp Web этой сессии (настройка «Автозагрузка медиа»).</p><p><b>Когда использовать:</b> выключите, чтобы экономить трафик и место на сервере, если аудио не нужны; включите, если нужно, чтобы медиа были доступны сразу.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>flag</code> — boolean (<code>true</code>/<code>false</code>), не строка.</li><li>Это настройка интерфейса WhatsApp Web; скачивание через <code>/message/downloadMedia</code> и событие webhook <code>media</code> работают независимо от неё.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "flag"
            ],
            "properties": {
              "flag": {
                "type": "boolean",
                "description": "true — включить, false — выключить",
                "example": true
              }
            }
          },
          "examples": {
            "on": {
              "summary": "Включить",
              "value": {
                "flag": true
              }
            },
            "off": {
              "summary": "Выключить",
              "value": {
                "flag": false
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Настройка сохранена.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { flag } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setAutoDownloadAudio(flag)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set auto load download documents value
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue deleting the profile picture, an error will be thrown.
 */

const setAutoDownloadDocuments = async (req, res) => {
  /*
    #swagger.summary = 'Автозагрузка документов: вкл/выкл'
    #swagger.description = '<p>Включает или выключает автоматическую загрузку документов в WhatsApp Web этой сессии (настройка «Автозагрузка медиа»).</p><p><b>Когда использовать:</b> выключите, чтобы экономить трафик и место на сервере, если документы не нужны; включите, если нужно, чтобы медиа были доступны сразу.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>flag</code> — boolean (<code>true</code>/<code>false</code>), не строка.</li><li>Это настройка интерфейса WhatsApp Web; скачивание через <code>/message/downloadMedia</code> и событие webhook <code>media</code> работают независимо от неё.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "flag"
            ],
            "properties": {
              "flag": {
                "type": "boolean",
                "description": "true — включить, false — выключить",
                "example": true
              }
            }
          },
          "examples": {
            "on": {
              "summary": "Включить",
              "value": {
                "flag": true
              }
            },
            "off": {
              "summary": "Выключить",
              "value": {
                "flag": false
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Настройка сохранена.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { flag } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setAutoDownloadDocuments(flag)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set auto load download photos value
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue deleting the profile picture, an error will be thrown.
 */

const setAutoDownloadPhotos = async (req, res) => {
  /*
    #swagger.summary = 'Автозагрузка фото: вкл/выкл'
    #swagger.description = '<p>Включает или выключает автоматическую загрузку фото в WhatsApp Web этой сессии (настройка «Автозагрузка медиа»).</p><p><b>Когда использовать:</b> выключите, чтобы экономить трафик и место на сервере, если фото не нужны; включите, если нужно, чтобы медиа были доступны сразу.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>flag</code> — boolean (<code>true</code>/<code>false</code>), не строка.</li><li>Это настройка интерфейса WhatsApp Web; скачивание через <code>/message/downloadMedia</code> и событие webhook <code>media</code> работают независимо от неё.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "flag"
            ],
            "properties": {
              "flag": {
                "type": "boolean",
                "description": "true — включить, false — выключить",
                "example": true
              }
            }
          },
          "examples": {
            "on": {
              "summary": "Включить",
              "value": {
                "flag": true
              }
            },
            "off": {
              "summary": "Выключить",
              "value": {
                "flag": false
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Настройка сохранена.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { flag } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setAutoDownloadPhotos(flag)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Set auto load download videos value
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} Returns a JSON object with a success status and the result of the function.
 * @throws {Error} If there is an issue deleting the profile picture, an error will be thrown.
 */

const setAutoDownloadVideos = async (req, res) => {
  /*
    #swagger.summary = 'Автозагрузка видео: вкл/выкл'
    #swagger.description = '<p>Включает или выключает автоматическую загрузку видео в WhatsApp Web этой сессии (настройка «Автозагрузка медиа»).</p><p><b>Когда использовать:</b> выключите, чтобы экономить трафик и место на сервере, если видео не нужны; включите, если нужно, чтобы медиа были доступны сразу.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>flag</code> — boolean (<code>true</code>/<code>false</code>), не строка.</li><li>Это настройка интерфейса WhatsApp Web; скачивание через <code>/message/downloadMedia</code> и событие webhook <code>media</code> работают независимо от неё.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "flag"
            ],
            "properties": {
              "flag": {
                "type": "boolean",
                "description": "true — включить, false — выключить",
                "example": true
              }
            }
          },
          "examples": {
            "on": {
              "summary": "Включить",
              "value": {
                "flag": true
              }
            },
            "off": {
              "summary": "Выключить",
              "value": {
                "flag": false
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Настройка сохранена.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { flag } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setAutoDownloadVideos(flag)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Sync chat history conversation.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const syncHistory = async (req, res) => {
  /*
    #swagger.summary = 'Запросить синхронизацию истории чата с телефона'
    #swagger.description = '<p>Запрашивает у телефона догрузку истории сообщений чата, если она ещё не была полностью перенесена в WhatsApp Web.</p><p><b>Когда использовать:</b> когда <code>/chat/fetchMessages</code> возвращает меньше сообщений, чем есть на телефоне.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Запрос отправляется, только если перенос истории для чата не завершён; иначе ничего не делается и <code>result</code> = false.</li><li>Синхронизация асинхронна: сообщения появятся позже, телефон должен быть онлайн.</li></ul><p><b>Ответ:</b> <code>result</code> — true, если запрос на синхронизацию отправлен.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — был ли отправлен запрос.",
      "content": {
        "application/json": {
          "examples": {
            "requested": {
              "summary": "Запрос отправлен",
              "value": {
                "success": true,
                "result": true
              }
            },
            "notNeeded": {
              "summary": "Синхронизация не требуется/невозможна",
              "value": {
                "success": true,
                "result": false
              }
            }
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.syncHistory(chatId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get user device count by ID.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const getContactDeviceCount = async (req, res) => {
  /*
    #swagger.summary = 'Количество устройств пользователя'
    #swagger.description = '<p>Возвращает число устройств, привязанных к аккаунту пользователя: телефон (если есть) плюс каждое подключение WhatsApp Web/Desktop. Для обычного пользователя с одним WhatsApp Web ожидается 2.</p><p><b>Когда использовать:</b> диагностика, грубая оценка активности аккаунта.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Поле называется <code>userId</code> (не <code>chatId</code> и не <code>contactId</code>); формат <code>79991234567@c.us</code>.</li><li>Если данные получить не удалось, возвращается 0.</li></ul><p><b>Ответ:</b> <code>result</code> — число устройств.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "userId"
            ],
            "properties": {
              "userId": {
                "type": "string",
                "description": "id пользователя (...@c.us)",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — количество устройств (0, если неизвестно).",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": 2
          }
        }
      }
    }
  */
  try {
    const { userId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getContactDeviceCount(userId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get the country code of a WhatsApp ID.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const getCountryCode = async (req, res) => {
  /*
    #swagger.summary = 'Код страны номера'
    #swagger.description = '<p>Определяет телефонный код страны по номеру средствами WhatsApp Web.</p><p><b>Когда использовать:</b> группировка клиентов по странам, валидация номеров.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>number</code> обязателен (строка); первый пробел, <code>+</code> и суффикс <code>@c.us</code> удаляются автоматически, но лучше передавать только цифры.</li></ul><p><b>Ответ:</b> <code>result</code> — код страны.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "number"
            ],
            "properties": {
              "number": {
                "type": "string",
                "description": "Номер в международном формате только цифрами (79991234567) или id 79991234567@c.us. Без +, пробелов, скобок и дефисов",
                "example": "79991234567"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — код страны.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": "7"
          }
        }
      }
    }
  */
  try {
    const { number } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getCountryCode(number)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get the formatted number of a WhatsApp ID.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const getFormattedNumber = async (req, res) => {
  /*
    #swagger.summary = 'Номер в читаемом формате'
    #swagger.description = '<p>Возвращает номер, отформатированный по правилам страны (как его показывает WhatsApp).</p><p><b>Когда использовать:</b> вывод номера человеку в интерфейсе.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>number</code> обязателен; принимаются цифры (<code>79991234567</code>) или id <code>79991234567@c.us</code>.</li></ul><p><b>Ответ:</b> <code>result</code> — строка вида <code>+7 999 123-45-67</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "number"
            ],
            "properties": {
              "number": {
                "type": "string",
                "description": "Номер в международном формате только цифрами (79991234567) или id 79991234567@c.us. Без +, пробелов, скобок и дефисов",
                "example": "79991234567"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — отформатированный номер.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": "+7 999 123-45-67"
          }
        }
      }
    }
  */
  try {
    const { number } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getFormattedNumber(number)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Open the chat window.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const openChatWindow = async (req, res) => {
  /*
    #swagger.summary = 'Открыть чат в окне WhatsApp Web сессии'
    #swagger.description = '<p>Открывает указанный чат в интерфейсе WhatsApp Web внутри браузера сессии (как клик по чату).</p><p><b>Когда использовать:</b> отладка вместе с <code>/session/getPageScreenshot</code>; иногда помогает «разбудить» загрузку сообщений чата.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>chatId</code> — строго <code>79991234567@c.us</code> или <code>...@g.us</code>; номер без <code>@c.us</code>, с <code>+</code> или пробелами приведёт к ошибке 500 или к действию над несуществующим чатом.</li><li>Влияет только на страницу браузера на сервере, не на телефон.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "chatId"
            ],
            "properties": {
              "chatId": {
                "type": "string",
                "description": "id чата: личный <код страны><номер>@c.us (только цифры, без + и пробелов) или группа ...@g.us",
                "example": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Чат открыт.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { chatId } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.interface.openChatWindow(chatId)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Open or scroll the chat window to the position of the message.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const openChatWindowAt = async (req, res) => {
  /*
    #swagger.summary = 'Открыть чат на позиции сообщения'
    #swagger.description = '<p>Открывает чат, которому принадлежит сообщение, и прокручивает его к этому сообщению в интерфейсе WhatsApp Web сессии.</p><p><b>Когда использовать:</b> отладка (вместе с <code>/session/getPageScreenshot</code>), подгрузка контекста вокруг старого сообщения.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Здесь нужен <b>полный сериализованный</b> id (<code>message.id._serialized</code>, например <code>false_79991234567@c.us_3EB0A1B2C3D4E5F60718</code>), а не короткий <code>id.id</code>, как в <code>/message/...</code>.</li><li>Если сообщение не найдено, ответ 500.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "messageId"
            ],
            "properties": {
              "messageId": {
                "type": "string",
                "description": "Сериализованный id сообщения (message.id._serialized)",
                "example": "false_79991234567@c.us_3EB0A1B2C3D4E5F60718"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Чат открыт на сообщении.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { messageId } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.interface.openChatWindowAt(messageId)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Force reset of connection state for the client.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const resetState = async (req, res) => {
  /*
    #swagger.summary = 'Принудительно переподключить WhatsApp Web'
    #swagger.description = '<p>Заставляет WhatsApp Web сессии заново установить соединение с серверами WhatsApp (без перезапуска браузера и без выхода из аккаунта).</p><p><b>Когда использовать:</b> сообщения «зависли», состояние не CONNECTED после сбоя сети. Если не помогло — <code>/session/restart/{sessionId}</code>.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> только <code>success</code>; результат переподключения отслеживайте через <code>/session/status</code> или событие webhook <code>change_state</code>.</p>'
    #swagger.responses[200] = {
      "description": "Переподключение запущено.",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    await client.resetState()
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Change the background synchronization setting.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const setBackgroundSync = async (req, res) => {
  /*
    #swagger.summary = 'Фоновая синхронизация: вкл/выкл'
    #swagger.description = '<p>Меняет настройку фоновой синхронизации WhatsApp Web (получение уведомлений/данных в фоне).</p><p><b>Когда использовать:</b> тонкая настройка поведения сессии.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Изменение вступает в силу только после перезапуска клиента (<code>/session/restart/{sessionId}</code>).</li><li><code>flag</code> по умолчанию <code>true</code>, если не передан.</li></ul><p><b>Ответ:</b> только <code>success</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [],
            "properties": {
              "flag": {
                "type": "boolean",
                "description": "true — включить, false — выключить. По умолчанию true",
                "example": true
              }
            }
          },
          "examples": {
            "on": {
              "summary": "Включить",
              "value": {
                "flag": true
              }
            },
            "off": {
              "summary": "Выключить",
              "value": {
                "flag": false
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Настройка сохранена (применится после перезапуска).",
      "content": {
        "application/json": {
          "example": {
            "success": true
          }
        }
      }
    }
  */
  try {
    const { flag = true } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setBackgroundSync(flag)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Retrieve the contact lid and phone number for a specific chat.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.chatId - The unique identifier of the chat to unmute.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const getContactLidAndPhone = async (req, res) => {
  /*
    #swagger.summary = 'Сопоставить LID и номер телефона'
    #swagger.description = '<p>Для каждого id возвращает пару: скрытый идентификатор LID (<code>...@lid</code>) и id по номеру телефона (<code>...@c.us</code>). Работает в обе стороны: можно передать номер или LID.</p><p><b>Когда использовать:</b> в группах и сообществах WhatsApp всё чаще присылает участников и авторов сообщений как <code>...@lid</code> — этим методом можно узнать их номер (и наоборот).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Поле — массив <code>userIds</code> (по умолчанию пустой — тогда вернётся пустой массив).</li><li>Если пару определить не удалось (номер не в WhatsApp, LID скрыт), элемент результата будет пустым объектом <code>{}</code> или без одного из полей.</li><li>Порядок результатов совпадает с порядком <code>userIds</code>.</li></ul><p><b>Ответ:</b> <code>data</code> — массив <code>{lid, pn}</code>.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "userIds"
            ],
            "properties": {
              "userIds": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "id пользователей: ...@c.us и/или ...@lid",
                "example": [
                  "79991234567@c.us",
                  "123456789012345@lid"
                ]
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "data — массив пар {lid, pn} в порядке userIds; {} — не удалось определить.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "data": [
              {
                "lid": "123456789012345@lid",
                "pn": "79991234567@c.us"
              },
              {}
            ]
          }
        }
      }
    }
  */
  try {
    const { userIds = [] } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getContactLidAndPhone(userIds)
    res.json({ success: true, data: result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets all cached Channel instances.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const getChannels = async (req, res) => {
  /*
    #swagger.summary = 'Список каналов, известных сессии'
    #swagger.description = '<p>Возвращает каналы (newsletter), на которые подписан аккаунт или которые он создал (все каналы, загруженные в WhatsApp Web).</p><p><b>Когда использовать:</b> получить id каналов (<code>...@newsletter</code>) для <code>/channel/...</code> и <code>/client/sendMessage</code>.</p><p><b>Тело запроса не требуется</b> (sessionId передаётся в пути).</p><p><b>Ответ:</b> <code>result</code> — массив объектов Channel.</p>'
    #swagger.responses[200] = {
      "description": "Массив каналов.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": [
              {
                "channelMetadata": {
                  "createdAtTs": 1700000000
                },
                "id": {
                  "server": "newsletter",
                  "user": "120363098765432101",
                  "_serialized": "120363098765432101@newsletter"
                },
                "name": "Новости магазина",
                "description": "Акции и новинки",
                "isChannel": true,
                "isGroup": false,
                "isReadOnly": true,
                "unreadCount": 0,
                "timestamp": 1730000000,
                "isMuted": false,
                "muteExpiration": 0
              }
            ]
          }
        }
      }
    }
  */
  try {
    const client = sessions.get(req.params.sessionId)
    const result = await client.getChannels()
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Creates a new channel.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const createChannel = async (req, res) => {
  /*
    #swagger.summary = 'Создать канал'
    #swagger.description = '<p>Создаёт новый канал WhatsApp (newsletter) от имени аккаунта.</p><p><b>Когда использовать:</b> автоматическое создание канала для рассылок. Публикации — через <code>/client/sendMessage</code> или <code>/channel/sendMessage</code> с id канала.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если создание каналов недоступно аккаунту или WhatsApp вернул ошибку, ответ всё равно HTTP 200, а <code>result</code> — строка: <code>CreateChannelError: A channel creation is not enabled</code> или <code>CreateChannelError: An error occupied while creating a channel</code>. Проверяйте тип <code>result</code>.</li><li>Картинку можно передать в <code>options.picture</code> как <code>{mimetype, data}</code> (base64); она будет обрезана до 640×640 JPEG.</li></ul><p><b>Ответ:</b> <code>result.nid</code> — id канала, <code>result.inviteLink</code> — ссылка-приглашение, <code>result.createdAtTs</code> — время создания.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "title"
            ],
            "properties": {
              "title": {
                "type": "string",
                "description": "Название канала",
                "example": "Новости магазина"
              },
              "options": {
                "type": "object",
                "description": "Необязательные параметры",
                "properties": {
                  "description": {
                    "type": "string",
                    "description": "Описание канала",
                    "example": "Акции и новинки"
                  },
                  "picture": {
                    "type": "object",
                    "description": "Аватар канала: {mimetype, data (base64)}",
                    "example": {
                      "mimetype": "image/png",
                      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
                    }
                  }
                }
              }
            }
          },
          "examples": {
            "simple": {
              "summary": "Только название",
              "value": {
                "title": "Новости магазина"
              }
            },
            "withDescription": {
              "summary": "С описанием",
              "value": {
                "title": "Новости магазина",
                "options": {
                  "description": "Акции и новинки"
                }
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — объект созданного канала или строка с ошибкой (HTTP 200).",
      "content": {
        "application/json": {
          "examples": {
            "created": {
              "summary": "Канал создан",
              "value": {
                "success": true,
                "result": {
                  "title": "Новости магазина",
                  "nid": {
                    "server": "newsletter",
                    "user": "120363098765432101",
                    "_serialized": "120363098765432101@newsletter"
                  },
                  "inviteLink": "https://whatsapp.com/channel/0029VaAbCdEfGhIjKlMnOp1q",
                  "createdAtTs": 1730000000
                }
              }
            },
            "disabled": {
              "summary": "Создание каналов недоступно",
              "value": {
                "success": true,
                "result": "CreateChannelError: A channel creation is not enabled"
              }
            }
          }
        }
      }
    }
  */
  try {
    const { title, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = options ? await client.createChannel(title, options) : await client.createChannel(title)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Subscribes to a new channel.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const subscribeToChannel = async (req, res) => {
  /*
    #swagger.summary = 'Подписаться на канал'
    #swagger.description = '<p>Подписывает аккаунт на канал.</p><p><b>Когда использовать:</b> чтобы получать публикации канала. id канала можно найти через <code>/client/searchChannels</code> или <code>/client/getChannelByInviteCode</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>channelId</code> — формат <code>...@newsletter</code>, не ссылка и не код приглашения.</li></ul><p><b>Ответ:</b> <code>result</code> — true при успехе, false — если операция не выполнена.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "channelId"
            ],
            "properties": {
              "channelId": {
                "type": "string",
                "description": "id канала в формате ...@newsletter",
                "example": "120363098765432101@newsletter"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — успех операции.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": true
          }
        }
      }
    }
  */
  try {
    const { channelId } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.subscribeToChannel(channelId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Unsubscribe from a channel.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const unsubscribeFromChannel = async (req, res) => {
  /*
    #swagger.summary = 'Отписаться от канала'
    #swagger.description = '<p>Отписывает аккаунт от канала.</p><p><b>Когда использовать:</b> прекратить получать публикации канала.</p><p><b>Ограничения и подводные камни:</b></p><ul><li><code>options.deleteLocalModels</code> = true полностью удаляет канал из локальной коллекции (будто вы с ним не взаимодействовали); по умолчанию false — канал остаётся с ролью гостя.</li></ul><p><b>Ответ:</b> <code>result</code> — true при успехе.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "channelId"
            ],
            "properties": {
              "channelId": {
                "type": "string",
                "description": "id канала в формате ...@newsletter",
                "example": "120363098765432101@newsletter"
              },
              "options": {
                "type": "object",
                "description": "Необязательные параметры",
                "properties": {
                  "deleteLocalModels": {
                    "type": "boolean",
                    "description": "Удалить канал из локальной коллекции (по умолчанию false)",
                    "example": false
                  }
                }
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — успех операции.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": true
          }
        }
      }
    }
  */
  try {
    const { channelId, options } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = options ? await client.unsubscribeFromChannel(channelId, options) : await client.unsubscribeFromChannel(channelId)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Search channels.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const searchChannels = async (req, res) => {
  /*
    #swagger.summary = 'Поиск каналов'
    #swagger.description = '<p>Ищет каналы WhatsApp по тексту и/или стране, либо возвращает подборки (рекомендуемые, популярные и т.п.).</p><p><b>Когда использовать:</b> найти канал для подписки или проверить существование канала по названию.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Находит только каналы, на которые вы <b>не</b> подписаны.</li><li><code>view</code> учитывается только при пустом <code>searchText</code>: 0 — RECOMMENDED, 1 — TRENDING, 2 — POPULAR, 3 — NEW; другое значение заменяется на 0.</li><li><code>countryCodes</code> — коды ISO 3166-1 alpha-2 (<code>RU</code>, <code>US</code>); по умолчанию — регион аккаунта. Неизвестные коды отбрасываются.</li><li>У каналов, с которыми вы не взаимодействовали, нет <code>lastMessage</code>.</li></ul><p><b>Ответ:</b> <code>result</code> — массив объектов Channel (пустой, если ничего не найдено).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [],
            "properties": {
              "searchOptions": {
                "type": "object",
                "description": "Параметры поиска (по умолчанию {})",
                "properties": {
                  "searchText": {
                    "type": "string",
                    "description": "Текст для поиска в названиях каналов (по умолчанию пусто)",
                    "example": "новости"
                  },
                  "countryCodes": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Страны ISO 3166-1 alpha-2 (по умолчанию — регион аккаунта)",
                    "example": [
                      "RU"
                    ]
                  },
                  "skipSubscribedNewsletters": {
                    "type": "boolean",
                    "description": "Не показывать каналы, на которые вы подписаны (по умолчанию false)",
                    "example": true
                  },
                  "view": {
                    "type": "number",
                    "enum": [
                      0,
                      1,
                      2,
                      3
                    ],
                    "description": "Подборка при пустом searchText: 0 RECOMMENDED, 1 TRENDING, 2 POPULAR, 3 NEW (по умолчанию 0)",
                    "example": 0
                  },
                  "limit": {
                    "type": "number",
                    "description": "Максимум результатов (по умолчанию 50)",
                    "example": 10
                  }
                }
              }
            }
          },
          "examples": {
            "text": {
              "summary": "По тексту в России",
              "value": {
                "searchOptions": {
                  "searchText": "новости",
                  "countryCodes": [
                    "RU"
                  ],
                  "limit": 10
                }
              }
            },
            "popular": {
              "summary": "Популярные каналы",
              "value": {
                "searchOptions": {
                  "view": 2,
                  "limit": 20
                }
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "Найденные каналы.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "result": [
              {
                "channelMetadata": {
                  "createdAtTs": 1700000000
                },
                "id": {
                  "server": "newsletter",
                  "user": "120363098765432101",
                  "_serialized": "120363098765432101@newsletter"
                },
                "name": "Новости магазина",
                "description": "Акции и новинки",
                "isChannel": true,
                "isGroup": false,
                "isReadOnly": true,
                "unreadCount": 0,
                "timestamp": 1730000000,
                "isMuted": false,
                "muteExpiration": 0
              }
            ]
          }
        }
      }
    }
  */
  try {
    const { searchOptions = {} } = req.body
    const client = sessions.get(req.params.sessionId)
    const foundChannels = await client.searchChannels(searchOptions)
    res.json({ success: true, result: foundChannels })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Gets a Channel instance by invite code.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.inviteCode - The unique identifier of the channel to retrieve.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const getChannelByInviteCode = async (req, res) => {
  /*
    #swagger.summary = 'Найти канал по коду приглашения'
    #swagger.description = '<p>Возвращает канал по коду из ссылки вида <code>https://whatsapp.com/channel/КОД</code>.</p><p><b>Когда использовать:</b> узнать id канала (<code>...@newsletter</code>) по публичной ссылке, затем подписаться через <code>/client/subscribeToChannel</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Передавайте только код — часть после <code>https://whatsapp.com/channel/</code>.</li><li>Если канал не найден, поле <code>result</code> в ответе <b>отсутствует</b> (HTTP 200).</li></ul><p><b>Ответ:</b> <code>result</code> — объект Channel.</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "inviteCode"
            ],
            "properties": {
              "inviteCode": {
                "type": "string",
                "description": "Код после https://whatsapp.com/channel/",
                "example": "0029VaAbCdEfGhIjKlMnOp1q"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "result — канал; отсутствует, если канал не найден.",
      "content": {
        "application/json": {
          "examples": {
            "found": {
              "summary": "Канал найден",
              "value": {
                "success": true,
                "result": {
                  "channelMetadata": {
                    "createdAtTs": 1700000000
                  },
                  "id": {
                    "server": "newsletter",
                    "user": "120363098765432101",
                    "_serialized": "120363098765432101@newsletter"
                  },
                  "name": "Новости магазина",
                  "description": "Акции и новинки",
                  "isChannel": true,
                  "isGroup": false,
                  "isReadOnly": true,
                  "unreadCount": 0,
                  "timestamp": 1730000000,
                  "isMuted": false,
                  "muteExpiration": 0
                }
              }
            },
            "notFound": {
              "summary": "Канал не найден",
              "value": {
                "success": true
              }
            }
          }
        }
      }
    }
  */
  try {
    const { inviteCode } = req.body
    const client = sessions.get(req.params.sessionId)
    const result = await client.getChannelByInviteCode(inviteCode)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Executes a method on the client associated with the given sessionId.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const runMethod = async (req, res) => {
  /*
    #swagger.summary = 'Вызвать произвольный метод клиента whatsapp-web.js'
    #swagger.description = '<p>Вызывает метод объекта <code>Client</code> библиотеки whatsapp-web.js по имени и возвращает результат. Если <code>options</code> передан и «истинный», он передаётся методу <b>единственным</b> аргументом; иначе метод вызывается без аргументов.</p><p><b>Когда использовать:</b> только если нужного метода нет в API (например <code>getBroadcasts</code>, <code>getPinnedMessages</code>). Список методов — в документации whatsapp-web.js для класса Client.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Нельзя передать несколько аргументов: методы, которым нужно 2+ параметра, вызвать корректно не получится.</li><li>Значения <code>options</code> вроде <code>0</code>, <code>false</code>, пустой строки считаются отсутствующими — метод будет вызван без аргументов.</li><li>Если такого метода нет — 500 <code>Method is not implemented</code>.</li><li><b>Опасно:</b> можно вызвать любой метод клиента, включая <code>logout</code> и <code>destroy</code> (выход из аккаунта / остановка браузера). Не открывайте этот эндпоинт без <code>API_KEY</code>.</li><li>Результат сериализуется в JSON как есть; объекты с циклическими ссылками приведут к ошибке.</li></ul><p><b>Ответ:</b> <code>data</code> — то, что вернул метод (поле отсутствует, если метод ничего не вернул).</p>'
    #swagger.requestBody = {
      "required": true,
      "@content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": [
              "method"
            ],
            "properties": {
              "method": {
                "type": "string",
                "description": "Имя метода Client whatsapp-web.js",
                "example": "getLabels"
              },
              "options": {
                "oneOf": [
                  {
                    "type": "object"
                  },
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "boolean"
                  },
                  {
                    "type": "array"
                  }
                ],
                "description": "Единственный аргумент для метода (необязателен)"
              }
            }
          },
          "examples": {
            "noArgs": {
              "summary": "Метод без аргументов",
              "value": {
                "method": "getWWebVersion"
              }
            },
            "oneArg": {
              "summary": "Метод с одним аргументом",
              "value": {
                "method": "getPinnedMessages",
                "options": "79991234567@c.us"
              }
            }
          }
        }
      }
    }
    #swagger.responses[200] = {
      "description": "data — результат вызова метода.",
      "content": {
        "application/json": {
          "example": {
            "success": true,
            "data": "2.3000.1023456789"
          }
        }
      }
    }
    #swagger.responses[500] = {
      "description": "Method is not implemented — у Client нет метода с таким именем; иначе — исключение, брошенное вызванным методом.",
      "content": {
        "application/json": {
          "examples": {
            "notImplemented": {
              "summary": "Нет такого метода",
              "value": {
                "success": false,
                "error": "Method is not implemented"
              }
            },
            "other": {
              "summary": "Ошибка внутри метода",
              "value": {
                "success": false,
                "error": "Protocol error (Runtime.callFunctionOn): Target closed."
              }
            }
          }
        }
      }
    }
  */
  try {
    const { method, options } = req.body
    const client = sessions.get(req.params.sessionId)
    if (typeof client[method] !== 'function') {
      throw new Error('Method is not implemented')
    }
    const result = options ? await client[method](options) : await client[method]()
    res.json({ success: true, data: result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  getClassInfo,
  acceptInvite,
  archiveChat,
  createGroup,
  getBlockedContacts,
  getChatById,
  getChatLabels,
  getChats,
  getChatsWithSearch,
  getChatsByLabelId,
  getCommonGroups,
  getContactById,
  getContacts,
  getInviteInfo,
  getLabelById,
  getLabels,
  addOrRemoveLabels,
  isRegisteredUser,
  getNumberId,
  getProfilePictureUrl,
  getState,
  markChatUnread,
  muteChat,
  pinChat,
  searchMessages,
  sendMessage,
  sendPresenceAvailable,
  sendPresenceUnavailable,
  sendSeen,
  setDisplayName,
  setProfilePicture,
  setStatus,
  unarchiveChat,
  unmuteChat,
  unpinChat,
  getWWebVersion,
  deleteProfilePicture,
  setAutoDownloadAudio,
  setAutoDownloadDocuments,
  setAutoDownloadPhotos,
  setAutoDownloadVideos,
  syncHistory,
  getContactDeviceCount,
  getCountryCode,
  getFormattedNumber,
  openChatWindow,
  openChatWindowAt,
  resetState,
  setBackgroundSync,
  getContactLidAndPhone,
  getChannels,
  getChannelByInviteCode,
  createChannel,
  subscribeToChannel,
  unsubscribeFromChannel,
  searchChannels,
  runMethod
}
