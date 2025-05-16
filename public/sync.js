// Базовый URL API (может быть настроен в зависимости от среды)
const API_BASE_URL = window.location.origin;

// Функция для синхронизации данных с сервером
async function syncWithServer() {
    try {
        // Подготавливаем данные для отправки на сервер
        const dataToSync = {
            tables: tables.map(table => {
                // Клонируем объект стола без ссылок на заказы и бронирования
                const { order, booking, ...tableData } = table;
                return tableData;
            }),
            orders: getOrdersObject(),
            bookings: getBookingsObject()
        };

        // Обновляем статус синхронизации
        updateSyncStatus('syncing');

        // Отправляем данные на сервер
        const response = await fetch(`${API_BASE_URL}/api/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSync)
        });

        const result = await response.json();

        if (result.success) {
            // Сохраняем время последней успешной синхронизации
            localStorage.setItem('lastSyncTime', new Date().toISOString());
            updateSyncStatus('success');
            console.log('Данные успешно синхронизированы с сервером');
        } else {
            updateSyncStatus('error');
            console.error('Ошибка при синхронизации данных:', result.error);
        }

        return result;
    } catch (error) {
        updateSyncStatus('error');
        console.error('Ошибка при синхронизации с сервером:', error);
        return { success: false, error: error.message };
    }
}

// Функция для получения данных с сервера
async function loadDataFromServer() {
    try {
        updateSyncStatus('syncing');

        const response = await fetch(`${API_BASE_URL}/api/data`);
        const data = await response.json();

        if (data && data.tables) {
            // Получаем время последнего обновления с сервера
            const serverUpdateTime = data.lastUpdated;
            const lastSyncTime = localStorage.getItem('lastSyncTime');
            const lastLocalUpdate = localStorage.getItem('lastUpdateTime');

            // Проверяем, нужно ли обновлять локальные данные
            // Обновляем, если данные на сервере новее, или если локальных данных нет
            const shouldUpdate = !lastSyncTime || 
                                 !lastLocalUpdate || 
                                 new Date(serverUpdateTime) > new Date(lastSyncTime);

            if (shouldUpdate) {
                // Применяем данные с сервера
                tables = data.tables.map(table => ({
                    ...table,
                    order: data.orders[table.id] || null,
                    booking: data.bookings[table.id] || null
                }));

                // Сохраняем в localStorage
                localStorage.setItem('restaurantLayout', JSON.stringify(tables));
                localStorage.setItem('orders', JSON.stringify(data.orders || {}));
                localStorage.setItem('bookings', JSON.stringify(data.bookings || {}));
                
                // Обновляем время последней синхронизации
                localStorage.setItem('lastSyncTime', serverUpdateTime);
                localStorage.setItem('lastUpdateTime', serverUpdateTime);

                // Обновляем UI
                renderTables();
                updateSyncStatus('success');
                console.log('Данные успешно загружены с сервера');
            } else {
                updateSyncStatus('upToDate');
                console.log('Данные уже актуальны');
            }
        } else {
            // Если данных на сервере нет, отправляем локальные данные
            if (tables.length > 0) {
                await syncWithServer();
            }
        }
    } catch (error) {
        updateSyncStatus('error');
        console.error('Ошибка при загрузке данных с сервера:', error);
        
        // Если не удалось загрузить данные с сервера, пробуем использовать локальные данные
        const savedLayout = localStorage.getItem('restaurantLayout');
        if (savedLayout && !tables.length) {
            initializeLayout();
        }
    }
}

// Функция для получения объекта заказов
function getOrdersObject() {
    const orders = {};
    tables.forEach(table => {
        if (table.order) {
            orders[table.id] = table.order;
        }
    });
    return orders;
}

// Функция для получения объекта бронирований
function getBookingsObject() {
    const bookings = {};
    tables.forEach(table => {
        if (table.booking) {
            bookings[table.id] = table.booking;
        }
    });
    return bookings;
}

// Функция для обновления статуса синхронизации в UI
function updateSyncStatus(status) {
    const syncStatus = document.getElementById('sync-status');
    if (!syncStatus) return;

    // Очищаем предыдущие классы
    syncStatus.className = 'sync-status';
    
    // Добавляем класс в зависимости от статуса
    syncStatus.classList.add(status);
    
    // Обновляем текст статуса
    switch (status) {
        case 'syncing':
            syncStatus.textContent = 'Синхронизация...';
            break;
        case 'success':
            syncStatus.textContent = 'Синхронизировано';
            // Через 3 секунды меняем на "upToDate"
            setTimeout(() => {
                updateSyncStatus('upToDate');
            }, 3000);
            break;
        case 'upToDate':
            syncStatus.textContent = 'Данные актуальны';
            break;
        case 'error':
            syncStatus.textContent = 'Ошибка синхронизации';
            break;
        default:
            syncStatus.textContent = 'Не синхронизировано';
    }
}

// Обновленная функция сохранения всех данных
function saveAllDataWithSync() {
    // Сохраняем локально
    saveLayout();
    saveOrders();
    saveBookings();
    
    // Обновляем время последнего локального обновления
    localStorage.setItem('lastUpdateTime', new Date().toISOString());
    
    // Синхронизируем с сервером
    syncWithServer();
}

// Инициализация синхронизации
function initializeSync() {
    // Добавляем индикатор синхронизации в интерфейс
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebar) {
        const syncStatusContainer = document.createElement('div');
        syncStatusContainer.className = 'sync-container';
        
        const syncStatus = document.createElement('div');
        syncStatus.id = 'sync-status';
        syncStatus.className = 'sync-status';
        syncStatus.textContent = 'Ожидание синхронизации...';
        
        const syncButton = document.createElement('button');
        syncButton.id = 'sync-button';
        syncButton.textContent = 'Синхронизировать';
        syncButton.addEventListener('click', syncWithServer);
        
        syncStatusContainer.appendChild(syncStatus);
        syncStatusContainer.appendChild(syncButton);
        
        sidebar.appendChild(syncStatusContainer);
    }
    
    // Загружаем данные с сервера при загрузке страницы
    loadDataFromServer();
    
    // Устанавливаем периодическую синхронизацию (каждые 30 секунд)
    setInterval(() => {
        // Проверяем, были ли локальные изменения с момента последней синхронизации
        const lastSyncTime = localStorage.getItem('lastSyncTime');
        const lastUpdateTime = localStorage.getItem('lastUpdateTime');
        
        if (!lastSyncTime || !lastUpdateTime || new Date(lastUpdateTime) > new Date(lastSyncTime)) {
            syncWithServer();
        } else {
            loadDataFromServer();
        }
    }, 30000);
}