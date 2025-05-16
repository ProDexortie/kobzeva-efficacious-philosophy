const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Строка подключения MongoDB
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
const dbName = "restaurant_app"; // Имя базы данных

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Подключение к MongoDB
async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Успешное подключение к MongoDB Atlas");
    return client.db(dbName);
  } catch (error) {
    console.error("Ошибка подключения к MongoDB:", error);
    process.exit(1);
  }
}

let db;

// API для получения данных
app.get('/api/data', async (req, res) => {
  try {
    const tablesCollection = db.collection('tables');
    const ordersCollection = db.collection('orders');
    const bookingsCollection = db.collection('bookings');

    // Получаем последнюю версию данных
    const tables = await tablesCollection.find({}).toArray();
    const orders = await ordersCollection.find({}).toArray();
    const bookings = await bookingsCollection.find({}).toArray();

    // Преобразовываем заказы и бронирования в объекты по ID стола
    const ordersObj = {};
    const bookingsObj = {};

    orders.forEach(order => {
      ordersObj[order.tableId] = {
        status: order.status,
        items: order.items
      };
    });

    bookings.forEach(booking => {
      bookingsObj[booking.tableId] = {
        clientName: booking.clientName,
        time: booking.time,
        peopleCount: booking.peopleCount
      };
    });

    res.json({
      tables,
      orders: ordersObj,
      bookings: bookingsObj,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    res.status(500).json({ error: "Ошибка при получении данных" });
  }
});

// API для сохранения данных
app.post('/api/data', async (req, res) => {
  try {
    const { tables, orders, bookings } = req.body;
    
    // Проверка наличия данных
    if (!tables) {
      return res.status(400).json({ error: "Отсутствуют данные о столах" });
    }
    
    const tablesCollection = db.collection('tables');
    const ordersCollection = db.collection('orders');
    const bookingsCollection = db.collection('bookings');
    
    // Очищаем коллекции перед обновлением данных
    await tablesCollection.deleteMany({});
    await ordersCollection.deleteMany({});
    await bookingsCollection.deleteMany({});
    
    // Сохраняем столы
    if (tables.length > 0) {
      await tablesCollection.insertMany(tables);
    }
    
    // Сохраняем заказы
    const ordersArray = [];
    for (const [tableId, orderData] of Object.entries(orders || {})) {
      if (orderData) {
        ordersArray.push({
          tableId: parseInt(tableId),
          status: orderData.status,
          items: orderData.items
        });
      }
    }
    
    if (ordersArray.length > 0) {
      await ordersCollection.insertMany(ordersArray);
    }
    
    // Сохраняем бронирования
    const bookingsArray = [];
    for (const [tableId, bookingData] of Object.entries(bookings || {})) {
      if (bookingData) {
        bookingsArray.push({
          tableId: parseInt(tableId),
          clientName: bookingData.clientName,
          time: bookingData.time,
          peopleCount: bookingData.peopleCount
        });
      }
    }
    
    if (bookingsArray.length > 0) {
      await bookingsCollection.insertMany(bookingsArray);
    }
    
    res.json({ 
      success: true, 
      message: "Данные успешно сохранены",
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error("Ошибка при сохранении данных:", error);
    res.status(500).json({ error: "Ошибка при сохранении данных" });
  }
});

// Маршрут для всех других запросов, чтобы работала SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
async function startServer() {
  db = await connectToDatabase();
  
  app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}

startServer().catch(console.error);