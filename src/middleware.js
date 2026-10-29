const { globalApiKey, rateLimitMax, rateLimitWindowMs } = require('./config')
const { sendErrorResponse } = require('./utils')
const { validateSession } = require('./sessions')
const rateLimiting = require('express-rate-limit')

const apikey = async (req, res, next) => {
  /*
    #swagger.security = [{
          "apiKeyAuth": []
    }]
  */
  /* #swagger.responses[403] = {
        description: "Forbidden. На сервере задан API_KEY, а заголовок x-api-key отсутствует или не совпадает с ним. Тело: {success: false, error: 'Invalid API key'}. Если API_KEY не задан, этот ответ не возникает.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/ForbiddenResponse" }
          }
        }
      }
  */
  if (globalApiKey) {
    const apiKey = req.headers['x-api-key']
    if (!apiKey || apiKey !== globalApiKey) {
      return sendErrorResponse(res, 403, 'Invalid API key')
    }
  }
  next()
}

const sessionNameValidation = async (req, res, next) => {
  /*
    #swagger.parameters['sessionId'] = {
      in: 'path',
      description: 'Идентификатор сессии, который вы сами выбрали при /session/start. Допустимы только латинские буквы, цифры, _ и - (regex ^[A-Za-z0-9_-]+$), регистр важен. Пробелы, точки, кириллица, @ и / недопустимы (ответ 422). Пример: my-session, shop_2, f8377d8d-a589-4242-9ba6-9486a04ef80c.',
      required: true,
      type: 'string',
      example: 'my-session'
    }
  */
  if ((!/^[\w-]+$/.test(req.params.sessionId))) {
    /* #swagger.responses[422] = {
        description: "Unprocessable Entity. sessionId в пути содержит недопустимые символы (разрешены только латиница, цифры, _ и -). Тело: {success: false, error: 'Session should be alphanumerical or -'}.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/UnprocessableEntityResponse" }
          }
        }
      }
    */
    return sendErrorResponse(res, 422, 'Session should be alphanumerical or -')
  }
  next()
}

const sessionValidation = async (req, res, next) => {
  const validation = await validateSession(req.params.sessionId)
  if (validation.success !== true) {
    /* #swagger.responses[404] = {
        description: "Not Found. Сессия не готова к работе. Значения error: session_not_found (сессия с таким id не запущена — вызовите /session/start), session_not_connected (браузер запущен, но WhatsApp не авторизован или не в состоянии CONNECTED — отсканируйте QR / дождитесь события ready), browser tab closed (вкладка Chromium закрыта — /session/restart), session closed (страница не отвечает), либо текст другого исключения.",
        content: {
          "application/json": {
            schema: { "$ref": "#/definitions/NotFoundResponse" }
          }
        }
      }
    */
    return sendErrorResponse(res, 404, validation.message)
  }
  next()
}

const rateLimiter = rateLimiting({
  limit: rateLimitMax,
  windowMs: rateLimitWindowMs,
  message: "You can't make any more requests at the moment. Try again later",
  // Use real client IP when behind reverse proxy
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress
  }
})

const sessionSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Session']
    #swagger.responses[500] = {
      description: "Server failure. Исключение внутри whatsapp-web.js / Puppeteer (неверный или несуществующий id, объект не найден, вкладка браузера закрыта и т.п.). В поле error — текст исключения.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
  */
  next()
}

const clientSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Client']
    #swagger.responses[500] = {
      description: "Server failure. Исключение внутри whatsapp-web.js / Puppeteer (неверный или несуществующий id, объект не найден, вкладка браузера закрыта и т.п.). В поле error — текст исключения.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
  */
  next()
}

const contactSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Contact']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          contactId: {
            type: 'string',
            description: 'id контакта WhatsApp в формате <код страны><номер>@c.us',
            example: '79991234567@c.us'
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Исключение внутри whatsapp-web.js / Puppeteer (неверный или несуществующий id, объект не найден, вкладка браузера закрыта и т.п.). В поле error — текст исключения.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
  */
  next()
}

const messageSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Message']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'id чата, в котором находится сообщение (...@c.us или ...@g.us)',
            example: '79991234567@c.us'
          },
          messageId: {
            type: 'string',
            description: 'Короткий id сообщения (поле message.id.id, не _serialized)',
            example: '3EB0C767D82E4B5A1F2C'
          }
        }
      }
    }
  */
  next()
}

const chatSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Chat']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'id чата: личный ...@c.us или группа ...@g.us',
            example: '79991234567@c.us'
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Исключение внутри whatsapp-web.js / Puppeteer (неверный или несуществующий id, объект не найден, вкладка браузера закрыта и т.п.). В поле error — текст исключения.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
  */
  next()
}

const groupChatSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Group Chat']
    #swagger.requestBody = {
      required: true,
      schema: {
        type: 'object',
        properties: {
          chatId: {
            type: 'string',
            description: 'id группы в формате ...@g.us',
            example: '120363012345678901@g.us'
          }
        }
      }
    }
    #swagger.responses[500] = {
      description: "Server failure. Исключение внутри whatsapp-web.js / Puppeteer (неверный или несуществующий id, объект не найден, вкладка браузера закрыта и т.п.). В поле error — текст исключения.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
  */
  next()
}

const channelSwagger = async (req, res, next) => {
  /*
    #swagger.tags = ['Channel Chat']
    #swagger.responses[500] = {
      description: "Server failure. Исключение внутри whatsapp-web.js / Puppeteer (неверный или несуществующий id, объект не найден, вкладка браузера закрыта и т.п.). В поле error — текст исключения.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
  */
  next()
}

module.exports = {
  sessionValidation,
  apikey,
  sessionNameValidation,
  sessionSwagger,
  clientSwagger,
  contactSwagger,
  messageSwagger,
  chatSwagger,
  groupChatSwagger,
  channelSwagger,
  rateLimiter
}
