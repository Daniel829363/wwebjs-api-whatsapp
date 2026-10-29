const qr = require('qr-image')
const { setupSession, deleteSession, reloadSession, validateSession, flushSessions, destroySession, sessions } = require('../sessions')
const { sendErrorResponse, waitForNestedObject, exposeFunctionIfAbsent } = require('../utils')
const { logger } = require('../logger')

/**
 * Starts a session for the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error starting the session.
 */
const startSession = async (req, res) => {
  // #swagger.summary = 'Запустить сессию (открыть WhatsApp Web)'
  // #swagger.description = '<p>Создаёт клиента whatsapp-web.js с указанным sessionId, запускает для него Chromium и открывает WhatsApp Web. Если в папке <code>SESSIONS_PATH/session-{sessionId}</code> уже есть сохранённая авторизация, сессия поднимется без QR; иначе после ответа нужно привязать номер через <code>/session/qr/{sessionId}</code>, <code>/session/qr/{sessionId}/image</code> или <code>/session/requestPairingCode/{sessionId}</code>.</p><p><b>Когда использовать:</b> первый запуск нового номера, а также повторный запуск сессии после <code>/session/stop</code> или перезапуска сервера с <code>AUTO_START_SESSIONS=FALSE</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>sessionId выбираете вы сами: только латиница, цифры, <code>_</code> и <code>-</code>, регистр важен.</li><li>Ответ приходит после загрузки страницы WhatsApp Web — это может занять десятки секунд. Ответ 200 <b>не</b> означает готовность: дождитесь webhook-события <code>ready</code> или <code>state: CONNECTED</code> в <code>/session/status</code>.</li><li>Сессия появляется в <code>/session/getSessions</code> и становится доступной для остальных методов только после ответа. Не вызывайте start повторно для того же id, пока первый вызов не завершился.</li><li>Если сессия уже запущена — 422 <code>Session already exists for: {sessionId}</code> (остановите её через <code>/session/stop</code> или используйте <code>/session/restart</code>).</li><li>Первый QR-код может появиться через несколько секунд после ответа.</li></ul><p><b>Ответ:</b> <code>{success: true, message: "Session initiated successfully"}</code>.</p>'
  /* #swagger.parameters['unauthTimeoutMin'] = {
    in: 'query',
    required: false,
    type: 'integer',
    description: 'Через сколько минут остановить сессию, если QR так и не отсканировали (номер не привязан). <code>0</code> — никогда не останавливать. Не указан — берётся значение, сохранённое для этой сессии при прошлом запуске, иначе <code>UNAUTH_SESSION_TIMEOUT_MIN</code> из .env (по умолчанию 15). Значение запоминается для сессии и действует после перезапусков сервера. При остановке по таймауту приходит webhook <code>disconnected</code> с <code>{reason: "UNAUTH_TIMEOUT", timeoutMin, message}</code>; папка сессии не удаляется, её можно снова запустить. Допустимо 0–1440.',
    example: 30
  } */
  const sessionId = req.params.sessionId
  let unauthTimeoutMin
  if (req.query.unauthTimeoutMin !== undefined) {
    unauthTimeoutMin = Number(req.query.unauthTimeoutMin)
    if (!Number.isInteger(unauthTimeoutMin) || unauthTimeoutMin < 0 || unauthTimeoutMin > 1440) {
      return sendErrorResponse(res, 422, 'unauthTimeoutMin must be an integer from 0 to 1440')
    }
  }
  try {
    const setupSessionReturn = await setupSession(sessionId, { unauthTimeoutMin })
    if (!setupSessionReturn.success) {
      /* #swagger.responses[422] = {
        description: "Unprocessable Entity. Либо sessionId содержит недопустимые символы (Session should be alphanumerical or -), либо сессия с таким id уже запущена (Session already exists for: <sessionId>), либо запуск браузера / WhatsApp Web завершился ошибкой (в error — текст исключения, например не найден Chrome по пути CHROME_BIN).",
        content: {
          "application/json": {
            examples: {
              alreadyExists: { summary: 'Сессия уже запущена', value: { success: false, error: 'Session already exists for: my-session' } },
              invalidName: { summary: 'Недопустимый sessionId', value: { success: false, error: 'Session should be alphanumerical or -' } }
            }
          }
        }
      }
      */
      /* #swagger.responses[500] = {
        description: "Server failure. Например, страница браузера не была создана за 10 секунд (Timeout waiting for nested object) или другое исключение.",
        content: {
          "application/json": {
            example: { success: false, error: 'Timeout waiting for nested object' }
          }
        }
      }
      */
      sendErrorResponse(res, 422, setupSessionReturn.message)
      return
    }
    /* #swagger.responses[200] = {
      description: "Сессия создана, страница WhatsApp Web загружена. Это ещё не готовность к работе — дождитесь события ready / state CONNECTED.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/StartSessionResponse" }
        }
      }
    }
    */
    // wait until the client is created
    await waitForNestedObject(setupSessionReturn.client, 'pupPage')
    res.json({ success: true, message: setupSessionReturn.message })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to start session')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Stops a session for the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to stop.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error stopping the session.
 */
const stopSession = async (req, res) => {
  // #swagger.summary = 'Остановить сессию (авторизация сохраняется)'
  // #swagger.description = '<p>Закрывает браузер сессии, отключает её WebSocket и удаляет сессию из памяти сервера. Папка с авторизацией <b>не удаляется</b> и выхода из WhatsApp не происходит — повторный <code>/session/start/{sessionId}</code> поднимет сессию без сканирования QR.</p><p><b>Когда использовать:</b> временно отключить номер, освободить память/CPU, перед обслуживанием сервера.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Если сессия с таким id не запущена, метод всё равно отвечает 200 <code>Session stopped successfully</code> — ничего не происходит.</li><li>Ожидает отключения браузера до ~10 секунд.</li><li>Чтобы отвязать номер и удалить данные сессии, используйте <code>/session/terminate/{sessionId}</code>.</li><li>При <code>AUTO_START_SESSIONS=TRUE</code> остановленная сессия снова запустится при следующем перезапуске сервера, так как её папка остаётся.</li></ul><p><b>Ответ:</b> <code>{success: true, message: "Session stopped successfully"}</code>.</p>'
  const sessionId = req.params.sessionId
  try {
    await destroySession(sessionId)
    /* #swagger.responses[200] = {
      description: "Сессия остановлена (или не была запущена).",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/StopSessionResponse" }
        }
      }
    }
    */
    res.json({ success: true, message: 'Session stopped successfully' })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to stop session')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Status of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error getting status of the session.
 */
const statusSession = async (req, res) => {
  // #swagger.summary = 'Статус сессии (готова ли к работе)'
  // #swagger.description = '<p>Проверяет, запущена ли сессия и в каком состоянии находится WhatsApp Web. Это та же проверка, которую остальные методы выполняют перед работой.</p><p><b>Когда использовать:</b> после <code>/session/start</code> — опрашивать, пока не вернётся <code>state: "CONNECTED"</code>; для мониторинга (healthcheck) номера; перед массовой отправкой.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Всегда отвечает HTTP 200 — смотрите поле <code>success</code>. <code>success: true</code> только при <code>state = CONNECTED</code>.</li><li>Если браузер ещё запускается, ответ может задержаться до ~10 секунд.</li><li>Значения <code>message</code>: <code>session_connected</code>, <code>session_not_found</code> (сессия не запущена — <code>state: null</code>), <code>session_not_connected</code> (браузер работает, но номер не авторизован или соединение не установлено), <code>browser tab closed</code>, <code>session closed</code>, либо текст исключения.</li><li>Возможные <code>state</code> (WAState): CONNECTED, OPENING, PAIRING, UNPAIRED, UNPAIRED_IDLE, CONFLICT (WhatsApp открыт в другом месте), TIMEOUT, DEPRECATED_VERSION, PROXYBLOCK, TOS_BLOCK, SMB_TOS_BLOCK, UNLAUNCHED, либо null.</li></ul>'
  const sessionId = req.params.sessionId
  try {
    const sessionData = await validateSession(sessionId)
    /* #swagger.responses[200] = {
      description: "Состояние сессии. HTTP-код всегда 200, готовность определяется полем success.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/StatusSessionResponse" },
          examples: {
            connected: { summary: 'Сессия готова', value: { success: true, state: 'CONNECTED', message: 'session_connected' } },
            notConnected: { summary: 'Номер не привязан (ожидается QR)', value: { success: false, state: 'UNPAIRED', message: 'session_not_connected' } },
            notFound: { summary: 'Сессия не запущена', value: { success: false, state: null, message: 'session_not_found' } },
            tabClosed: { summary: 'Вкладка браузера закрыта', value: { success: false, state: null, message: 'browser tab closed' } }
          }
        }
      }
    }
    */
    res.json(sessionData)
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to get session status')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * QR code of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error getting status of the session.
 */
const sessionQrCode = async (req, res) => {
  // #swagger.summary = 'QR-код для привязки (строкой)'
  // #swagger.description = '<p>Возвращает текущий QR-код сессии в виде исходной строки (её нужно самостоятельно превратить в картинку любой QR-библиотекой). Готовую PNG-картинку отдаёт <code>/session/qr/{sessionId}/image</code>; QR также приходит webhook-событием <code>qr</code> (там уже data URL PNG).</p><p><b>Когда использовать:</b> после <code>/session/start</code> для нового номера, чтобы показать QR пользователю в своём интерфейсе. Отсканируйте его в телефоне: WhatsApp → Связанные устройства → Привязка устройства.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Всегда HTTP 200 — проверяйте <code>success</code>.</li><li>WhatsApp обновляет QR примерно каждые 20 секунд; сервер хранит последний QR 30 секунд. Запрашивайте заново, а не кэшируйте.</li><li><code>qr code not ready or already scanned</code> — QR ещё не сгенерирован (повторите через несколько секунд), срок истёк, либо номер уже авторизован (проверьте <code>/session/status</code>).</li><li><code>session_not_found</code> — сессия не запущена, сначала вызовите <code>/session/start</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, qr: "<строка>"}</code>. Заголовки запрещают кэширование.</p>'
  /* #swagger.responses[200] = {
    description: "QR-код или причина, по которой его нет (HTTP 200 во всех случаях).",
    content: {
      "application/json": {
        examples: {
          qr: { summary: 'QR готов', value: { success: true, qr: '2@Xk3vQ9mZp1a7Lw0bT8cR5sYfN2uH6jD4eK1oG9iV3qM=,f1kq0Wv7m3Q2rU8xN5zB9cE4tY6hJ0aL2sD7gF1pK3o=,Hc5yR2wE8tU1iO4pA7sD0fG3hJ6kL9zX2cV5bN8mQ1w=,lZ4xC7vB0nM3qW6eR9tY2uI5oP8aS1dF4gH7jK0lZ3x=' } },
          notReady: { summary: 'QR ещё не готов, истёк или уже отсканирован', value: { success: false, message: 'qr code not ready or already scanned' } },
          notFound: { summary: 'Сессия не запущена', value: { success: false, message: 'session_not_found' } }
        }
      }
    }
  }
  */
  const sessionId = req.params.sessionId
  try {
    const session = sessions.get(sessionId)
    if (!session) {
      return res.json({ success: false, message: 'session_not_found' })
    }
    if (session.qr) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Expires', 0)
      return res.json({ success: true, qr: session.qr })
    }
    return res.json({ success: false, message: 'qr code not ready or already scanned' })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to get session qr code')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * QR code as image of the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to start.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error getting status of the session.
 */
const sessionQrCodeImage = async (req, res) => {
  // #swagger.summary = 'QR-код для привязки (PNG-картинка)'
  // #swagger.description = '<p>Отдаёт текущий QR-код сессии готовой PNG-картинкой — её можно открыть прямо в браузере или вставить в <code>&lt;img src&gt;</code>.</p><p><b>Когда использовать:</b> быстрая привязка номера вручную: откройте URL в браузере (с заголовком <code>x-api-key</code>, если задан API_KEY) и отсканируйте телефоном (WhatsApp → Связанные устройства → Привязка устройства).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Тип ответа зависит от ситуации: при наличии QR — <code>image/png</code>, иначе — JSON с <code>success: false</code> (HTTP 200 в обоих случаях). Проверяйте заголовок <code>Content-Type</code>.</li><li>QR обновляется примерно каждые 20 секунд и хранится 30 секунд — обновляйте картинку.</li><li>Обычный тег <code>&lt;img&gt;</code> не умеет передавать заголовок x-api-key; при включённом API_KEY загружайте картинку через fetch или используйте <code>/session/qr/{sessionId}</code>.</li></ul>'
  const sessionId = req.params.sessionId
  try {
    const session = sessions.get(sessionId)
    if (!session) {
      return res.json({ success: false, message: 'session_not_found' })
    }
    if (session.qr) {
      const qrImage = qr.image(session.qr)
      /* #swagger.responses[200] = {
          description: "PNG-картинка QR-кода (Content-Type: image/png). Если QR нет — JSON (Content-Type: application/json) с success: false.",
          content: {
            "image/png": {
              schema: { type: 'string', format: 'binary' }
            },
            "application/json": {
              examples: {
                notReady: { summary: 'QR ещё не готов, истёк или уже отсканирован', value: { success: false, message: 'qr code not ready or already scanned' } },
                notFound: { summary: 'Сессия не запущена', value: { success: false, message: 'session_not_found' } }
              }
            }
          }
        }
      */
      res.writeHead(200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Expires: 0,
        'Content-Type': 'image/png'
      })
      return qrImage.pipe(res)
    }
    return res.json({ success: false, message: 'qr code not ready or already scanned' })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to get session qr code image')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Restarts the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to terminate.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the session.
 */
const restartSession = async (req, res) => {
  // #swagger.summary = 'Перезапустить сессию (браузер)'
  // #swagger.description = '<p>Закрывает все вкладки и браузер Chromium сессии (при необходимости принудительно завершает процесс) и запускает сессию заново с той же папкой авторизации. Повторное сканирование QR не требуется, если номер был авторизован.</p><p><b>Когда использовать:</b> сессия «зависла»: методы отвечают 404 <code>session closed</code> / <code>browser tab closed</code>, сообщения не приходят, <code>/session/status</code> долго не возвращает CONNECTED.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает только для запущенной сессии. Если сессия не запущена — HTTP 200 с <code>{success: false, state: null, message: "session_not_found"}</code>; используйте <code>/session/start</code>.</li><li>Ответ приходит после повторной загрузки WhatsApp Web (может занять десятки секунд); готовность — по событию <code>ready</code> или <code>/session/status</code>.</li><li>Во время перезапуска остальные методы этой сессии отвечают 404 <code>session_not_found</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, message: "Restarted successfully"}</code>.</p>'
  const sessionId = req.params.sessionId
  try {
    const validation = await validateSession(sessionId)
    if (validation.message === 'session_not_found') {
      return res.json(validation)
    }
    await reloadSession(sessionId)
    /* #swagger.responses[200] = {
      description: "Сессия перезапущена, либо (success: false) сессия не запущена.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/RestartSessionResponse" },
          examples: {
            restarted: { summary: 'Перезапущена', value: { success: true, message: 'Restarted successfully' } },
            notFound: { summary: 'Сессия не запущена', value: { success: false, state: null, message: 'session_not_found' } }
          }
        }
      }
    }
    */
    res.json({ success: true, message: 'Restarted successfully' })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to restart session')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Terminates the session with the given session ID.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @param {string} req.params.sessionId - The session ID to terminate.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the session.
 */
const terminateSession = async (req, res) => {
  // #swagger.summary = 'Удалить сессию (выход из WhatsApp + удаление данных)'
  // #swagger.description = '<p><b>Необратимо.</b> Если сессия в состоянии CONNECTED — выполняет выход из WhatsApp (устройство пропадает из «Связанных устройств» на телефоне); если браузер запущен, но не авторизован — просто закрывает его. Затем удаляет сессию из памяти и папку <code>SESSIONS_PATH/session-{sessionId}</code> с данными авторизации.</p><p><b>Когда использовать:</b> окончательно отвязать номер, сменить номер для этого sessionId, сбросить «битую» авторизацию (после этого <code>/session/start</code> потребует новый QR).</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Работает только для <b>запущенной</b> сессии. Если сессия не запущена — HTTP 200 <code>{success: false, state: null, message: "session_not_found"}</code>, папка при этом не удаляется (сначала <code>/session/start</code>, затем terminate).</li><li>Ожидает отключения браузера до ~10 секунд перед удалением папки.</li><li>Чтобы просто остановить сессию с сохранением авторизации, используйте <code>/session/stop</code>.</li></ul><p><b>Ответ:</b> <code>{success: true, message: "Logged out successfully"}</code>.</p>'
  const sessionId = req.params.sessionId
  try {
    const validation = await validateSession(sessionId)
    if (validation.message === 'session_not_found') {
      return res.json(validation)
    }
    await deleteSession(sessionId, validation)
    /* #swagger.responses[200] = {
      description: "Сессия удалена, либо (success: false) сессия не запущена.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/TerminateSessionResponse" },
          examples: {
            terminated: { summary: 'Удалена', value: { success: true, message: 'Logged out successfully' } },
            notFound: { summary: 'Сессия не запущена', value: { success: false, state: null, message: 'session_not_found' } }
          }
        }
      }
    }
    */
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to terminate session')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Terminates all inactive sessions.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the sessions.
 */
const terminateInactiveSessions = async (req, res) => {
  // #swagger.summary = 'Удалить все неактивные сессии'
  // #swagger.description = '<p><b>Необратимо.</b> Перебирает папки <code>session-*</code> в <code>SESSIONS_PATH</code>, проверяет каждую сессию и для тех, что <b>не</b> в состоянии CONNECTED, закрывает браузер и удаляет папку с авторизацией (как <code>/session/terminate</code>). Сессии в состоянии CONNECTED не трогает.</p><p><b>Когда использовать:</b> уборка «мусорных» сессий, которые так и не были авторизованы или потеряли авторизацию.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Затрагиваются только сессии, запущенные на сервере: папки остановленных (не запущенных) сессий не удаляются.</li><li>Сессия, которая в момент вызова ждёт сканирования QR или ввода кода сопряжения, тоже считается неактивной и будет удалена.</li><li>Сессии обрабатываются последовательно, запрос может длиться долго (до ~10 секунд проверки и ~10 секунд закрытия браузера на каждую сессию).</li><li>При первой ошибке перебор прерывается и возвращается 500; часть сессий может остаться неудалённой.</li></ul><p><b>Ответ:</b> <code>{success: true, message: "Flush completed successfully"}</code>.</p>'
  try {
    await flushSessions(true)
    /* #swagger.responses[200] = {
      description: "Перебор завершён.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/TerminateSessionsResponse" }
        }
      }
    }
    */
    res.json({ success: true, message: 'Flush completed successfully' })
  } catch (error) {
    logger.error(error, 'Failed to terminate inactive sessions')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Terminates all sessions.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<void>}
 * @throws {Error} If there was an error terminating the sessions.
 */
const terminateAllSessions = async (req, res) => {
  // #swagger.summary = 'Удалить ВСЕ сессии'
  // #swagger.description = '<p><b>Опасно и необратимо.</b> Перебирает папки <code>session-*</code> в <code>SESSIONS_PATH</code> и для каждой запущенной сессии выполняет то же, что <code>/session/terminate</code>: выход из WhatsApp (для CONNECTED) или закрытие браузера, затем удаление папки с авторизацией. После этого все номера придётся привязывать заново.</p><p><b>Когда использовать:</b> полный сброс сервера (тестовый стенд, переезд). В рабочей среде почти никогда.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Затрагиваются только сессии, запущенные на сервере: папки остановленных сессий остаются.</li><li>Запрос может длиться долго — сессии обрабатываются последовательно.</li><li>При первой ошибке перебор прерывается и возвращается 500; часть сессий может остаться.</li></ul><p><b>Ответ:</b> <code>{success: true, message: "Flush completed successfully"}</code>.</p>'
  try {
    await flushSessions(false)
    /* #swagger.responses[200] = {
      description: "Перебор завершён.",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/TerminateSessionsResponse" }
        }
      }
    }
    */
    res.json({ success: true, message: 'Flush completed successfully' })
  } catch (error) {
    logger.error(error, 'Failed to terminate all sessions')
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Request authentication via pairing code instead of QR code.
 *
 * @async
 * @function
 * @param {Object} req - The HTTP request object containing the chatId and sessionId.
 * @param {string} req.body.phoneNumber - The phone number in international, symbol-free format (e.g. 12025550108 for US, 551155501234 for Brazil).
 * @param {boolean} req.body.showNotification - Show notification to pair on phone number.
 * @param {string} req.params.sessionId - The unique identifier of the session associated with the client to use.
 * @param {Object} res - The HTTP response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} - If an error occurs during the operation, it is thrown and handled by the catch block.
 */
const requestPairingCode = async (req, res) => {
  /*
    #swagger.summary = 'Привязать номер по коду сопряжения (вместо QR)'
    #swagger.description = '<p>Запрашивает у WhatsApp 8-символьный код сопряжения для указанного номера. Код вводится на телефоне: WhatsApp → Связанные устройства → Привязка устройства → «Привязать по номеру телефона». Удобно, когда нет возможности отсканировать QR (сервер без экрана, телефон и сервер в разных местах).</p><p><b>Когда использовать:</b> после <code>/session/start</code> для ещё не авторизованной сессии, вместо сканирования QR.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Сессия должна быть запущена и ещё не авторизована (состояние UNPAIRED / UNPAIRED_IDLE). Для уже авторизованной сессии вызов бессмыслен.</li><li><code>phoneNumber</code> — номер того телефона, который привязывается, только цифры в международном формате: без <code>+</code>, пробелов, скобок и без <code>@c.us</code> (например <code>79991234567</code>).</li><li>Пока номер не привязан, WhatsApp каждые 3 минуты выдаёт новый код; новые коды приходят webhook-событием <code>code</code> (если оно не отключено в DISABLED_CALLBACKS). Повторный вызов метода перезапускает этот цикл.</li><li>Если сессия не запущена — HTTP 200 <code>{success: false, message: "session_not_found"}</code>.</li><li>Ошибки WhatsApp Web при запросе кода возвращаются как 500 с текстом исключения.</li></ul><p><b>Ответ:</b> <code>{success: true, result: "ABCDEFGH"}</code>, где <code>result</code> — код сопряжения.</p>'
    #swagger.requestBody = {
      required: true,
      '@content': {
        'application/json': {
          schema: {
            type: 'object',
            required: ['phoneNumber'],
            properties: {
              phoneNumber: {
                type: 'string',
                description: 'Номер привязываемого телефона в международном формате, только цифры: код страны + номер, без +, пробелов, дефисов и без @c.us.',
                example: '79991234567'
              },
              showNotification: {
                type: 'boolean',
                description: 'Показать на телефоне уведомление с предложением привязать устройство. По умолчанию true.',
                example: true
              }
            }
          },
          examples: {
            default: { summary: 'Российский номер', value: { phoneNumber: '79991234567' } },
            noNotification: { summary: 'Без уведомления на телефоне', value: { phoneNumber: '12025550108', showNotification: false } }
          }
        }
      }
    }
    #swagger.responses[200] = {
      description: "Код сопряжения, либо (success: false) сессия не запущена.",
      content: {
        "application/json": {
          examples: {
            code: { summary: 'Код получен', value: { success: true, result: 'ABCD1234' } },
            notFound: { summary: 'Сессия не запущена', value: { success: false, message: 'session_not_found' } }
          }
        }
      }
    }
  */
  try {
    const { phoneNumber, showNotification = true } = req.body
    const client = sessions.get(req.params.sessionId)
    if (!client) {
      return res.json({ success: false, message: 'session_not_found' })
    }
    // hotfix https://github.com/pedroslopez/whatsapp-web.js/pull/3706
    await exposeFunctionIfAbsent(client.pupPage, 'onCodeReceivedEvent', async (code) => {
      client.emit('code', code)
      return code
    })
    const result = await client.requestPairingCode(phoneNumber, showNotification)
    res.json({ success: true, result })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
}

/**
 * Get all sessions.
 *
 * @function
 * @async
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 * @returns {<Object>}
 */
const getSessions = async (req, res) => {
  // #swagger.summary = 'Список запущенных сессий'
  // #swagger.description = '<p>Возвращает массив sessionId всех сессий, которые сейчас запущены на сервере (находятся в памяти процесса), независимо от их состояния.</p><p><b>Когда использовать:</b> узнать, какие номера подняты на сервере; затем по каждому id проверить готовность через <code>/session/status/{sessionId}</code>.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Наличие id в списке не означает, что сессия авторизована и готова — статус здесь не возвращается.</li><li>Сохранённые, но не запущенные сессии (папки <code>session-*</code> после <code>/session/stop</code>) в список не попадают.</li><li>Сессия, которая прямо сейчас запускается через <code>/session/start</code>, появится в списке только после ответа start.</li></ul><p><b>Ответ:</b> <code>{success: true, result: ["my-session", ...]}</code>.</p>'
  /* #swagger.responses[200] = {
      description: "Массив id запущенных сессий (пустой массив, если сессий нет).",
      content: {
        "application/json": {
          schema: { "$ref": "#/definitions/GetSessionsResponse" }
        }
      }
    }
  */
  return res.json({ success: true, result: Array.from(sessions.keys()) })
}

/**
 * Get pupPage screenshot image
 *
 * @function
 * @async
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<Object>} - A Promise that resolves with a JSON object containing a success flag and the result of the operation.
 * @throws {Error} If there is an issue setting the profile picture, an error will be thrown.
 */
const getPageScreenshot = async (req, res) => {
  // #swagger.summary = 'Скриншот страницы WhatsApp Web (PNG)'
  // #swagger.description = '<p>Делает полностраничный скриншот вкладки Chromium, в которой открыт WhatsApp Web этой сессии, и отдаёт его PNG-картинкой.</p><p><b>Когда использовать:</b> диагностика — посмотреть, что реально видит браузер: QR-код, экран загрузки, требование обновить WhatsApp, предупреждение «WhatsApp открыт в другом окне», бан и т.п.</p><p><b>Ограничения и подводные камни:</b></p><ul><li>Тип ответа зависит от ситуации: при успехе <code>image/png</code>, иначе JSON с <code>success: false</code> и HTTP 200 (<code>session_not_found</code> — сессия не запущена; <code>page_not_ready</code> — вкладка браузера ещё не создана).</li><li>Работает в любом состоянии сессии, авторизация не требуется.</li><li>На скриншоте могут быть видны переписки — не публикуйте его.</li></ul>'
  const sessionId = req.params.sessionId
  try {
    const session = sessions.get(sessionId)
    if (!session) {
      return res.json({ success: false, message: 'session_not_found' })
    }

    if (!session.pupPage) {
      return res.json({ success: false, message: 'page_not_ready' })
    }

    const pngBase64String = await session.pupPage.screenshot({
      fullPage: true,
      encoding: 'base64',
      type: 'png'
    })

    /* #swagger.responses[200] = {
        description: "PNG-скриншот (Content-Type: image/png), либо JSON с success: false.",
        content: {
          "image/png": {
            schema: { type: 'string', format: 'binary' }
          },
          "application/json": {
            examples: {
              notFound: { summary: 'Сессия не запущена', value: { success: false, message: 'session_not_found' } },
              pageNotReady: { summary: 'Вкладка ещё не создана', value: { success: false, message: 'page_not_ready' } }
            }
          }
        }
      }
    */
    res.writeHead(200, {
      'Content-Type': 'image/png'
    })
    res.write(Buffer.from(pngBase64String, 'base64'))
    res.end()
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to get page screenshot')
    sendErrorResponse(res, 500, error.message)
  }
}

module.exports = {
  startSession,
  stopSession,
  statusSession,
  sessionQrCode,
  sessionQrCodeImage,
  requestPairingCode,
  restartSession,
  terminateSession,
  terminateInactiveSessions,
  terminateAllSessions,
  getSessions,
  getPageScreenshot
}
