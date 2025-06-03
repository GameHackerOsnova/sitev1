// Инициализация страницы по её типу
document.addEventListener('DOMContentLoaded', function() {
  const path = window.location.pathname;
  
  if (path.includes('admin-login.html')) {
    initAdminLogin();
  } else if (path.includes('admin-dashboard.html')) {
    initAdminDashboard();
  }
});

// Вспомогательные функции
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU');
}

// Проверка авторизации
function checkAuth() {
  return fetch('/api/me')
    .then(response => {
      if (!response.ok) {
        throw new Error('Не авторизован');
      }
      return response.json();
    })
    .then(user => {
      if (!user.isAdmin) {
        throw new Error('Доступ запрещен');
      }
      return user;
    });
}

// Инициализация страницы входа для админа
function initAdminLogin() {
  const loginForm = document.getElementById('admin-login-form');
  const loginButton = document.getElementById('login-button');
  const loginError = document.getElementById('login-error');
  const usernameError = document.getElementById('username-error');
  const passwordError = document.getElementById('password-error');
  
  // Проверим, авторизован ли пользователь
  fetch('/api/me')
    .then(response => response.json())
    .then(user => {
      if (user && user.isAdmin) {
        // Уже авторизован и админ, перенаправляем
        window.location.href = 'admin-dashboard.html';
      }
    })
    .catch(() => {
      // Не авторизован, оставляем на странице входа
    });
  
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Сбрасываем ошибки
    loginError.textContent = '';
    usernameError.textContent = '';
    passwordError.textContent = '';
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Валидация
    let hasErrors = false;
    
    if (username.length < 3) {
      usernameError.textContent = 'Имя пользователя должно быть не менее 3 символов';
      hasErrors = true;
    }
    
    if (password.length < 6) {
      passwordError.textContent = 'Пароль должен быть не менее 6 символов';
      hasErrors = true;
    }
    
    if (hasErrors) {
      return;
    }
    
    // Показываем состояние загрузки
    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="loading-spinner"></span> Вход...';
    
    // Отправляем запрос на авторизацию
    fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Неверное имя пользователя или пароль');
      }
      return response.json();
    })
    .then(user => {
      if (user.isAdmin) {
        window.location.href = 'admin-dashboard.html';
      } else {
        loginError.textContent = 'У вас нет прав администратора';
      }
    })
    .catch(error => {
      loginError.textContent = error.message;
      loginButton.disabled = false;
      loginButton.textContent = 'Войти';
    });
  });
}

// Инициализация панели администратора
function initAdminDashboard() {
  // Проверка авторизации
  checkAuth()
    .then(() => {
      // Переключение вкладок
      setupTabs();
      
      // Загрузка данных для каждой вкладки
      loadCategories();
      loadFiles();
      loadStats();
      
      // Настройка модальных окон
      setupModals();
      
      // Настройка кнопки выхода
      document.getElementById('logout-button').addEventListener('click', logout);
    })
    .catch(() => {
      // Перенаправление на страницу входа
      window.location.href = 'admin-login.html';
    });
}

// Настройка переключения вкладок
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      
      // Деактивируем все вкладки
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Активируем выбранную вкладку
      button.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

// Загрузка категорий
function loadCategories() {
  const categoriesList = document.getElementById('categories-list');
  
  fetch('/api/categories')
    .then(response => response.json())
    .then(categories => {
      if (categories.length === 0) {
        categoriesList.innerHTML = `
          <div class="empty-state">
            <p>Категории не найдены. Создайте новую категорию.</p>
          </div>
        `;
      } else {
        categoriesList.innerHTML = categories.map(category => `
          <div class="category-item" data-id="${category.id}">
            <div class="category-details">
              <h3>${category.name}</h3>
              <p>${category.description || ''}</p>
            </div>
            <div class="category-actions">
              <button class="action-button edit-button" data-action="edit" data-id="${category.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="action-button delete-button" data-action="delete" data-id="${category.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          </div>
        `).join('');
        
        // Добавляем обработчики событий
        document.querySelectorAll('.edit-button[data-action="edit"]').forEach(button => {
          button.addEventListener('click', () => editCategory(button.getAttribute('data-id')));
        });
        
        document.querySelectorAll('.delete-button[data-action="delete"]').forEach(button => {
          button.addEventListener('click', () => confirmDeleteCategory(button.getAttribute('data-id')));
        });
      }
    })
    .catch(error => {
      console.error('Ошибка загрузки категорий:', error);
      categoriesList.innerHTML = `
        <div class="error-state">
          <p>Ошибка при загрузке категорий. Пожалуйста, повторите попытку позже.</p>
        </div>
      `;
    });
}

// Загрузка файлов
function loadFiles() {
  const filesContainer = document.getElementById('admin-files-container');
  
  fetch('/api/files')
    .then(response => response.json())
    .then(files => {
      if (files.length === 0) {
        filesContainer.innerHTML = `
          <div class="empty-state">
            <p>Файлы не найдены. Загрузите новый файл.</p>
          </div>
        `;
      } else {
        // Загружаем категории для отображения имен
        fetch('/api/categories')
          .then(response => response.json())
          .then(categories => {
            const categoryMap = {};
            categories.forEach(category => {
              categoryMap[category.id] = category.name;
            });
            
            // Отображаем файлы
            filesContainer.innerHTML = files.map(file => `
              <div class="file-item" data-id="${file.id}">
                <div class="file-info">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <div>
                    <div class="file-name">${file.name}</div>
                    ${file.description ? `<div class="file-description">${file.description}</div>` : ''}
                  </div>
                </div>
                <div class="file-category">
                  ${categoryMap[file.categoryId] || 'Неизвестно'}
                </div>
                <div class="file-type">
                  ${file.type}
                </div>
                <div class="file-size">
                  ${formatFileSize(file.size)}
                </div>
                <div class="file-downloads">
                  ${file.downloads}
                </div>
                <div class="file-actions">
                  <button class="action-button delete-button" data-action="delete-file" data-id="${file.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      <line x1="10" y1="11" x2="10" y2="17"></line>
                      <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('');
            
            // Добавляем обработчики событий
            document.querySelectorAll('.action-button[data-action="delete-file"]').forEach(button => {
              button.addEventListener('click', () => confirmDeleteFile(button.getAttribute('data-id')));
            });
          });
      }
    })
    .catch(error => {
      console.error('Ошибка загрузки файлов:', error);
      filesContainer.innerHTML = `
        <div class="error-state">
          <p>Ошибка при загрузке файлов. Пожалуйста, повторите попытку позже.</p>
        </div>
      `;
    });
}

// Загрузка статистики
function loadStats() {
  fetch('/api/stats')
    .then(response => response.json())
    .then(stats => {
      // Общая статистика
      document.getElementById('total-downloads').textContent = stats.totalDownloads;
      document.getElementById('total-files').textContent = stats.totalFiles;
      document.getElementById('total-categories').textContent = stats.totalCategories;
      
      // Популярные файлы
      const popularFilesContainer = document.getElementById('popular-files');
      
      if (stats.popularFiles.length === 0) {
        popularFilesContainer.innerHTML = `
          <div class="empty-state">
            <p>Нет данных о скачиваниях</p>
          </div>
        `;
      } else {
        popularFilesContainer.innerHTML = stats.popularFiles.map(file => `
          <div class="stats-item">
            <div class="stats-info">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stats-info-icon">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span class="stats-name">${file.name}</span>
            </div>
            <span class="stats-count">${file.downloads} скачиваний</span>
          </div>
        `).join('');
      }
      
      // Статистика по категориям
      const categoryStatsContainer = document.getElementById('category-stats');
      
      if (stats.categoryStats.length === 0) {
        categoryStatsContainer.innerHTML = `
          <div class="empty-state">
            <p>Нет категорий</p>
          </div>
        `;
      } else {
        categoryStatsContainer.innerHTML = stats.categoryStats.map(category => `
          <div class="stats-item">
            <div class="stats-info">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stats-info-icon">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <path d="M12 8v8"></path>
                <path d="M8 12h8"></path>
              </svg>
              <span class="stats-name">${category.name}</span>
            </div>
            <div>
              <span class="stats-count">${category.fileCount} файлов</span>
              <span class="stats-count">${category.downloads} скачиваний</span>
            </div>
          </div>
        `).join('');
      }
    })
    .catch(error => {
      console.error('Ошибка загрузки статистики:', error);
      document.querySelectorAll('#stats-tab .stats-list').forEach(container => {
        container.innerHTML = `
          <div class="error-state">
            <p>Ошибка при загрузке статистики. Пожалуйста, повторите попытку позже.</p>
          </div>
        `;
      });
    });
}

// Настройка модальных окон
function setupModals() {
  const modalOverlay = document.getElementById('modal-overlay');
  const categoryModal = document.getElementById('category-modal');
  const fileModal = document.getElementById('file-modal');
  const confirmModal = document.getElementById('confirm-modal');
  
  // Обработчики закрытия модальных окон
  document.querySelectorAll('.modal-close, .modal-cancel').forEach(button => {
    button.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
      categoryModal.classList.remove('active');
      fileModal.classList.remove('active');
      confirmModal.classList.remove('active');
    });
  });
  
  // Кнопка добавления категории
  document.getElementById('add-category-button').addEventListener('click', () => {
    document.getElementById('category-modal-title').textContent = 'Добавить категорию';
    document.getElementById('category-id').value = '';
    document.getElementById('category-name').value = '';
    document.getElementById('category-description').value = '';
    document.getElementById('category-name-error').textContent = '';
    
    modalOverlay.classList.add('active');
    categoryModal.classList.add('active');
  });
  
  // Кнопка добавления файла
  document.getElementById('add-file-button').addEventListener('click', () => {
    document.getElementById('file').value = '';
    document.getElementById('file-name').value = '';
    document.getElementById('file-description').value = '';
    document.getElementById('file-error').textContent = '';
    document.getElementById('file-category-error').textContent = '';
    
    // Загружаем список категорий
    fetch('/api/categories')
      .then(response => response.json())
      .then(categories => {
        const selectElement = document.getElementById('file-category');
        selectElement.innerHTML = '';
        
        if (categories.length === 0) {
          selectElement.innerHTML = '<option value="">Нет доступных категорий</option>';
          document.getElementById('file-submit').disabled = true;
        } else {
          selectElement.innerHTML = categories.map(category => 
            `<option value="${category.id}">${category.name}</option>`
          ).join('');
          document.getElementById('file-submit').disabled = false;
        }
        
        modalOverlay.classList.add('active');
        fileModal.classList.add('active');
      })
      .catch(error => {
        console.error('Ошибка загрузки категорий:', error);
      });
  });
  
  // Форма добавления/редактирования категории
  document.getElementById('category-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const categoryId = document.getElementById('category-id').value;
    const name = document.getElementById('category-name').value;
    const description = document.getElementById('category-description').value;
    
    if (!name) {
      document.getElementById('category-name-error').textContent = 'Название категории обязательно';
      return;
    }
    
    const data = { name, description };
    const method = categoryId ? 'PUT' : 'POST';
    const url = categoryId ? `/api/categories/${categoryId}` : '/api/categories';
    
    fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Ошибка при сохранении категории');
      }
      return response.json();
    })
    .then(() => {
      modalOverlay.classList.remove('active');
      categoryModal.classList.remove('active');
      loadCategories(); // Перезагрузка списка категорий
    })
    .catch(error => {
      console.error('Ошибка:', error);
      document.getElementById('category-name-error').textContent = error.message;
    });
  });
  
  // Форма добавления файла
  document.getElementById('file-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('file');
    const nameInput = document.getElementById('file-name');
    const descriptionInput = document.getElementById('file-description');
    const categoryInput = document.getElementById('file-category');
    const fileError = document.getElementById('file-error');
    const categoryError = document.getElementById('file-category-error');
    
    // Валидация
    fileError.textContent = '';
    categoryError.textContent = '';
    let hasErrors = false;
    
    if (!fileInput.files || fileInput.files.length === 0) {
      fileError.textContent = 'Выберите файл для загрузки';
      hasErrors = true;
    }
    
    if (!categoryInput.value) {
      categoryError.textContent = 'Выберите категорию';
      hasErrors = true;
    }
    
    if (hasErrors) {
      return;
    }
    
    // Создаем FormData для отправки файла
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    if (nameInput.value) {
      formData.append('name', nameInput.value);
    }
    
    if (descriptionInput.value) {
      formData.append('description', descriptionInput.value);
    }
    
    formData.append('categoryId', categoryInput.value);
    
    // Отправляем запрос
    fetch('/api/files', {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Ошибка при загрузке файла');
      }
      return response.json();
    })
    .then(() => {
      modalOverlay.classList.remove('active');
      fileModal.classList.remove('active');
      loadFiles(); // Перезагрузка списка файлов
    })
    .catch(error => {
      console.error('Ошибка:', error);
      fileError.textContent = error.message;
    });
  });
}

// Редактирование категории
function editCategory(categoryId) {
  fetch(`/api/categories/${categoryId}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Категория не найдена');
      }
      return response.json();
    })
    .then(category => {
      document.getElementById('category-modal-title').textContent = 'Редактировать категорию';
      document.getElementById('category-id').value = category.id;
      document.getElementById('category-name').value = category.name;
      document.getElementById('category-description').value = category.description || '';
      document.getElementById('category-name-error').textContent = '';
      
      const modalOverlay = document.getElementById('modal-overlay');
      const categoryModal = document.getElementById('category-modal');
      
      modalOverlay.classList.add('active');
      categoryModal.classList.add('active');
    })
    .catch(error => {
      console.error('Ошибка:', error);
    });
}

// Подтверждение удаления категории
function confirmDeleteCategory(categoryId) {
  const confirmMessage = document.getElementById('confirm-modal-message');
  const confirmButton = document.getElementById('confirm-button');
  const modalOverlay = document.getElementById('modal-overlay');
  const confirmModal = document.getElementById('confirm-modal');
  
  confirmMessage.textContent = 'Вы уверены, что хотите удалить эту категорию? Все файлы в категории также будут удалены. Это действие нельзя отменить.';
  
  // Убираем старые обработчики
  const newConfirmButton = confirmButton.cloneNode(true);
  confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
  
  // Добавляем новый обработчик
  newConfirmButton.addEventListener('click', () => deleteCategory(categoryId));
  
  modalOverlay.classList.add('active');
  confirmModal.classList.add('active');
}

// Удаление категории
function deleteCategory(categoryId) {
  fetch(`/api/categories/${categoryId}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Ошибка при удалении категории');
    }
    
    // Закрываем модальное окно
    const modalOverlay = document.getElementById('modal-overlay');
    const confirmModal = document.getElementById('confirm-modal');
    
    modalOverlay.classList.remove('active');
    confirmModal.classList.remove('active');
    
    // Перезагружаем списки
    loadCategories();
    loadFiles();
    loadStats();
  })
  .catch(error => {
    console.error('Ошибка:', error);
  });
}

// Подтверждение удаления файла
function confirmDeleteFile(fileId) {
  const confirmMessage = document.getElementById('confirm-modal-message');
  const confirmButton = document.getElementById('confirm-button');
  const modalOverlay = document.getElementById('modal-overlay');
  const confirmModal = document.getElementById('confirm-modal');
  
  confirmMessage.textContent = 'Вы уверены, что хотите удалить этот файл? Это действие нельзя отменить.';
  
  // Убираем старые обработчики
  const newConfirmButton = confirmButton.cloneNode(true);
  confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
  
  // Добавляем новый обработчик
  newConfirmButton.addEventListener('click', () => deleteFile(fileId));
  
  modalOverlay.classList.add('active');
  confirmModal.classList.add('active');
}

// Удаление файла
function deleteFile(fileId) {
  fetch(`/api/files/${fileId}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Ошибка при удалении файла');
    }
    
    // Закрываем модальное окно
    const modalOverlay = document.getElementById('modal-overlay');
    const confirmModal = document.getElementById('confirm-modal');
    
    modalOverlay.classList.remove('active');
    confirmModal.classList.remove('active');
    
    // Перезагружаем списки
    loadFiles();
    loadStats();
  })
  .catch(error => {
    console.error('Ошибка:', error);
  });
}

// Выход из системы
function logout() {
  fetch('/api/logout', {
    method: 'POST'
  })
  .then(() => {
    window.location.href = 'admin-login.html';
  })
  .catch(error => {
    console.error('Ошибка при выходе:', error);
  });
}