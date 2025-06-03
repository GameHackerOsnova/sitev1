import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import session from 'express-session';
import memorystore from 'memorystore';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const MemoryStore = memorystore(session);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Конфигурация загрузки файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, ['.rar', '.zip', '.7z'].includes(ext));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Исправленная конфигурация сессии
app.use(session({
  secret: 'archive-hub-secret',
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({
    checkPeriod: 86400000
  }),
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 86400000
  }
}));

app.use(express.json());
app.use(express.static(__dirname));

// Хранилище данных
const db = {
  users: new Map(),
  categories: new Map(),
  files: new Map(),
  nextId: { user: 1, category: 1, file: 1 }
};

// Инициализация данных
(() => {
  const admin = {
    id: db.nextId.user++,
    username: 'admin',
    password: 'adminpassword',
    isAdmin: true
  };
  db.users.set(admin.id, admin);

  db.categories.set(db.nextId.category++, {
    id: db.nextId.category,
    name: 'Программы',
    description: 'ПО в архивах',
    createdAt: new Date()
  });
})();

// Middleware
const isAuthenticated = (req, res, next) => req.session.userId ? next() : res.status(401).json({ message: 'Не авторизован' });
const isAdmin = (req, res, next) => {
  const user = db.users.get(req.session.userId);
  user?.isAdmin ? next() : res.status(403).json({ message: 'Доступ запрещен' });
};

// Маршруты
app.post('/api/login', (req, res) => {
  const user = Array.from(db.users.values()).find(u => 
    u.username === req.body.username && 
    u.password === req.body.password
  );
  if (!user) return res.status(401).json({ message: 'Ошибка авторизации' });
  
  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Ошибка при выходе' });
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Успешный выход' });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: 'Не авторизован' });
  }
  
  const user = db.users.get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: 'Пользователь не найден' });
  }
  
  res.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin
  });
});

// Категории API
app.get('/api/categories', (req, res) => {
  const categories = Array.from(db.categories.values());
  
  // Добавляем счетчик файлов
  const result = categories.map(category => {
    const files = Array.from(db.files.values()).filter(file => file.categoryId === category.id);
    return {
      ...category,
      fileCount: files.length
    };
  });
  
  res.json(result);
});

app.get('/api/categories/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Неверный ID категории' });
  }
  
  const category = db.categories.get(id);
  if (!category) {
    return res.status(404).json({ message: 'Категория не найдена' });
  }
  
  const files = Array.from(db.files.values()).filter(file => file.categoryId === id);
  
  res.json({
    ...category,
    files,
    fileCount: files.length
  });
});

app.post('/api/categories', isAdmin, (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ message: 'Имя категории обязательно' });
  }
  
  const id = db.nextCategoryId++;
  const now = new Date();
  
  const category = {
    id,
    name,
    description: description || null,
    createdAt: now
  };
  
  db.categories.set(id, category);
  res.status(201).json(category);
});

app.put('/api/categories/:id', isAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Неверный ID категории' });
  }
  
  const category = db.categories.get(id);
  if (!category) {
    return res.status(404).json({ message: 'Категория не найдена' });
  }
  
  const { name, description } = req.body;
  
  if (name) {
    category.name = name;
  }
  
  if (description !== undefined) {
    category.description = description;
  }
  
  db.categories.set(id, category);
  res.json(category);
});

app.delete('/api/categories/:id', isAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Неверный ID категории' });
  }
  
  const category = db.categories.get(id);
  if (!category) {
    return res.status(404).json({ message: 'Категория не найдена' });
  }
  
  // Удаляем связанные файлы
  const filesToDelete = [];
  for (const [fileId, file] of db.files.entries()) {
    if (file.categoryId === id) {
      filesToDelete.push({ id: fileId, path: file.path });
    }
  }
  
  // Удаляем файлы с диска
  filesToDelete.forEach(file => {
    try {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      db.files.delete(file.id);
    } catch (error) {
      console.error(`Ошибка при удалении файла: ${error}`);
    }
  });
  
  // Удаляем категорию
  db.categories.delete(id);
  res.status(204).end();
});

// Файлы API
app.get('/api/files', (req, res) => {
  let files = Array.from(db.files.values());
  
  const categoryId = req.query.categoryId ? parseInt(req.query.categoryId) : null;
  if (categoryId && !isNaN(categoryId)) {
    files = files.filter(file => file.categoryId === categoryId);
  }
  
  res.json(files);
});

app.get('/api/files/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Неверный ID файла' });
  }
  
  const file = db.files.get(id);
  if (!file) {
    return res.status(404).json({ message: 'Файл не найден' });
  }
  
  res.json(file);
});

app.post('/api/files', isAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Файл не загружен' });
  }
  
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  let fileType;
  
  if (fileExt === '.rar') fileType = 'RAR';
  else if (fileExt === '.zip') fileType = 'ZIP';
  else if (fileExt === '.7z') fileType = '7Z';
  else {
    // Не должно происходить из-за fileFilter, но на всякий случай
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Неверный тип файла' });
  }
  
  const { name, description, categoryId } = req.body;
  const catId = parseInt(categoryId);
  
  if (isNaN(catId)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Неверный ID категории' });
  }
  
  const category = db.categories.get(catId);
  if (!category) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Категория не найдена' });
  }
  
  const id = db.nextFileId++;
  const now = new Date();
  
  const file = {
    id,
    name: name || req.file.originalname,
    description: description || null,
    size: req.file.size,
    path: req.file.path,
    type: fileType,
    downloads: 0,
    categoryId: catId,
    createdAt: now
  };
  
  db.files.set(id, file);
  res.status(201).json(file);
});

app.delete('/api/files/:id', isAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Неверный ID файла' });
  }
  
  const file = db.files.get(id);
  if (!file) {
    return res.status(404).json({ message: 'Файл не найден' });
  }
  
  // Удаляем файл с диска
  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (error) {
    console.error(`Ошибка при удалении файла: ${error}`);
  }
  
  // Удаляем из хранилища
  db.files.delete(id);
  res.status(204).end();
});

// Скачивание файла
app.get('/api/download/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ message: 'Неверный ID файла' });
  }
  
  const file = db.files.get(id);
  if (!file) {
    return res.status(404).json({ message: 'Файл не найден' });
  }
  
  // Увеличиваем счетчик скачиваний
  file.downloads++;
  db.files.set(id, file);
  
  // Проверяем наличие файла
  if (!fs.existsSync(file.path)) {
    return res.status(404).json({ message: 'Файл не найден на сервере' });
  }
  
  // Устанавливаем правильный Content-Type
  let contentType = 'application/octet-stream';
  if (file.type === 'ZIP') contentType = 'application/zip';
  else if (file.type === 'RAR') contentType = 'application/x-rar-compressed';
  else if (file.type === '7Z') contentType = 'application/x-7z-compressed';
  
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  
  // Отправляем файл
  const fileStream = fs.createReadStream(file.path);
  fileStream.pipe(res);
});

// Статистика
app.get('/api/stats', isAdmin, (req, res) => {
  const categories = Array.from(db.categories.values());
  const files = Array.from(db.files.values());
  
  // Общее количество скачиваний
  const totalDownloads = files.reduce((sum, file) => sum + file.downloads, 0);
  
  // Статистика по категориям
  const categoryStats = categories.map(category => {
    const categoryFiles = files.filter(file => file.categoryId === category.id);
    const fileCount = categoryFiles.length;
    const downloads = categoryFiles.reduce((sum, file) => sum + file.downloads, 0);
    
    return {
      id: category.id,
      name: category.name,
      fileCount,
      downloads
    };
  });
  
  // Популярные файлы
  const popularFiles = [...files]
    .sort((a, b) => b.downloads - a.downloads)
    .slice(0, 5)
    .map(file => ({
      id: file.id,
      name: file.name,
      downloads: file.downloads
    }));
  
  res.json({
    totalFiles: files.length,
    totalCategories: categories.length,
    totalDownloads,
    categoryStats,
    popularFiles
  });
});

// Для всех остальных запросов отдаем index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});