// ----- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ -----
let tables = [];               // Массив столов
let selectedTableId = null;    // ID выбранного стола
let isAdminMode = false;       // Флаг режима администратора
let isDragging = false;        // Флаг перетаскивания элементов
let dragStartX, dragStartY;    // Начальные координаты перетаскивания
let svgOffsetX = 0, svgOffsetY = 0; // Смещение SVG для перемещения/масштабирования
let currentScale = 1;          // Текущий масштаб
const defaultLayout = [        // Схема зала по умолчанию
    { id: 1, type: 'rect', x: 100, y: 100, width: 80, height: 60, seats: 4, status: 'free', rotation: 0 },
    { id: 2, type: 'rect', x: 250, y: 100, width: 80, height: 60, seats: 4, status: 'free', rotation: 0 },
    { id: 3, type: 'rect', x: 400, y: 100, width: 80, height: 60, seats: 4, status: 'free', rotation: 0 },
    { id: 4, type: 'circle', x: 100, y: 250, radius: 40, seats: 2, status: 'free', rotation: 0 },
    { id: 5, type: 'circle', x: 250, y: 250, radius: 40, seats: 2, status: 'free', rotation: 0 },
    { id: 6, type: 'circle', x: 400, y: 250, radius: 40, seats: 2, status: 'free', rotation: 0 },
    { id: 7, type: 'rect', x: 180, y: 400, width: 200, height: 80, seats: 8, status: 'free', rotation: 0 }
];

// ----- ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ -----
document.addEventListener('DOMContentLoaded', () => {
    // Загрузка скрипта синхронизации
    loadSyncScript().then(() => {
        initializeLayout();
        setupEventListeners();
        checkForBookingNotifications();
        
        // Настройка зум и панорамирования
        setupZoomAndPan();
        
        // Инициализация системы синхронизации
        initializeSync();
    });
});

// Загрузка скрипта синхронизации динамически
function loadSyncScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'sync.js';
        script.onload = resolve;
        script.onerror = (e) => {
            console.error('Ошибка загрузки скрипта синхронизации:', e);
            resolve(); // Продолжаем инициализацию даже при ошибке
        };
        document.head.appendChild(script);
    });
}

// ----- ИНИЦИАЛИЗАЦИЯ МАКЕТА -----
function initializeLayout() {
    // Загрузка данных из LocalStorage или использование макета по умолчанию
    const savedLayout = localStorage.getItem('restaurantLayout');
    const savedTables = savedLayout ? JSON.parse(savedLayout) : defaultLayout;
    
    // Загрузка заказов и бронирований
    const savedOrders = localStorage.getItem('orders');
    const orders = savedOrders ? JSON.parse(savedOrders) : {};
    
    const savedBookings = localStorage.getItem('bookings');
    const bookings = savedBookings ? JSON.parse(savedBookings) : {};
    
    // Применение состояний к столам из сохраненных данных
    tables = savedTables.map(table => {
        return {
            ...table,
            order: orders[table.id] || null,
            booking: bookings[table.id] || null
        };
    });
    
    // Отрисовка столов
    renderTables();
}

// ----- НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ -----
function setupEventListeners() {
    // Поиск стола
    document.getElementById('find-table-btn').addEventListener('click', findTable);
    document.getElementById('table-search').addEventListener('keypress', e => {
        if (e.key === 'Enter') findTable();
    });
    
    // Кнопки контроля
    document.getElementById('reset-view-btn').addEventListener('click', resetView);
    document.getElementById('admin-mode-btn').addEventListener('click', toggleAdminMode);
    
    // Администраторские кнопки
    document.getElementById('add-table-btn').addEventListener('click', openAddTableModal);
    document.getElementById('add-table-confirm-btn').addEventListener('click', addNewTable);
    document.getElementById('change-table-number-btn').addEventListener('click', openChangeNumberModal);
    document.getElementById('confirm-change-number-btn').addEventListener('click', changeTableNumber);
    document.getElementById('rotate-table-btn').addEventListener('click', rotateSelectedTable);
    document.getElementById('remove-table-btn').addEventListener('click', removeSelectedTable);
    document.getElementById('save-layout-btn').addEventListener('click', saveLayout); // Передает event автоматически
    
    // Обработчики модальных окон
    document.querySelectorAll('.close-modal').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeAllModals);
    });
    
    // События внутри модального окна стола
    document.getElementById('table-status').addEventListener('change', updateTableStatus);
    document.getElementById('save-booking-btn').addEventListener('click', saveBooking);
    document.getElementById('save-order-btn').addEventListener('click', saveOrder);
    document.getElementById('add-item-btn').addEventListener('click', addOrderItem);
    document.getElementById('order-status').addEventListener('change', updateOrderStatus);
    
    // Закрытие модальных окон при клике вне их содержимого
    window.addEventListener('click', (e) => {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Предотвращение выделения текста в SVG при перетаскивании
    document.getElementById('hall-layout').addEventListener('selectstart', e => {
        if (isDragging) {
            e.preventDefault();
            return false;
        }
    });
}

// ----- ОТРИСОВКА СТОЛОВ -----
function renderTables() {
    const svgElement = document.getElementById('hall-layout');
    
    // Очистка текущего содержимого
    svgElement.innerHTML = '';
    
    // Установка группы для перемещения и масштабирования
    const transform = `translate(${svgOffsetX}, ${svgOffsetY}) scale(${currentScale})`;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', transform);
    g.setAttribute('class', 'no-select'); // Класс для предотвращения выделения текста
    svgElement.appendChild(g);
    
    // Отрисовка каждого стола
    tables.forEach(table => {
        if (table.type === 'rect') {
            drawRectTable(table, g);
        } else if (table.type === 'circle') {
            drawCircleTable(table, g);
        }
    });
}

// Отрисовка прямоугольного стола
function drawRectTable(table, parent) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', table.x);
    rect.setAttribute('y', table.y);
    rect.setAttribute('width', table.width);
    rect.setAttribute('height', table.height);
    rect.setAttribute('class', `table rect ${table.status}${selectedTableId === table.id ? ' selected' : ''}`);
    rect.setAttribute('data-id', table.id);
    
    // Применение поворота, если он указан
    if (table.rotation && table.rotation !== 0) {
        // Вычисляем центр стола для поворота вокруг него
        const centerX = table.x + table.width / 2;
        const centerY = table.y + table.height / 2;
        const transform = `rotate(${table.rotation} ${centerX} ${centerY})`;
        rect.setAttribute('transform', transform);
    }
    
    rect.addEventListener('click', () => handleTableClick(table.id));
    
    // Если админ режим, добавляем возможность перетаскивания
    if (isAdminMode) {
        setupDraggable(rect, table);
    }
    
    parent.appendChild(rect);
    
    // Добавление номера стола (номер не поворачивается)
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', table.x + table.width / 2);
    text.setAttribute('y', table.y + table.height / 2 + 5);
    text.setAttribute('class', 'table-text');
    text.textContent = table.id;
    
    parent.appendChild(text);
    
    // Добавление всплывающей подсказки с информацией о заказе (если есть)
    if (table.order && table.status === 'occupied') {
        addOrderTooltip(table, parent);
    }
}

// Отрисовка круглого стола
function drawCircleTable(table, parent) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', table.x);
    circle.setAttribute('cy', table.y);
    circle.setAttribute('r', table.radius);
    circle.setAttribute('class', `table circle ${table.status}${selectedTableId === table.id ? ' selected' : ''}`);
    circle.setAttribute('data-id', table.id);
    
    // Для круглых столов поворот не влияет на форму круга, но мы можем применять его к внутренним элементам
    // если такие будут добавлены в будущем
    
    circle.addEventListener('click', () => handleTableClick(table.id));
    
    // Если админ режим, добавляем возможность перетаскивания
    if (isAdminMode) {
        setupDraggable(circle, table);
    }
    
    parent.appendChild(circle);
    
    // Добавление номера стола
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', table.x);
    text.setAttribute('y', table.y + 5);
    text.setAttribute('class', 'table-text');
    text.textContent = table.id;
    
    parent.appendChild(text);
    
    // Добавление всплывающей подсказки с информацией о заказе (если есть)
    if (table.order && table.status === 'occupied') {
        addOrderTooltip(table, parent);
    }
}

// Добавление всплывающей подсказки с информацией о заказе
function addOrderTooltip(table, parent) {
    // Эта функция может быть расширена для добавления всплывающих подсказок
    // В текущей версии подсказка будет отображаться при наведении через CSS
}

// ----- ОБРАБОТКА НАЖАТИЯ НА СТОЛ -----
function handleTableClick(tableId) {
    // Если в режиме администратора, только выбираем стол
    if (isAdminMode) {
        selectedTableId = tableId;
        renderTables();
        return;
    }
    
    // Открываем модальное окно с информацией о столе
    selectedTableId = tableId;
    openTableModal(tableId);
}

// ----- МОДАЛЬНЫЕ ОКНА -----
function openTableModal(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    
    // Заполнение информации о столе
    document.getElementById('modal-table-number').textContent = table.id;
    document.getElementById('table-status').value = table.status;
    document.getElementById('table-seats').textContent = table.seats;
    
    // Заполнение информации о бронировании (если есть)
    const bookingSection = document.getElementById('booking-section');
    if (table.status === 'reserved' && table.booking) {
        document.getElementById('client-name').value = table.booking.clientName || '';
        document.getElementById('booking-time').value = table.booking.time || '';
        document.getElementById('people-count').value = table.booking.peopleCount || '';
        bookingSection.style.display = 'block';
    } else if (table.status === 'reserved') {
        document.getElementById('client-name').value = '';
        document.getElementById('booking-time').value = '';
        document.getElementById('people-count').value = '';
        bookingSection.style.display = 'block';
    } else {
        bookingSection.style.display = 'none';
    }
    
    // Заполнение информации о заказе (если есть)
    const orderSection = document.getElementById('order-section');
    if (table.status === 'occupied') {
        orderSection.style.display = 'block';
        
        // Заполнение статуса заказа
        document.getElementById('order-status').value = table.order?.status || 'in-progress';
        
        // Отрисовка списка блюд
        renderOrderItems(table.order?.items || []);
        
        // Обновление общей суммы
        updateOrderTotal(table.order?.items || []);
    } else {
        orderSection.style.display = 'none';
    }
    
    // Отображение модального окна
    document.getElementById('table-modal').style.display = 'block';
}

// Отрисовка элементов заказа
function renderOrderItems(items = []) {
    const orderItemsList = document.getElementById('order-items-list');
    orderItemsList.innerHTML = '';
    
    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'order-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'order-item-name';
        nameSpan.textContent = item.name;
        
        const priceSpan = document.createElement('span');
        priceSpan.className = 'order-item-price';
        priceSpan.textContent = `${item.price} ₽`;
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-item-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', () => removeOrderItem(index));
        
        li.appendChild(nameSpan);
        li.appendChild(priceSpan);
        li.appendChild(deleteBtn);
        
        orderItemsList.appendChild(li);
    });
}

// Обновление общей суммы заказа
function updateOrderTotal(items = []) {
    const total = items.reduce((sum, item) => sum + Number(item.price), 0);
    document.getElementById('order-total-amount').textContent = total;
}

// Удаление элемента заказа
function removeOrderItem(index) {
    const table = tables.find(t => t.id === selectedTableId);
    if (!table || !table.order || !table.order.items) return;
    
    table.order.items.splice(index, 1);
    renderOrderItems(table.order.items);
    updateOrderTotal(table.order.items);
    
    // Сохранение обновленного списка заказов
    saveAllData(); // Сохраняем все данные
}

// Добавление нового элемента в заказ
function addOrderItem() {
    const itemName = document.getElementById('item-name').value.trim();
    const itemPrice = document.getElementById('item-price').value;
    
    if (!itemName || !itemPrice) {
        alert('Введите название и цену блюда');
        return;
    }
    
    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;
    
    // Инициализация заказа, если его нет
    if (!table.order) {
        table.order = {
            status: 'in-progress',
            items: []
        };
    }
    
    // Добавление нового элемента
    table.order.items.push({
        name: itemName,
        price: Number(itemPrice)
    });
    
    // Обновление интерфейса
    renderOrderItems(table.order.items);
    updateOrderTotal(table.order.items);
    
    // Очистка полей ввода
    document.getElementById('item-name').value = '';
    document.getElementById('item-price').value = '';
    
    // Сохранение обновленного списка заказов
    saveAllData(); // Сохраняем все данные
}

// Сохранение данных о заказах в LocalStorage
function saveOrders() {
    const orders = {};
    tables.forEach(table => {
        if (table.order) {
            orders[table.id] = table.order;
        }
    });
    
    localStorage.setItem('orders', JSON.stringify(orders));
}

// Закрытие всех модальных окон
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// ----- УПРАВЛЕНИЕ СТАТУСОМ СТОЛА -----
function updateTableStatus() {
    const newStatus = document.getElementById('table-status').value;
    const table = tables.find(t => t.id === selectedTableId);
    
    if (!table) return;
    
    // Обновление статуса
    table.status = newStatus;
    
    // Обработка действий при изменении статуса
    if (newStatus === 'free') {
        // Если стол становится свободным, удаляем информацию о заказе и бронировании
        table.order = null;
        table.booking = null;
        
        // Скрываем секции заказа и бронирования
        document.getElementById('booking-section').style.display = 'none';
        document.getElementById('order-section').style.display = 'none';
    } else if (newStatus === 'reserved') {
        // Если стол забронирован, показываем секцию бронирования
        document.getElementById('booking-section').style.display = 'block';
        document.getElementById('order-section').style.display = 'none';
    } else if (newStatus === 'occupied') {
        // Если стол занят, показываем секцию заказа
        document.getElementById('booking-section').style.display = 'none';
        document.getElementById('order-section').style.display = 'block';
        
        // Инициализация заказа, если его нет
        if (!table.order) {
            table.order = {
                status: 'in-progress',
                items: []
            };
        }
        
        // Обновление интерфейса заказа
        document.getElementById('order-status').value = table.order.status;
        renderOrderItems(table.order.items);
        updateOrderTotal(table.order.items);
    }
    
    // Обновление отображения и сохранение данных
    renderTables();
    saveAllData(); // Сохраняем все данные
}

// ----- УПРАВЛЕНИЕ БРОНИРОВАНИЕМ -----
function saveBooking() {
    const clientName = document.getElementById('client-name').value.trim();
    const bookingTime = document.getElementById('booking-time').value;
    const peopleCount = document.getElementById('people-count').value;
    
    // Валидация
    if (!clientName || !bookingTime || !peopleCount) {
        alert('Заполните все поля бронирования');
        return;
    }
    
    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;
    
    // Сохранение информации о бронировании
    table.booking = {
        clientName,
        time: bookingTime,
        peopleCount: Number(peopleCount)
    };
    
    // Установка статуса "забронирован"
    table.status = 'reserved';
    document.getElementById('table-status').value = 'reserved';
    
    // Обновление интерфейса и сохранение данных
    renderTables();
    saveAllData(); // Сохраняем все данные
    
    alert('Бронирование сохранено');
}

// Сохранение данных о бронированиях в LocalStorage
function saveBookings() {
    const bookings = {};
    tables.forEach(table => {
        if (table.booking) {
            bookings[table.id] = table.booking;
        }
    });
    
    localStorage.setItem('bookings', JSON.stringify(bookings));
}

// ----- УПРАВЛЕНИЕ ЗАКАЗАМИ -----
function saveOrder() {
    const orderStatus = document.getElementById('order-status').value;
    
    const table = tables.find(t => t.id === selectedTableId);
    if (!table || !table.order) return;
    
    // Обновление статуса заказа
    table.order.status = orderStatus;
    
    // Если заказ оплачен, сбрасываем статус стола на "свободен"
    if (orderStatus === 'paid') {
        table.status = 'free';
        table.order = null;
        
        // Обновление интерфейса
        document.getElementById('table-status').value = 'free';
        document.getElementById('order-section').style.display = 'none';
    }
    
    // Обновление интерфейса и сохранение данных
    renderTables();
    saveAllData(); // Сохраняем все данные
    
    alert('Заказ сохранен');
}

// Обновление статуса заказа
function updateOrderStatus() {
    const orderStatus = document.getElementById('order-status').value;
    
    const table = tables.find(t => t.id === selectedTableId);
    if (!table || !table.order) return;
    
    // Обновление статуса заказа
    table.order.status = orderStatus;
    
    // Если заказ оплачен, сбрасываем статус стола на "свободен"
    if (orderStatus === 'paid') {
        // Подтверждение от пользователя
        if (confirm('Заказ оплачен. Освободить стол?')) {
            table.status = 'free';
            table.order = null;
            
            // Обновление интерфейса
            document.getElementById('table-status').value = 'free';
            document.getElementById('order-section').style.display = 'none';
            
            // Закрытие модального окна
            closeAllModals();
        }
    }
    
    // Обновление интерфейса и сохранение данных
    renderTables();
    saveAllData(); // Сохраняем все данные
}

// ----- ПОИСК СТОЛА -----
function findTable() {
    const tableNumber = parseInt(document.getElementById('table-search').value);
    const errorElement = document.getElementById('search-error');
    
    // Сбрасываем предыдущую подсветку
    document.querySelectorAll('.table.highlighted').forEach(el => {
        el.classList.remove('highlighted');
    });
    
    // Валидация
    if (isNaN(tableNumber) || tableNumber <= 0) {
        errorElement.textContent = 'Введите корректный номер стола';
        return;
    }
    
    // Поиск стола
    const table = tables.find(t => t.id === tableNumber);
    if (!table) {
        errorElement.textContent = `Стол №${tableNumber} не найден`;
        return;
    }
    
    // Очистка сообщения об ошибке
    errorElement.textContent = '';
    
    // Подсветка найденного стола
    const tableElement = document.querySelector(`.table[data-id="${tableNumber}"]`);
    if (tableElement) {
        tableElement.classList.add('highlighted');
        
        // Прокрутка к столу (центрирование)
        centerViewOnTable(table);
    }
}

// Центрирование вида на выбранном столе
function centerViewOnTable(table) {
    const svgElement = document.getElementById('hall-layout');
    const svgWidth = svgElement.clientWidth;
    const svgHeight = svgElement.clientHeight;
    
    // Вычисление центральной точки стола
    let centerX, centerY;
    if (table.type === 'rect') {
        centerX = table.x + table.width / 2;
        centerY = table.y + table.height / 2;
    } else {
        centerX = table.x;
        centerY = table.y;
    }
    
    // Настройка смещения для центрирования
    svgOffsetX = svgWidth / 2 - centerX * currentScale;
    svgOffsetY = svgHeight / 2 - centerY * currentScale;
    
    // Перерисовка
    renderTables();
}

// ----- НАСТРОЙКА МАСШТАБИРОВАНИЯ И ПЕРЕМЕЩЕНИЯ -----
function setupZoomAndPan() {
    const svgElement = document.getElementById('hall-layout');
    
    // Обработка масштабирования колесиком мыши
    svgElement.addEventListener('wheel', (e) => {
        e.preventDefault(); // Предотвращаем стандартное поведение прокрутки
        
        if (!isAdminMode) {
            // Определение направления прокрутки
            const delta = e.deltaY < 0 ? 1.1 : 0.9;
            
            // Расчет новых координат мыши относительно SVG
            const rect = svgElement.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Масштабирование относительно положения курсора
            const newScale = Math.max(0.5, Math.min(3, currentScale * delta));
            
            // Регулировка смещения для сохранения центра масштабирования
            svgOffsetX = mouseX - (mouseX - svgOffsetX) * newScale / currentScale;
            svgOffsetY = mouseY - (mouseY - svgOffsetY) * newScale / currentScale;
            
            currentScale = newScale;
            
            // Обновление отображения
            renderTables();
        }
    }, { passive: false }); // Важно для предотвращения прокрутки страницы
    
    // Обработка перемещения с помощью перетаскивания
    svgElement.addEventListener('mousedown', (e) => {
        if (!isAdminMode && e.button === 0) { // Левая кнопка мыши
            isDragging = true;
            dragStartX = e.clientX - svgOffsetX;
            dragStartY = e.clientY - svgOffsetY;
            svgElement.style.cursor = 'grabbing';
            e.preventDefault(); // Предотвращаем выделение текста
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (isDragging && !isAdminMode) {
            svgOffsetX = e.clientX - dragStartX;
            svgOffsetY = e.clientY - dragStartY;
            renderTables();
            e.preventDefault(); // Предотвращаем выделение текста
        }
    });
    
    document.addEventListener('mouseup', (e) => {
        if (isDragging) {
            isDragging = false;
            svgElement.style.cursor = 'move';
            e.preventDefault(); // Предотвращаем выделение текста
        }
    });
    
    // Установка курсора по умолчанию
    svgElement.style.cursor = 'move';
}

// Сброс масштаба и позиции
function resetView() {
    svgOffsetX = 0;
    svgOffsetY = 0;
    currentScale = 1;
    renderTables();
}

// ----- РЕЖИМ АДМИНИСТРАТОРА -----
function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    
    // Обновление текста кнопки
    const adminBtn = document.getElementById('admin-mode-btn');
    adminBtn.textContent = isAdminMode ? 'Выйти из режима администратора' : 'Режим администратора';
    
    // Показать/скрыть кнопки администратора
    const adminControls = document.getElementById('admin-controls');
    adminControls.style.display = isAdminMode ? 'block' : 'none';
    
    // Если выходим из режима администратора, сбрасываем выбранный стол
    if (!isAdminMode) {
        selectedTableId = null;
    }
    
    // Обновление отображения
    renderTables();
}

// Открытие модального окна для добавления стола
function openAddTableModal() {
    document.getElementById('admin-modal').style.display = 'block';
}

// Добавление нового стола
function addNewTable() {
    const shape = document.getElementById('new-table-shape').value;
    const seats = parseInt(document.getElementById('new-table-seats').value);
    
    // Генерация нового ID
    const maxId = tables.reduce((max, table) => Math.max(max, table.id), 0);
    const newId = maxId + 1;
    
    // Создание нового стола
    let newTable;
    if (shape === 'rect') {
        newTable = {
            id: newId,
            type: 'rect',
            x: 200,
            y: 200,
            width: 80,
            height: 60,
            seats: seats,
            status: 'free',
            rotation: 0
        };
    } else {
        newTable = {
            id: newId,
            type: 'circle',
            x: 200,
            y: 200,
            radius: 40,
            seats: seats,
            status: 'free',
            rotation: 0
        };
    }
    
    // Добавление стола в массив
    tables.push(newTable);
    
    // Выбор нового стола для возможного перемещения
    selectedTableId = newId;
    
    // Закрытие модального окна
    document.getElementById('admin-modal').style.display = 'none';
    
    // Обновление отображения и сохранение данных
    renderTables();
    saveAllData(); // Сохраняем все данные
}


// Открытие модального окна для изменения номера стола
function openChangeNumberModal() {
    if (!selectedTableId) {
        alert('Сначала выберите стол для изменения номера');
        return;
    }
    
    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;
    
    // Установка текущего номера в поле ввода
    document.getElementById('new-table-number').value = table.id;
    
    // Отображение модального окна
    document.getElementById('change-number-modal').style.display = 'block';
}

// Изменение номера стола
function changeTableNumber() {
    if (!selectedTableId) return;
    
    const newNumber = parseInt(document.getElementById('new-table-number').value);
    
    // Проверка валидности номера
    if (isNaN(newNumber) || newNumber <= 0) {
        alert('Пожалуйста, введите корректный номер стола');
        return;
    }
    
    // Проверка, не занят ли уже этот номер
    if (tables.some(t => t.id === newNumber && t.id !== selectedTableId)) {
        alert(`Стол с номером ${newNumber} уже существует`);
        return;
    }
    
    // Найти выбранный стол и изменить его номер
    const table = tables.find(t => t.id === selectedTableId);
    if (table) {
        // Сохраняем старый ID для обновления заказов и бронирований
        const oldId = table.id;
        
        // Обновляем ID стола
        table.id = newNumber;
        
        // Обновляем ID в заказах и бронированиях
        const orders = JSON.parse(localStorage.getItem('orders') || '{}');
        const bookings = JSON.parse(localStorage.getItem('bookings') || '{}');
        
        if (orders[oldId]) {
            orders[newNumber] = orders[oldId];
            delete orders[oldId];
            localStorage.setItem('orders', JSON.stringify(orders));
        }
        
        if (bookings[oldId]) {
            bookings[newNumber] = bookings[oldId];
            delete bookings[oldId];
            localStorage.setItem('bookings', JSON.stringify(bookings));
        }
        
        // Обновляем выбранный ID
        selectedTableId = newNumber;
        
        // Закрытие модального окна
        document.getElementById('change-number-modal').style.display = 'none';
        
        // Обновление отображения и сохранение данных
        renderTables();
        saveAllData(); // Сохраняем все данные
    }
}

// Поворот выбранного стола
function rotateSelectedTable() {
    if (!selectedTableId) {
        alert('Сначала выберите стол для поворота');
        return;
    }
    
    const table = tables.find(t => t.id === selectedTableId);
    if (!table) return;
    
    // Для круглых столов поворот не имеет смысла
    if (table.type === 'circle') {
        alert('Круглые столы нельзя повернуть');
        return;
    }
    
    // Поворот на 90 градусов по часовой стрелке
    table.rotation = (table.rotation || 0) + 90;
    if (table.rotation >= 360) table.rotation = 0;
    
    // Если стол повернут на 90 или 270 градусов, меняем местами ширину и высоту
    if (table.rotation === 90 || table.rotation === 270) {
        // Если это первый поворот, меняем размеры
        if (!table.originalWidth) {
            table.originalWidth = table.width;
            table.originalHeight = table.height;
            
            // Меняем местами ширину и высоту
            const temp = table.width;
            table.width = table.height;
            table.height = temp;
        }
    } else {
        // Если стол вернулся в исходное положение (0 или 180 градусов),
        // возвращаем исходные размеры, если они были сохранены
        if (table.originalWidth) {
            table.width = table.originalWidth;
            table.height = table.originalHeight;
            
            // Очищаем сохраненные оригинальные размеры если стол вернулся в исходное положение
            if (table.rotation === 0) {
                delete table.originalWidth;
                delete table.originalHeight;
            }
        }
    }
    
    // Обновление отображения и сохранение данных
    renderTables();
    saveAllData(); // Сохраняем все данные
}

// Удаление выбранного стола
function removeSelectedTable() {
    if (!selectedTableId) {
        alert('Сначала выберите стол для удаления');
        return;
    }
    
    // Подтверждение удаления
    if (confirm(`Вы уверены, что хотите удалить стол №${selectedTableId}?`)) {
        // Фильтрация массива столов
        tables = tables.filter(table => table.id !== selectedTableId);
        
        // Сброс выбранного стола
        selectedTableId = null;
        
        // Обновление отображения и сохранение данных
        renderTables();
        saveAllData(); // Сохраняем все данные
    }
}

// ----- СОХРАНЕНИЕ ДАННЫХ -----
// Сохранение всех данных в LocalStorage
function saveAllData() {
    // Вызываем saveLayout без параметра, так как это не событие клика
    saveLayout();
    saveOrders();
    saveBookings();
    
    // Обновляем время последнего локального обновления
    localStorage.setItem('lastUpdateTime', new Date().toISOString());
    
    // Если доступна функция синхронизации, используем её
    if (typeof syncWithServer === 'function') {
        syncWithServer().catch(error => {
            console.error('Ошибка при синхронизации с сервером:', error);
        });
    }
}

// Сохранение макета в LocalStorage
// Сохранение макета в LocalStorage
function saveLayout(e) {
    localStorage.setItem('restaurantLayout', JSON.stringify(tables));
    
    // Только для кнопки явного сохранения показываем уведомление
    if (e && e.type === 'click' && e.target && e.target.id === 'save-layout-btn') {
        alert('Макет успешно сохранен');
    }
}

// Настройка перетаскивания столов в режиме администратора
function setupDraggable(element, table) {
    let startX, startY;
    
    element.addEventListener('mousedown', (e) => {
        if (isAdminMode) {
            e.stopPropagation();
            isDragging = true;
            
            // Запоминаем начальные координаты
            startX = e.clientX;
            startY = e.clientY;
            
            // Выбираем стол
            selectedTableId = table.id;
            renderTables();
            
            // Настройка обработчиков для перетаскивания
            const onMouseMove = (e) => {
                if (isDragging) {
                    // Вычисление смещения
                    const dx = (e.clientX - startX) / currentScale;
                    const dy = (e.clientY - startY) / currentScale;
                    
                    // Обновление координат стола
                    if (table.type === 'rect') {
                        table.x += dx;
                        table.y += dy;
                    } else {
                        table.x += dx;
                        table.y += dy;
                    }
                    
                    // Обновление начальных координат для следующего события
                    startX = e.clientX;
                    startY = e.clientY;
                    
                    // Обновление отображения
                    renderTables();
                }
            };
            
            const onMouseUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
    });
}

// ----- УВЕДОМЛЕНИЯ О БРОНИРОВАНИИ -----
function checkForBookingNotifications() {
    // Проверка уведомлений каждую минуту
    setInterval(() => {
        const now = new Date();
        const nearFutureTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 минут вперед
        
        // Поиск близких по времени бронирований
        tables.forEach(table => {
            if (table.booking && table.status === 'reserved') {
                const bookingTime = new Date(table.booking.time);
                
                // Если бронирование в ближайшие 15 минут
                if (bookingTime > now && bookingTime < nearFutureTime) {
                    const minutesRemaining = Math.floor((bookingTime - now) / (60 * 1000));
                    
                    // Показываем уведомление, если оно не было показано недавно
                    const notificationKey = `notification_${table.id}_${table.booking.time}`;
                    if (!localStorage.getItem(notificationKey)) {
                        showBookingNotification(table, minutesRemaining);
                        
                        // Отмечаем, что уведомление было показано
                        localStorage.setItem(notificationKey, 'true');
                        
                        // Удаляем отметку через час
                        setTimeout(() => {
                            localStorage.removeItem(notificationKey);
                        }, 60 * 60 * 1000);
                    }
                }
            }
        });
    }, 60 * 1000); // Проверка каждую минуту
}

// Показать уведомление о бронировании
function showBookingNotification(table, minutesRemaining) {
    // Проверка поддержки уведомлений
    if (!("Notification" in window)) {
        alert(`Приближается время бронирования стола №${table.id}! Осталось ${minutesRemaining} минут.`);
        return;
    }
    
    // Запрос разрешения на показ уведомлений
    if (Notification.permission === "granted") {
        createNotification(table, minutesRemaining);
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                createNotification(table, minutesRemaining);
            }
        });
    }
}

// Создание и отображение уведомления
function createNotification(table, minutesRemaining) {
    const notification = new Notification("Напоминание о бронировании", {
        body: `Приближается время бронирования стола №${table.id}! Осталось ${minutesRemaining} минут. Гость: ${table.booking.clientName}, человек: ${table.booking.peopleCount}.`,
        icon: "/icon.png" // Можно добавить иконку для уведомления
    });
    
    // Обработчик клика по уведомлению
    notification.onclick = function() {
        window.focus();
        selectedTableId = table.id;
        openTableModal(table.id);
        this.close();
    };
}