const fsp = require('fs').promises
const qrcode = require('qrcode-terminal')
const { sessionFolderPath } = require('../config')
const { sendErrorResponse } = require('../utils')
const { logger } = require('../logger')

/**
 * Responds to request with 'pong'
 *
 * @function ping
 * @async
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Promise that resolves once response is sent
 * @throws {Object} - Throws error if response fails
 */
const ping = async (req, res) => {
  /*
    #swagger.tags = ['Various']
    #swagger.summary = 'Проверка доступности сервера'
    #swagger.description = '<p>Отвечает <code>pong</code>, если HTTP-сервер запущен. Не проверяет состояние сессий WhatsApp.</p><p><b>Когда использовать:</b> healthcheck в Docker / балансировщике / мониторинге. Для проверки конкретного номера используйте <code>/session/status/{sessionId}</code>.</p><p><b>Особенности:</b> заголовок <code>x-api-key</code> не нужен, тело и параметры не принимаются.</p>'
    #swagger.responses[200] = {
      description: "Сервер работает.",
      content: {
        "application/json": {
          example: {
            success: true,
            message: "pong"
          }
        }
      }
    }
  */
  res.json({ success: true, message: 'pong' })
}

/**
 * Example local callback that generates a QR code and writes a log file
 *
 * @function localCallbackExample
 * @async
 * @param {Object} req - Express request object containing a body object with dataType and data
 * @param {string} req.body.dataType - Type of data (in this case, 'qr')
 * @param {Object} req.body.data - Data to generate a QR code from
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Promise that resolves once response is sent
 * @throws {Object} - Throws error if response fails
 */
const localCallbackExample = async (req, res) => {
  /*
    #swagger.tags = ['Various']
    #swagger.summary = 'Пример приёмника webhook (только для разработки)'
    #swagger.description = '<p>Встроенный пример получателя webhook. Принимает тело в формате webhook-событий этого же сервера, дописывает его строкой JSON в файл <code>SESSIONS_PATH/message_log.txt</code>, а при <code>dataType = "qr"</code> дополнительно печатает QR-код в консоль сервера.</p><p><b>Когда использовать:</b> только при разработке и тестировании: укажите <code>BASE_WEBHOOK_URL=http://localhost:3000/localCallbackExample</code>, чтобы увидеть, какие события и данные присылает сервер. В продакшене отключите (<code>ENABLE_LOCAL_CALLBACK_EXAMPLE=FALSE</code>) — маршрут тогда не существует.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Маршрут регистрируется только при <code>ENABLE_LOCAL_CALLBACK_EXAMPLE=TRUE</code>, иначе 404 от Express.</li><li>Требует <code>x-api-key</code> (сервер сам передаёт его при отправке webhook).</li><li>Единственный метод с ограничением частоты: больше <code>RATE_LIMIT_MAX</code> запросов за <code>RATE_LIMIT_WINDOW_MS</code> с одного IP → 429 (текст, не JSON).</li><li>Файл лога растёт без ограничений и содержит переписку, включая base64 медиа.</li><li>Для <code>qr</code> событие webhook содержит data URL PNG, поэтому в консоль печатается QR от этой строки, а не исходный QR WhatsApp; для сканирования используйте <code>/session/qr/{sessionId}/image</code>.</li></ul>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['dataType'],
            properties: {
              dataType: { type: 'string', description: 'Тип события webhook (message, qr, ready, authenticated, status, message_create, media и т.д.).', example: 'message' },
              data: { type: 'object', description: 'Данные события; для dataType = qr обязателен data.qr (строка), иначе 500.', example: { message: { body: 'Привет!', from: '79991234567@c.us' } } },
              sessionId: { type: 'string', description: 'id сессии, от которой пришло событие.', example: 'my-session' }
            }
          },
          examples: {
            message: { summary: 'Входящее сообщение', value: { dataType: 'message', data: { message: { id: { fromMe: false, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'false_79991234567@c.us_3EB0C767D82E4B5A1F2C' }, body: 'Привет!', type: 'chat', from: '79991234567@c.us', to: '79990000000@c.us', fromMe: false, hasMedia: false, timestamp: 1730000000 } }, sessionId: 'my-session' } },
            ready: { summary: 'Сессия готова (без data)', value: { dataType: 'ready', sessionId: 'my-session' } },
            qr: { summary: 'QR-код', value: { dataType: 'qr', data: { qr: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...' }, sessionId: 'my-session' } }
          }
        }
      }
    }
    #swagger.responses[429] = {
      description: "Too Many Requests. Превышен лимит RATE_LIMIT_MAX запросов за RATE_LIMIT_WINDOW_MS мс с одного IP. Тело — простой текст.",
      content: {
        "text/html": {
          example: "You can't make any more requests at the moment. Try again later"
        }
      }
    }
    #swagger.responses[200] = {
      description: "Событие записано в лог.",
      content: {
        "application/json": {
          example: {
            success: true
          }
        }
      }
    }
  */
  try {
    const { dataType, data } = req.body
    if (dataType === 'qr') { qrcode.generate(data.qr, { small: true }) }
    await fsp.mkdir(sessionFolderPath, { recursive: true })
    await fsp.writeFile(`${sessionFolderPath}/message_log.txt`, `${JSON.stringify(req.body)}\r\n`, { flag: 'a+' })
    res.json({ success: true })
  } catch (error) {
    /* #swagger.responses[500] = {
      description: "Server failure. Ошибка записи файла лога или неверное тело (например, dataType = qr без data.qr).",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/ErrorResponse" }
        }
      }
    }
    */
    logger.error(error, 'Failed to handle local callback')
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = { ping, localCallbackExample }
