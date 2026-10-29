const { Client, LocalAuth } = require('whatsapp-web.js')
const fs = require('fs')
const path = require('path')
const sessions = new Map()
const { baseWebhookURL, sessionFolderPath, maxAttachmentSize, setMessagesAsSeen, webVersion, webVersionCacheType, recoverSessions, chromeBin, headless, releaseBrowserLock, lowResourceMode, clearBrowserCache, unauthSessionTimeoutMin, sessionRestartHour } = require('./config')
const { triggerWebhook, waitForNestedObject, isEventEnabled, sendMessageSeenStatus, sleep, patchWWebLibrary, getMessageContactInfo } = require('./utils')
const { logger } = require('./logger')
const { initWebSocketServer, terminateWebSocketServer, triggerWebSocket } = require('./websocket')
const qrcode = require('qrcode')

// Function to validate if the session is ready
const validateSession = async (sessionId) => {
  try {
    const returnData = { success: false, state: null, message: '' }

    // Session not Connected 😢
    if (!sessions.has(sessionId) || !sessions.get(sessionId)) {
      returnData.message = 'session_not_found'
      return returnData
    }

    const client = sessions.get(sessionId)
    // wait until the client is created
    await waitForNestedObject(client, 'pupPage')
      .catch((err) => { return { success: false, state: null, message: err.message } })

    // Wait for client.pupPage to be evaluable
    let maxRetry = 0
    while (true) {
      try {
        if (client.pupPage.isClosed()) {
          return { success: false, state: null, message: 'browser tab closed' }
        }
        await Promise.race([
          client.pupPage.evaluate('1'),
          new Promise(resolve => setTimeout(resolve, 1000))
        ])
        break
      } catch (error) {
        if (maxRetry === 2) {
          return { success: false, state: null, message: 'session closed' }
        }
        maxRetry++
      }
    }

    const state = await client.getState()
    returnData.state = state
    if (state !== 'CONNECTED') {
      returnData.message = 'session_not_connected'
      return returnData
    }

    // Session Connected 🎉
    returnData.success = true
    returnData.message = 'session_connected'
    return returnData
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to validate session')
    return { success: false, state: null, message: error.message }
  }
}

// Function to handle client session restoration
const restoreSessions = () => {
  try {
    if (!fs.existsSync(sessionFolderPath)) {
      fs.mkdirSync(sessionFolderPath) // Create the session directory if it doesn't exist
    }
    // Read the contents of the folder
    fs.readdir(sessionFolderPath, async (_, files) => {
      // Iterate through the files in the parent folder
      for (const file of files) {
        // Use regular expression to extract the string from the folder name
        const match = file.match(/^session-(.+)$/)
        if (match) {
          const sessionId = match[1]
          logger.warn({ sessionId }, 'Existing session detected')
          await setupSession(sessionId)
        }
      }
    })
  } catch (error) {
    logger.error(error, 'Failed to restore sessions')
  }
}

// Per-session settings kept next to the browser profile, so they survive restarts
const sessionSettingsPath = (sessionId) => path.resolve(sessionFolderPath, `session-${sessionId}`, 'wwebjs-api-settings.json')

const readSessionSettings = async (sessionId) => {
  try {
    return JSON.parse(await fs.promises.readFile(sessionSettingsPath(sessionId), 'utf8'))
  } catch (error) {
    return {}
  }
}

const writeSessionSettings = async (sessionId, settings) => {
  const file = sessionSettingsPath(sessionId)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, JSON.stringify(settings, null, 2))
}

// Setup Session
// options.unauthTimeoutMin - minutes to wait for the QR to be scanned before stopping the session (0 = never)
const setupSession = async (sessionId, options = {}) => {
  try {
    if (sessions.has(sessionId)) {
      return { success: false, message: `Session already exists for: ${sessionId}`, client: sessions.get(sessionId) }
    }
    const settings = await readSessionSettings(sessionId)
    if (Number.isInteger(options.unauthTimeoutMin)) {
      settings.unauthTimeoutMin = options.unauthTimeoutMin
      await writeSessionSettings(sessionId, settings)
    }
    const sessionUnauthTimeoutMin = Number.isInteger(settings.unauthTimeoutMin) ? settings.unauthTimeoutMin : unauthSessionTimeoutMin
    logger.info({ sessionId }, 'Session is being initiated')
    // Disable the delete folder from the logout function (will be handled separately)
    const localAuth = new LocalAuth({ clientId: sessionId, dataPath: sessionFolderPath })
    delete localAuth.logout
    localAuth.logout = () => { }

    const clientOptions = {
      puppeteer: {
        ...(chromeBin && { executablePath: chromeBin }),
        headless,
        args: [
          '--autoplay-policy=user-gesture-required',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-breakpad',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-dev-shm-usage',
          '--disable-domain-reliability',
          '--disable-extensions',
          // Chrome only honours the last --disable-features flag, so keep a single one
          lowResourceMode
            ? '--disable-features=AudioServiceOutOfProcess,site-per-process,IsolateOrigins,Translate,MediaRouter,OptimizationHints,BackForwardCache'
            : '--disable-features=AudioServiceOutOfProcess',
          ...(lowResourceMode
            ? [
                '--blink-settings=imagesEnabled=false',
                '--disable-site-isolation-trials',
                '--renderer-process-limit=2',
                '--disk-cache-size=33554432',
                '--media-cache-size=1'
              ]
            : []),
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-notifications',
          '--disable-offer-store-unmasked-wallet-cards',
          '--disable-popup-blocking',
          '--disable-print-preview',
          '--disable-prompt-on-repost',
          '--disable-renderer-backgrounding',
          '--disable-speech-api',
          '--disable-sync',
          '--disable-gpu',
          '--disable-accelerated-2d-canvas',
          '--hide-scrollbars',
          '--ignore-gpu-blacklist',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-default-browser-check',
          '--no-first-run',
          '--no-pings',
          '--no-zygote',
          '--password-store=basic',
          '--use-gl=swiftshader',
          '--use-mock-keychain',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security'
        ]
      },
      authStrategy: localAuth
    }

    if (webVersion) {
      clientOptions.webVersion = webVersion
      switch (webVersionCacheType.toLowerCase()) {
        case 'local':
          clientOptions.webVersionCache = {
            type: 'local'
          }
          break
        case 'remote':
          clientOptions.webVersionCache = {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/' + webVersion + '.html'
          }
          break
        default:
          clientOptions.webVersionCache = {
            type: 'none'
          }
      }
    }

    if (clearBrowserCache) {
      await clearSessionBrowserCache(sessionId)
    }

    const client = new Client(clientOptions)
    if (releaseBrowserLock) {
      // See https://github.com/puppeteer/puppeteer/issues/4860
      const singletonLockPath = path.resolve(path.join(sessionFolderPath, `session-${sessionId}`, 'SingletonLock'))
      const singletonLockExists = await fs.promises.lstat(singletonLockPath).then(() => true).catch(() => false)
      if (singletonLockExists) {
        logger.warn({ sessionId }, 'Browser lock file exists, removing')
        await fs.promises.unlink(singletonLockPath)
      }
    }

    try {
      client.once('ready', () => {
        patchWWebLibrary(client).catch((err) => {
          logger.error({ sessionId, err }, 'Failed to patch WWebJS library')
        })
      })
      await client.initialize()
    } catch (error) {
      logger.error({ sessionId, err: error }, 'Initialize error')
      // don't leave an orphan Chrome running when initialization fails
      await client.destroy().catch(() => { })
      throw error
    }

    initWebSocketServer(sessionId)
    initializeEvents(client, sessionId)

    // Stop sessions that are never linked, so idle QR browsers don't eat RAM
    if (sessionUnauthTimeoutMin > 0) {
      client.once('authenticated', () => { client.wasAuthenticated = true })
      client.unauthTimeout = setTimeout(async () => {
        if (client.wasAuthenticated || sessions.get(sessionId) !== client) return
        const state = await client.getState().catch(() => null)
        if (state === 'CONNECTED') return
        logger.warn({ sessionId, minutes: sessionUnauthTimeoutMin }, 'Session not authenticated in time, stopping')
        await destroySession(sessionId).catch(() => { })
        // the session is only stopped: its folder is kept and it can be started again
        if (isEventEnabled('disconnected')) {
          const data = { reason: 'UNAUTH_TIMEOUT', timeoutMin: sessionUnauthTimeoutMin, message: `QR code was not scanned within ${sessionUnauthTimeoutMin} min, session stopped` }
          triggerWebhook(process.env[sessionId.toUpperCase() + '_WEBHOOK_URL'] || baseWebhookURL, sessionId, 'disconnected', data)
          try { triggerWebSocket(sessionId, 'disconnected', data) } catch (e) { }
        }
      }, sessionUnauthTimeoutMin * 60 * 1000)
    }

    // Save the session to the Map
    sessions.set(sessionId, client)
    return { success: true, message: 'Session initiated successfully', client }
  } catch (error) {
    return { success: false, message: error.message, client: null }
  }
}

const initializeEvents = (client, sessionId) => {
  // check if the session webhook is overridden
  const sessionWebhook = process.env[sessionId.toUpperCase() + '_WEBHOOK_URL'] || baseWebhookURL

  if (recoverSessions) {
    waitForNestedObject(client, 'pupPage').then(() => {
      const restartSession = async (sessionId) => {
        sessions.delete(sessionId)
        await client.destroy().catch(e => { })
        await setupSession(sessionId)
      }
      client.pupPage.once('close', function () {
        // emitted when the page closes
        logger.warn({ sessionId }, 'Browser page closed. Restoring')
        restartSession(sessionId)
      })
      client.pupPage.once('error', function () {
        // emitted when the page crashes
        logger.warn({ sessionId }, 'Error occurred on browser page. Restoring')
        restartSession(sessionId)
      })
    }).catch(e => { })
  }

  if (isEventEnabled('auth_failure')) {
    client.on('auth_failure', (msg) => {
      triggerWebhook(sessionWebhook, sessionId, 'status', { msg })
      triggerWebSocket(sessionId, 'status', { msg })
    })
  }

  if (isEventEnabled('authenticated')) {
    client.qr = null
    client.on('authenticated', () => {
      triggerWebhook(sessionWebhook, sessionId, 'authenticated')
      triggerWebSocket(sessionId, 'authenticated')
    })
  }

  if (isEventEnabled('call')) {
    client.on('call', (call) => {
      triggerWebhook(sessionWebhook, sessionId, 'call', { call })
      triggerWebSocket(sessionId, 'call', { call })
    })
  }

  if (isEventEnabled('change_state')) {
    client.on('change_state', state => {
      triggerWebhook(sessionWebhook, sessionId, 'change_state', { state })
      triggerWebSocket(sessionId, 'change_state', { state })
    })
  }

  if (isEventEnabled('disconnected')) {
    client.on('disconnected', (reason) => {
      triggerWebhook(sessionWebhook, sessionId, 'disconnected', { reason })
      triggerWebSocket(sessionId, 'disconnected', { reason })
    })
  }

  if (isEventEnabled('group_join')) {
    client.on('group_join', (notification) => {
      triggerWebhook(sessionWebhook, sessionId, 'group_join', { notification })
      triggerWebSocket(sessionId, 'group_join', { notification })
    })
  }

  if (isEventEnabled('group_leave')) {
    client.on('group_leave', (notification) => {
      triggerWebhook(sessionWebhook, sessionId, 'group_leave', { notification })
      triggerWebSocket(sessionId, 'group_leave', { notification })
    })
  }

  if (isEventEnabled('group_admin_changed')) {
    client.on('group_admin_changed', (notification) => {
      triggerWebhook(sessionWebhook, sessionId, 'group_admin_changed', { notification })
      triggerWebSocket(sessionId, 'group_admin_changed', { notification })
    })
  }

  if (isEventEnabled('group_membership_request')) {
    client.on('group_membership_request', (notification) => {
      triggerWebhook(sessionWebhook, sessionId, 'group_membership_request', { notification })
      triggerWebSocket(sessionId, 'group_membership_request', { notification })
    })
  }

  if (isEventEnabled('group_update')) {
    client.on('group_update', (notification) => {
      triggerWebhook(sessionWebhook, sessionId, 'group_update', { notification })
      triggerWebSocket(sessionId, 'group_update', { notification })
    })
  }

  if (isEventEnabled('loading_screen')) {
    client.on('loading_screen', (percent, message) => {
      triggerWebhook(sessionWebhook, sessionId, 'loading_screen', { percent, message })
      triggerWebSocket(sessionId, 'loading_screen', { percent, message })
    })
  }

  if (isEventEnabled('media_uploaded')) {
    client.on('media_uploaded', (message) => {
      triggerWebhook(sessionWebhook, sessionId, 'media_uploaded', { message })
      triggerWebSocket(sessionId, 'media_uploaded', { message })
    })
  }

  client.on('message', async (message) => {
    if (isEventEnabled('message')) {
      const contact = await getMessageContactInfo(client, message)
      triggerWebhook(sessionWebhook, sessionId, 'message', { message, contact })
      triggerWebSocket(sessionId, 'message', { message, contact })
      if (message.hasMedia && message._data?.size < maxAttachmentSize) {
      // custom service event
        if (isEventEnabled('media')) {
          message.downloadMedia().then(messageMedia => {
            triggerWebhook(sessionWebhook, sessionId, 'media', { messageMedia, message })
            triggerWebSocket(sessionId, 'media', { messageMedia, message })
          }).catch(error => {
            logger.error({ sessionId, err: error }, 'Failed to download media')
          })
        }
      }
    }
    if (setMessagesAsSeen) {
      // small delay to ensure the message is processed before sending seen status
      await sleep(1000)
      sendMessageSeenStatus(message)
    }
  })

  if (isEventEnabled('message_ack')) {
    client.on('message_ack', (message, ack) => {
      triggerWebhook(sessionWebhook, sessionId, 'message_ack', { message, ack })
      triggerWebSocket(sessionId, 'message_ack', { message, ack })
    })
  }

  if (isEventEnabled('message_create')) {
    client.on('message_create', async (message) => {
      const contact = await getMessageContactInfo(client, message)
      triggerWebhook(sessionWebhook, sessionId, 'message_create', { message, contact })
      triggerWebSocket(sessionId, 'message_create', { message, contact })
    })
  }

  if (isEventEnabled('message_reaction')) {
    client.on('message_reaction', (reaction) => {
      triggerWebhook(sessionWebhook, sessionId, 'message_reaction', { reaction })
      triggerWebSocket(sessionId, 'message_reaction', { reaction })
    })
  }

  if (isEventEnabled('message_edit')) {
    client.on('message_edit', (message, newBody, prevBody) => {
      triggerWebhook(sessionWebhook, sessionId, 'message_edit', { message, newBody, prevBody })
      triggerWebSocket(sessionId, 'message_edit', { message, newBody, prevBody })
    })
  }

  if (isEventEnabled('message_ciphertext')) {
    client.on('message_ciphertext', (message) => {
      triggerWebhook(sessionWebhook, sessionId, 'message_ciphertext', { message })
      triggerWebSocket(sessionId, 'message_ciphertext', { message })
    })
  }

  if (isEventEnabled('message_revoke_everyone')) {
    client.on('message_revoke_everyone', (message) => {
      triggerWebhook(sessionWebhook, sessionId, 'message_revoke_everyone', { message })
      triggerWebSocket(sessionId, 'message_revoke_everyone', { message })
    })
  }

  if (isEventEnabled('message_revoke_me')) {
    client.on('message_revoke_me', (message, revokedMsg) => {
      triggerWebhook(sessionWebhook, sessionId, 'message_revoke_me', { message, revokedMsg })
      triggerWebSocket(sessionId, 'message_revoke_me', { message, revokedMsg })
    })
  }

  client.on('qr', (qr) => {
    // by default QR code is being updated every 20 seconds
    if (client.qrClearTimeout) {
      clearTimeout(client.qrClearTimeout)
    }
    // inject qr code into session
    client.qr = qr
    client.qrClearTimeout = setTimeout(() => {
      if (client.qr) {
        logger.warn({ sessionId }, 'Removing expired QR code')
        client.qr = null
      }
    }, 30000)
    if (isEventEnabled('qr')) {
      // Преобразуем QR-код в data:image/png;base64 для отображения в <img>
      qrcode.toDataURL(qr, (err, url) => {
        if (!err) {
          triggerWebhook(sessionWebhook, sessionId, 'qr', { qr: url })
          triggerWebSocket(sessionId, 'qr', { url })
        } else {
          triggerWebhook(sessionWebhook, sessionId, 'qr', { qr })
          triggerWebSocket(sessionId, 'qr', { qr })
        }
      })
    }
  })

  if (isEventEnabled('ready')) {
    client.on('ready', () => {
      triggerWebhook(sessionWebhook, sessionId, 'ready')
      triggerWebSocket(sessionId, 'ready')
    })
  }

  if (isEventEnabled('contact_changed')) {
    client.on('contact_changed', (message, oldId, newId, isContact) => {
      triggerWebhook(sessionWebhook, sessionId, 'contact_changed', { message, oldId, newId, isContact })
      triggerWebSocket(sessionId, 'contact_changed', { message, oldId, newId, isContact })
    })
  }

  if (isEventEnabled('chat_removed')) {
    client.on('chat_removed', (chat) => {
      triggerWebhook(sessionWebhook, sessionId, 'chat_removed', { chat })
      triggerWebSocket(sessionId, 'chat_removed', { chat })
    })
  }

  if (isEventEnabled('chat_archived')) {
    client.on('chat_archived', (chat, currState, prevState) => {
      triggerWebhook(sessionWebhook, sessionId, 'chat_archived', { chat, currState, prevState })
      triggerWebSocket(sessionId, 'chat_archived', { chat, currState, prevState })
    })
  }

  if (isEventEnabled('unread_count')) {
    client.on('unread_count', (chat) => {
      triggerWebhook(sessionWebhook, sessionId, 'unread_count', { chat })
      triggerWebSocket(sessionId, 'unread_count', { chat })
    })
  }

  if (isEventEnabled('vote_update')) {
    client.on('vote_update', (vote) => {
      triggerWebhook(sessionWebhook, sessionId, 'vote_update', { vote })
      triggerWebSocket(sessionId, 'vote_update', { vote })
    })
  }

  if (isEventEnabled('code')) {
    client.on('code', (code) => {
      triggerWebhook(sessionWebhook, sessionId, 'code', { code })
      triggerWebSocket(sessionId, 'code', { code })
    })
  }
}

// Function to delete client session folder
const deleteSessionFolder = async (sessionId) => {
  try {
    const targetDirPath = path.join(sessionFolderPath, `session-${sessionId}`)
    const resolvedTargetDirPath = await fs.promises.realpath(targetDirPath)
    const resolvedSessionPath = await fs.promises.realpath(sessionFolderPath)

    // Ensure the target directory path ends with a path separator
    const safeSessionPath = `${resolvedSessionPath}${path.sep}`

    // Validate the resolved target directory path is a subdirectory of the session folder path
    if (!resolvedTargetDirPath.startsWith(safeSessionPath)) {
      throw new Error('Invalid path: Directory traversal detected')
    }
    await fs.promises.rm(resolvedTargetDirPath, { recursive: true, force: true })
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Folder deletion error')
    throw error
  }
}

// Function to reload client session without removing browser cache
const reloadSession = async (sessionId) => {
  try {
    const client = sessions.get(sessionId)
    if (!client) {
      return
    }
    client.pupPage?.removeAllListeners('close')
    client.pupPage?.removeAllListeners('error')
    try {
      const pages = await client.pupBrowser.pages()
      await Promise.all(pages.map((page) => page.close()))
      await Promise.race([
        client.pupBrowser.close(),
        new Promise(resolve => setTimeout(resolve, 5000))
      ])
    } catch (e) {
      const childProcess = client.pupBrowser.process()
      if (childProcess) {
        childProcess.kill(9)
      }
    }
    sessions.delete(sessionId)
    await setupSession(sessionId)
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to reload session')
    throw error
  }
}

const destroySession = async (sessionId) => {
  try {
    const client = sessions.get(sessionId)
    if (!client) {
      return
    }
    client.pupPage?.removeAllListeners('close')
    client.pupPage?.removeAllListeners('error')
    try {
      await terminateWebSocketServer(sessionId)
    } catch (error) {
      logger.error({ sessionId, err: error }, 'Failed to terminate WebSocket server')
    }
    await client.destroy()
    // Wait 10 secs for client.pupBrowser to be disconnected
    let maxDelay = 0
    while (client.pupBrowser?.isConnected() && (maxDelay < 10)) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      maxDelay++
    }
    sessions.delete(sessionId)
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to stop session')
    throw error
  }
}

const deleteSession = async (sessionId, validation) => {
  try {
    const client = sessions.get(sessionId)
    if (!client) {
      return
    }
    client.pupPage?.removeAllListeners('close')
    client.pupPage?.removeAllListeners('error')
    try {
      await terminateWebSocketServer(sessionId)
    } catch (error) {
      logger.error({ sessionId, err: error }, 'Failed to terminate WebSocket server')
    }
    if (validation.success) {
      // Client Connected, request logout
      logger.info({ sessionId }, 'Logging out session')
      await client.logout()
    } else if (validation.message === 'session_not_connected') {
      // Client not Connected, request destroy
      logger.info({ sessionId }, 'Destroying session')
      await client.destroy()
    }
    // Wait 10 secs for client.pupBrowser to be disconnected before deleting the folder
    let maxDelay = 0
    while (client.pupBrowser.isConnected() && (maxDelay < 10)) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      maxDelay++
    }
    sessions.delete(sessionId)
    await deleteSessionFolder(sessionId)
  } catch (error) {
    logger.error({ sessionId, err: error }, 'Failed to delete session')
    throw error
  }
}

// Function to handle session flush
const flushSessions = async (deleteOnlyInactive) => {
  try {
    // Read the contents of the sessions folder
    const files = await fs.promises.readdir(sessionFolderPath)
    // Iterate through the files in the parent folder
    for (const file of files) {
      // Use regular expression to extract the string from the folder name
      const match = file.match(/^session-(.+)$/)
      if (match) {
        const sessionId = match[1]
        const validation = await validateSession(sessionId)
        if (!deleteOnlyInactive || !validation.success) {
          await deleteSession(sessionId, validation)
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Failed to flush sessions')
    throw error
  }
}

// Browser caches that are safe to drop: auth lives in IndexedDB / Local Storage, which are kept
const BROWSER_CACHE_DIRS = [
  ['Default', 'Cache'],
  ['Default', 'Code Cache'],
  ['Default', 'GPUCache'],
  ['Default', 'DawnGraphiteCache'],
  ['Default', 'DawnWebGPUCache'],
  ['GPUPersistentCache'],
  ['component_crx_cache'],
  ['OptGuideOnDeviceModel'],
  ['OptGuideOnDeviceClassifierModel']
]

const clearSessionBrowserCache = async (sessionId) => {
  const sessionDir = path.resolve(sessionFolderPath, `session-${sessionId}`)
  for (const parts of BROWSER_CACHE_DIRS) {
    await fs.promises.rm(path.join(sessionDir, ...parts), { recursive: true, force: true })
      .catch((err) => logger.debug({ sessionId, err }, 'Failed to clear browser cache dir'))
  }
}

// Daily restart of running sessions: WhatsApp Web grows in memory over time,
// a restart brings it back to the baseline (auth is kept)
const restartAllSessions = async () => {
  const ids = [...sessions.keys()]
  logger.info({ count: ids.length }, 'Scheduled restart of sessions')
  for (const sessionId of ids) {
    try {
      await reloadSession(sessionId)
    } catch (error) {
      logger.error({ sessionId, err: error }, 'Scheduled restart failed')
    }
    // restart one by one to avoid a CPU spike
    await sleep(30000)
  }
}

const scheduleDailyRestart = () => {
  if (!Number.isInteger(sessionRestartHour) || sessionRestartHour < 0 || sessionRestartHour > 23) return
  const now = new Date()
  const next = new Date(now)
  next.setHours(sessionRestartHour, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  logger.info({ at: next.toISOString() }, 'Next scheduled session restart')
  setTimeout(async () => {
    await restartAllSessions()
    scheduleDailyRestart()
  }, next - now)
}

module.exports = {
  scheduleDailyRestart,
  sessions,
  setupSession,
  restoreSessions,
  validateSession,
  deleteSession,
  reloadSession,
  flushSessions,
  destroySession
}
