const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0', autoBody: false })

// SWAGGER_OUT позволяет сгенерировать документацию в другой файл (для проверки), по умолчанию ./swagger.json
const outputFile = process.env.SWAGGER_OUT || './swagger.json'
const endpointsFiles = ['./src/routes.js']

// Внимание: swagger-ui-express вставляет спецификацию в страницу через String.replace, поэтому
// последовательности "$" + "`", "$" + "'" и "$&" в любых описаниях/примерах ломают /api-docs (пустая страница).
// В #swagger.description контроллеров перевод строк не сохраняется — там используется однострочный HTML.
const description = `
REST API-обёртка над [whatsapp-web.js](https://wwebjs.dev/). Каждая **сессия** — это отдельный экземпляр WhatsApp Web
в headless Chromium (Puppeteer), привязанный к одному номеру WhatsApp. Одновременно можно держать несколько сессий.

---

## 1. Авторизация запросов (\`x-api-key\`)

* Если на сервере задана переменная окружения \`API_KEY\`, **каждый** запрос (кроме \`GET /ping\` и самой страницы \`/api-docs\`)
  должен содержать заголовок \`x-api-key: <API_KEY>\`. Заголовок отсутствует или не совпадает → **HTTP 403**
  \`{"success": false, "error": "Invalid API key"}\`.
* Если \`API_KEY\` не задан — проверка ключа отключена полностью.
* В Swagger UI нажмите **Authorize** и введите ключ — он будет подставляться во все запросы «Try it out».
* Ключ передаётся только в заголовке, не в query-строке и не в теле.

## 2. Общий формат ответов

* Успех: \`{"success": true, ...}\`. Имя поля с данными зависит от эндпоинта (\`result\`, \`message\`, \`messages\`, \`chat\`, \`chats\`, \`contact\` и т.д.) — смотрите пример ответа 200 у каждого метода.
* Ошибка: \`{"success": false, "error": "<текст>"}\` с HTTP-кодом ошибки.
* **Внимание:** некоторые методы \`/session/*\` (status, qr, qr/image, requestPairingCode, getPageScreenshot, restart, terminate) при отсутствии сессии
  отвечают **HTTP 200** с телом \`{"success": false, "message": "session_not_found"}\`. Всегда проверяйте поле \`success\`, а не только HTTP-код.
* POST-запросы отправляйте с \`Content-Type: application/json\`. Без него тело не будет разобрано, и все поля придут пустыми.

## 3. Коды ошибок

| Код | Когда возникает | Тело |
|-----|-----------------|------|
| 400 | Неверное значение параметра, которое проверяет сам контроллер (например, неизвестный \`contentType\`). Также Express отвечает 400 (HTML-страница, не JSON), если тело запроса — невалидный JSON. | \`{"success": false, "error": "invalid contentType"}\` |
| 403 | Задан \`API_KEY\`, а заголовок \`x-api-key\` отсутствует или неверен. | \`{"success": false, "error": "Invalid API key"}\` |
| 404 | Сессия не найдена или не готова к работе (для всех методов, кроме \`/session/*\` и \`/client/getState\`); у некоторых методов — не найден чат/канал. | \`{"success": false, "error": "session_not_found"}\` |
| 413 | Тело запроса больше \`MAX_ATTACHMENT_SIZE\` + 1 000 000 байт. Ответ формирует Express (HTML, не JSON). | — |
| 422 | \`sessionId\` содержит недопустимые символы, либо (\`/session/start\`) сессия уже запущена. | \`{"success": false, "error": "Session should be alphanumerical or -"}\` |
| 429 | Превышен лимит запросов — **только** для \`POST /localCallbackExample\`. Тело — простой текст. | \`You can't make any more requests at the moment. Try again later\` |
| 500 | Любое исключение внутри whatsapp-web.js / Puppeteer: неверный или несуществующий id, сообщение не найдено, вкладка браузера закрыта и т.п. В \`error\` — текст исключения. | \`{"success": false, "error": "<текст исключения>"}\` |

Возможные значения \`error\` для 404 «сессия не готова» (их выдаёт проверка сессии перед каждым методом):
\`session_not_found\` — сессия с таким id не запущена на сервере; \`session_not_connected\` — браузер запущен, но WhatsApp ещё не авторизован / не в состоянии CONNECTED;
\`browser tab closed\` — вкладка Chromium закрыта; \`session closed\` — страница не отвечает; либо текст другого исключения.

## 4. sessionId

* Передаётся в пути: \`/client/sendMessage/{sessionId}\`. Допустимы только латинские буквы, цифры, \`_\` и \`-\` (набор символов \`A-Z a-z 0-9 _ -\`).
  Пробелы, точки, кириллица, \`@\`, \`/\` → **HTTP 422** \`Session should be alphanumerical or -\`.
* Регистр важен: \`Shop1\` и \`shop1\` — разные сессии.
* Данные авторизации хранятся в папке \`SESSIONS_PATH/session-<sessionId>\` (по умолчанию \`./sessions\`). Один sessionId = один номер WhatsApp.
* Для сессии можно задать отдельный webhook переменной окружения \`<SESSIONID_В_ВЕРХНЕМ_РЕГИСТРЕ>_WEBHOOK_URL\` (например, \`DEMO_WEBHOOK_URL\` для сессии \`demo\`).

## 5. Жизненный цикл сессии

1. **Старт:** \`GET /session/start/{sessionId}\` — создаёт клиента и запускает Chromium. Ответ приходит, когда страница браузера создана; это ещё **не** означает готовность.
   Если сессия с таким id уже запущена → 422 \`Session already exists for: <id>\`.
2. **Привязка номера** (нужна только при первом запуске; если папка сессии уже содержит авторизацию — шаг пропускается):
   * **QR-код:** \`GET /session/qr/{sessionId}\` (строка QR) или \`GET /session/qr/{sessionId}/image\` (PNG), либо событие webhook \`qr\`.
     Отсканируйте в телефоне: WhatsApp → Связанные устройства → Привязка устройства. QR обновляется примерно каждые 20 секунд и хранится на сервере 30 секунд.
   * **Код сопряжения вместо QR:** \`POST /session/requestPairingCode/{sessionId}\` с \`phoneNumber\` → код из 8 символов вводится на телефоне
     (Связанные устройства → Привязать по номеру телефона). Код также приходит событием webhook \`code\`.
3. **Готовность:** приходят события \`authenticated\`, затем \`ready\`. \`GET /session/status/{sessionId}\` возвращает \`state: "CONNECTED"\`, \`message: "session_connected"\`.
4. **Работа:** все методы \`/client\`, \`/chat\`, \`/groupChat\`, \`/message\`, \`/contact\`, \`/channel\` (кроме \`/client/getState\`) перед выполнением проверяют,
   что сессия в состоянии \`CONNECTED\`; иначе — 404. Проверка может занять до ~10 секунд, если браузер ещё запускается.
5. **Остановка:**
   * \`GET /session/stop/{sessionId}\` — закрыть браузер, **сохранив** авторизацию (повторный \`start\` поднимет сессию без QR).
   * \`GET /session/restart/{sessionId}\` — перезапустить браузер (авторизация сохраняется).
   * \`GET /session/terminate/{sessionId}\` — выйти из WhatsApp (logout) и **удалить** папку сессии; для повторного входа понадобится новый QR.
   * \`GET /session/terminateInactive\` / \`GET /session/terminateAll\` — массовое удаление неактивных / **всех** сессий (необратимо).
* При \`AUTO_START_SESSIONS=TRUE\` (по умолчанию) сервер при старте сам запускает все сохранённые сессии (папки \`session-*\`).
* При \`RECOVER_SESSIONS=TRUE\` упавшая или закрытая вкладка браузера автоматически перезапускается.

## 6. Форматы идентификаторов

| Что | Формат | Пример |
|-----|--------|--------|
| Личный чат / контакт | \`<код страны><номер>@c.us\` — только цифры, без \`+\`, пробелов, скобок и ведущих нулей | \`79991234567@c.us\` |
| Группа | \`<id>@g.us\` (новые группы — 18 цифр, старые — \`<номер создателя>-<timestamp>\`) | \`120363012345678901@g.us\` |
| Канал (newsletter) | \`<id>@newsletter\` | \`120363098765432101@newsletter\` |
| Скрытый id участника (LID) | \`<число>@lid\` — встречается в группах и сообществах вместо номера | \`123456789012345@lid\` |
| Статусы | \`status@broadcast\` | \`status@broadcast\` |
| Сообщение (\`message.id\`) | объект \`{fromMe, remote, id, _serialized}\`. Методы \`/message/*\` принимают **короткий** \`id.id\`, а не \`_serialized\` | \`3EB0C767D82E4B5A1F2C\` |

* Узнать правильный chatId по номеру и проверить, что номер есть в WhatsApp: \`POST /client/getNumberId\` (вернёт \`null\`, если номера нет в WhatsApp).
* id групп и каналов берите из \`/client/getChats\`, \`/client/createGroup\`, \`/client/getChannels\`, а также из webhook-событий.
* Методы \`/message/*\` ищут сообщение только среди **последних 100** сообщений указанного чата; более старое сообщение даст 500 \`Message not found\`.

## 7. Webhook (события в реальном времени)

* Сервер отправляет \`POST\` на \`BASE_WEBHOOK_URL\` (или на \`<SESSIONID>_WEBHOOK_URL\` для конкретной сессии) с JSON-телом:
  \`{"dataType": "<тип события>", "data": { ... }, "sessionId": "<id сессии>"}\` и заголовком \`x-api-key: <API_KEY>\` (по нему получатель может проверить отправителя).
* Отправка «выстрелил и забыл»: ответ вашего сервера игнорируется, повторов нет, ошибки только пишутся в лог. HTTPS-сертификат получателя не проверяется.
* \`ENABLE_WEBHOOK=FALSE\` — отключить webhook целиком. \`DISABLED_CALLBACKS=событие1|событие2\` — отключить отдельные события
  (пример из \`.env.example\`: \`message_ack|message_reaction|unread_count|message_edit|message_ciphertext\`).
* \`ENABLE_WEBSOCKET=TRUE\` — те же события дополнительно рассылаются по WebSocket: \`ws://<host>[BASE_PATH]/ws/<sessionId>\` (сообщения того же формата).
* \`SET_MESSAGES_AS_SEEN=TRUE\` — входящие сообщения автоматически помечаются прочитанными (через ~1 секунду).

| Событие (имя в DISABLED_CALLBACKS) | dataType | data |
|-----------------|----------|------|
| \`qr\` | \`qr\` | \`{qr}\` — PNG в виде data URL \`data:image/png;base64,...\` (если конвертация не удалась — исходная строка QR). По WebSocket: \`{url}\` |
| \`code\` | \`code\` | \`{code}\` — код сопряжения |
| \`authenticated\` | \`authenticated\` | нет поля data |
| \`auth_failure\` | **\`status\`** | \`{msg}\` — причина ошибки авторизации |
| \`ready\` | \`ready\` | нет поля data — сессия готова к работе |
| \`loading_screen\` | \`loading_screen\` | \`{percent, message}\` |
| \`change_state\` | \`change_state\` | \`{state}\` — новое состояние (CONNECTED, OPENING, CONFLICT, UNPAIRED, TIMEOUT …) |
| \`disconnected\` | \`disconnected\` | \`{reason}\` — например \`LOGOUT\`, \`NAVIGATION\`. Также \`{reason: "UNAUTH_TIMEOUT", timeoutMin, message}\` — сессия остановлена, потому что QR не отсканировали за \`timeoutMin\` минут (настраивается параметром \`unauthTimeoutMin\` в \`/session/start\` или \`UNAUTH_SESSION_TIMEOUT_MIN\`); папка сессии сохраняется, её можно снова запустить |
| \`message\` | \`message\` | \`{message, contact}\` — входящее сообщение (не своё). \`contact\` — собеседник, определённый по локальным данным WhatsApp Web без запросов к серверам: \`{id, lid, phoneId, number, formattedNumber, countryCode, pushname}\`; для \`@lid\`-отправителей номер приходит здесь, искать его отдельно не нужно. Поля, которые не удалось определить, — \`null\`; в группе \`contact\` — автор сообщения; для каналов, статусов и своих сообщений в группу — \`null\` |
| \`media\` | \`media\` | \`{messageMedia: {mimetype, data, filename, filesize}, message}\` — отправляется после \`message\`, если во входящем есть медиа размером меньше \`MAX_ATTACHMENT_SIZE\`. \`data\` — base64. Не отправляется, если отключено \`message\` или \`media\` |
| \`message_create\` | \`message_create\` | \`{message, contact}\` — любое созданное сообщение, включая свои (с телефона и через API). \`contact\` — как у \`message\`; для своих сообщений это получатель |
| \`message_ack\` | \`message_ack\` | \`{message, ack}\` — ack: -1 ошибка, 0 ожидание, 1 на сервере, 2 доставлено, 3 прочитано, 4 прослушано |
| \`message_reaction\` | \`message_reaction\` | \`{reaction}\` |
| \`message_edit\` | \`message_edit\` | \`{message, newBody, prevBody}\` |
| \`message_ciphertext\` | \`message_ciphertext\` | \`{message}\` — сообщение ещё не расшифровано («Ожидание сообщения») |
| \`message_revoke_everyone\` | \`message_revoke_everyone\` | \`{message}\` — сообщение удалено у всех |
| \`message_revoke_me\` | \`message_revoke_me\` | \`{message, revokedMsg}\` — сообщение удалено только у себя |
| \`media_uploaded\` | \`media_uploaded\` | \`{message}\` — медиа отправляемого сообщения загружено |
| \`call\` | \`call\` | \`{call}\` — входящий звонок |
| \`group_join\`, \`group_leave\`, \`group_update\`, \`group_admin_changed\`, \`group_membership_request\` | то же | \`{notification}\` |
| \`contact_changed\` | \`contact_changed\` | \`{message, oldId, newId, isContact}\` — контакт сменил номер |
| \`chat_removed\` | \`chat_removed\` | \`{chat}\` |
| \`chat_archived\` | \`chat_archived\` | \`{chat, currState, prevState}\` |
| \`unread_count\` | \`unread_count\` | \`{chat}\` |
| \`vote_update\` | \`vote_update\` | \`{vote}\` — голос в опросе |

Список событий в комментарии \`.env.example\` неполный: код также поддерживает \`code\`, \`media\`, \`message_revoke_me\`, \`group_admin_changed\`,
\`group_membership_request\`, \`chat_removed\`, \`chat_archived\`, \`vote_update\`.

## 8. Медиа и MAX_ATTACHMENT_SIZE

* \`MAX_ATTACHMENT_SIZE\` (по умолчанию \`10000000\` байт ≈ 10 МБ) задаёт:
  * лимит тела запроса = \`MAX_ATTACHMENT_SIZE + 1000000\` байт (иначе **413**). Base64 увеличивает файл примерно на 33%, поэтому через JSON можно передать файл размером примерно до 3/4 лимита;
  * максимальный размер входящего медиа, которое автоматически скачивается и отправляется событием webhook \`media\`. Более крупные файлы скачивайте вручную через \`POST /message/downloadMedia\`.
* Медиа в теле запроса (\`MessageMedia\`): \`{"mimetype": "image/jpeg", "data": "<base64 без префикса data:...;base64,>", "filename": "photo.jpg"}\`.
* Крупные файлы удобнее отправлять по ссылке (\`contentType: "MessageMediaFromURL"\`) — сервер сам скачает файл.

## 9. Ограничение частоты запросов

* Встроенный лимитер (\`RATE_LIMIT_MAX\` запросов за \`RATE_LIMIT_WINDOW_MS\` мс с одного IP, по умолчанию 1000 за 1000 мс) подключён **только** к \`POST /localCallbackExample\`.
  Остальные методы сервером не ограничиваются.
* За обратным прокси включите \`TRUST_PROXY=TRUE\`, чтобы лимит считался по реальному IP клиента.
* Ограничения есть у самого WhatsApp: массовые рассылки незнакомым номерам и слишком частая отправка приводят к блокировке номера. Делайте паузы между сообщениями.

## 10. Прочее

* \`BASE_PATH\` (например, \`/api/v1/whatsapp\`) — префикс, под которым смонтированы все маршруты, включая \`/api-docs\` и \`/ws\`.
* Методы \`runMethod\` вызывают произвольный метод объекта whatsapp-web.js по имени — используйте их только если нужного метода нет в API.
`

const doc = {
  info: {
    title: 'WWebJS API',
    description
  },
  servers: [
    {
      url: '/',
      description: 'default server'
    },
    {
      url: 'http://localhost:3000',
      description: 'localhost server'
    }
  ],
  securityDefinitions: {
    apiKeyAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
      description: 'Значение переменной окружения API_KEY. Обязателен, если API_KEY задан на сервере; иначе можно не передавать.'
    }
  },
  produces: ['application/json'],
  tags: [
    {
      name: 'Various',
      description: 'Служебные методы: проверка доступности сервера и пример приёмника webhook.'
    },
    {
      name: 'Session',
      description: 'Управление сессиями: запуск, получение QR / кода сопряжения, статус, остановка, перезапуск и удаление. Работают без проверки готовности сессии.'
    },
    {
      name: 'Client',
      description: 'Методы клиента WhatsApp: отправка сообщений, список чатов и контактов, метки, профиль, каналы, настройки. Требуют сессию в состоянии CONNECTED.'
    },
    {
      name: 'Chat',
      description: 'Действия с конкретным чатом (личным или групповым) по chatId: история сообщений, прочитано, набор текста, очистка, метки.'
    },
    {
      name: 'Group Chat',
      description: 'Управление группами (chatId вида ...@g.us): участники, администраторы, приглашения, тема, описание, аватар, заявки на вступление. Большинство действий требуют прав администратора группы.'
    },
    {
      name: 'Message',
      description: 'Действия с конкретным сообщением по chatId + messageId (короткий id.id): удаление, пересылка, ответ, реакции, медиа, редактирование. Сообщение ищется среди последних 100 сообщений чата.'
    },
    {
      name: 'Contact',
      description: 'Действия с контактом по contactId (...@c.us): блокировка, статус «О себе», аватар, общие группы, форматированный номер.'
    },
    {
      name: 'Channel Chat',
      description: 'Работа с каналами WhatsApp (newsletter, id вида ...@newsletter): публикации, подписчики, администраторы, настройки канала.'
    }
  ],
  definitions: {
    StartSessionResponse: {
      success: true,
      message: 'Session initiated successfully'
    },
    StopSessionResponse: {
      success: true,
      message: 'Session stopped successfully'
    },
    StatusSessionResponse: {
      success: true,
      state: 'CONNECTED',
      message: 'session_connected'
    },
    RestartSessionResponse: {
      success: true,
      message: 'Restarted successfully'
    },
    TerminateSessionResponse: {
      success: true,
      message: 'Logged out successfully'
    },
    TerminateSessionsResponse: {
      success: true,
      message: 'Flush completed successfully'
    },
    SessionNotFoundSoftResponse: {
      success: false,
      message: 'session_not_found'
    },
    ErrorResponse: {
      success: false,
      error: 'Protocol error (Runtime.callFunctionOn): Target closed.'
    },
    BadRequestResponse: {
      success: false,
      error: 'invalid contentType'
    },
    UnprocessableEntityResponse: {
      success: false,
      error: 'Session should be alphanumerical or -'
    },
    NotFoundResponse: {
      success: false,
      error: 'session_not_found'
    },
    ForbiddenResponse: {
      success: false,
      error: 'Invalid API key'
    },
    GetSessionsResponse: {
      success: true,
      result: ['my-session', 'shop_2']
    },
    WebhookPayload: {
      dataType: 'message',
      data: {
        message: {
          id: { fromMe: false, remote: '79991234567@c.us', id: '3EB0C767D82E4B5A1F2C', _serialized: 'false_79991234567@c.us_3EB0C767D82E4B5A1F2C' },
          body: 'Привет!',
          type: 'chat',
          timestamp: 1730000000,
          from: '79991234567@c.us',
          to: '79990000000@c.us',
          fromMe: false,
          hasMedia: false
        }
      },
      sessionId: 'my-session'
    }
  }
}

swaggerAutogen(outputFile, endpointsFiles, doc)
