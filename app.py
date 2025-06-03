from flask import Flask, jsonify, request, session, render_template, redirect, url_for, send_file, abort
from werkzeug.utils import secure_filename
import os
import datetime
import json
import time
import logging
import uuid
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.DEBUG)

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "archive-hub-secret")

# Create uploads directory if it doesn't exist
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
Path(UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max upload size

# In-memory database
db = {
    'users': {},
    'categories': {},
    'files': {},
    'next_id': {'user': 1, 'category': 1, 'file': 1}
}

# Initialize data
def init_db():
    # Create admin user
    admin = {
        'id': db['next_id']['user'],
        'username': 'admin',
        'password': 'adminpassword',
        'isAdmin': True
    }
    db['users'][admin['id']] = admin
    db['next_id']['user'] += 1

    # Create initial category
    category = {
        'id': db['next_id']['category'],
        'name': 'РџСЂРѕРіСЂР°РјРјС‹',
        'description': 'РџРћ РІ Р°СЂС…РёРІР°С…',
        'createdAt': datetime.datetime.now().isoformat()
    }
    db['categories'][category['id']] = category
    db['next_id']['category'] += 1

init_db()

# Helper functions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ['rar', 'zip', '7z']

def get_file_type(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    if ext == 'rar':
        return 'RAR'
    elif ext == 'zip':
        return 'ZIP'
    elif ext == '7z':
        return '7Z'
    return None

# Middleware functions
def is_authenticated():
    return 'user_id' in session

def is_admin():
    if not is_authenticated():
        return False
    user_id = session.get('user_id')
    user = db['users'].get(user_id)
    return user and user.get('isAdmin', False)

# Routes

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/category.html')
def category_page():
    return render_template('category.html')

@app.route('/admin-login.html')
def admin_login_page():
    return render_template('admin-login.html')

@app.route('/admin-dashboard.html')
def admin_dashboard_page():
    if not is_admin():
        return redirect(url_for('admin_login_page'))
    return render_template('admin-dashboard.html')

# API Routes

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    for user_id, user in db['users'].items():
        if user['username'] == username and user['password'] == password:
            session['user_id'] = user_id
            return jsonify({
                'id': user_id,
                'username': user['username'],
                'isAdmin': user.get('isAdmin', False)
            })
    
    return jsonify({'message': 'РќРµРІРµСЂРЅРѕРµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР»Рё РїР°СЂРѕР»СЊ'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'message': 'РЈСЃРїРµС€РЅС‹Р№ РІС‹С…РѕРґ'})

@app.route('/api/me')
def me():
    if not is_authenticated():
        return jsonify({'message': 'РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ'}), 401
    
    user_id = session.get('user_id')
    user = db['users'].get(user_id)
    
    if not user:
        session.pop('user_id', None)
        return jsonify({'message': 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ'}), 401
    
    return jsonify({
        'id': user_id,
        'username': user['username'],
        'isAdmin': user.get('isAdmin', False)
    })

# Categories API
@app.route('/api/categories')
def get_categories():
    categories = list(db['categories'].values())
    
    # Add file count to each category
    for category in categories:
        file_count = len([f for f in db['files'].values() if f['categoryId'] == category['id']])
        category['fileCount'] = file_count
    
    return jsonify(categories)

@app.route('/api/categories/<int:category_id>')
def get_category(category_id):
    category = db['categories'].get(category_id)
    
    if not category:
        return jsonify({'message': 'РљР°С‚РµРіРѕСЂРёСЏ РЅРµ РЅР°Р№РґРµРЅР°'}), 404
    
    # Get files for this category
    files = [f for f in db['files'].values() if f['categoryId'] == category_id]
    
    return jsonify({
        **category,
        'files': files,
        'fileCount': len(files)
    })

@app.route('/api/categories', methods=['POST'])
def create_category():
    if not is_admin():
        return jsonify({'message': 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ'}), 403
    
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'message': 'РРјСЏ РєР°С‚РµРіРѕСЂРёРё РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ'}), 400
    
    id = db['next_id']['category']
    db['next_id']['category'] += 1
    
    category = {
        'id': id,
        'name': name,
        'description': data.get('description') or None,
        'createdAt': datetime.datetime.now().isoformat()
    }
    
    db['categories'][id] = category
    return jsonify(category), 201

@app.route('/api/categories/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    if not is_admin():
        return jsonify({'message': 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ'}), 403
    
    category = db['categories'].get(category_id)
    if not category:
        return jsonify({'message': 'РљР°С‚РµРіРѕСЂРёСЏ РЅРµ РЅР°Р№РґРµРЅР°'}), 404
    
    data = request.json
    
    if 'name' in data:
        category['name'] = data['name']
    
    if 'description' in data:
        category['description'] = data['description']
    
    db['categories'][category_id] = category
    return jsonify(category)

@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    if not is_admin():
        return jsonify({'message': 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ'}), 403
    
    category = db['categories'].get(category_id)
    if not category:
        return jsonify({'message': 'РљР°С‚РµРіРѕСЂРёСЏ РЅРµ РЅР°Р№РґРµРЅР°'}), 404
    
    # Find and delete associated files
    files_to_delete = []
    for file_id, file in list(db['files'].items()):
        if file['categoryId'] == category_id:
            files_to_delete.append((file_id, file))
    
    # Delete files from disk and database
    for file_id, file in files_to_delete:
        try:
            if os.path.exists(file['path']):
                os.unlink(file['path'])
            del db['files'][file_id]
        except Exception as e:
            logging.error(f"Error deleting file: {e}")
    
    # Delete category
    del db['categories'][category_id]
    return '', 204

# Files API
@app.route('/api/files')
def get_files():
    files = list(db['files'].values())
    
    category_id = request.args.get('categoryId')
    if category_id and category_id.isdigit():
        category_id = int(category_id)
        files = [f for f in files if f['categoryId'] == category_id]
    
    return jsonify(files)

@app.route('/api/files/<int:file_id>')
def get_file(file_id):
    file = db['files'].get(file_id)
    
    if not file:
        return jsonify({'message': 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
    
    return jsonify(file)

@app.route('/api/files', methods=['POST'])
def upload_file():
    if not is_admin():
        return jsonify({'message': 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ'}), 403
    
    if 'file' not in request.files:
        return jsonify({'message': 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'message': 'Р¤Р°Р№Р» РЅРµ РІС‹Р±СЂР°РЅ'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'message': 'РќРµРІРµСЂРЅС‹Р№ С‚РёРї С„Р°Р№Р»Р°'}), 400
    
    # Get category ID
    category_id = request.form.get('categoryId')
    if not category_id or not category_id.isdigit():
        return jsonify({'message': 'РќРµРІРµСЂРЅС‹Р№ ID РєР°С‚РµРіРѕСЂРёРё'}), 400
    
    category_id = int(category_id)
    
    # Check if category exists
    if category_id not in db['categories']:
        return jsonify({'message': 'РљР°С‚РµРіРѕСЂРёСЏ РЅРµ РЅР°Р№РґРµРЅР°'}), 400
    
    # Save file
    filename = secure_filename(file.filename)
    unique_filename = f"{int(time.time())}-{uuid.uuid4()}{os.path.splitext(filename)[1]}"
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(file_path)
    
    # Create file record
    file_id = db['next_id']['file']
    db['next_id']['file'] += 1
    
    file_type = get_file_type(filename)
    
    file_record = {
        'id': file_id,
        'name': request.form.get('name') or filename,
        'description': request.form.get('description') or None,
        'size': os.path.getsize(file_path),
        'path': file_path,
        'type': file_type,
        'downloads': 0,
        'categoryId': category_id,
        'createdAt': datetime.datetime.now().isoformat()
    }
    
    db['files'][file_id] = file_record
    return jsonify(file_record), 201

@app.route('/api/files/<int:file_id>', methods=['DELETE'])
def delete_file(file_id):
    if not is_admin():
        return jsonify({'message': 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ'}), 403
    
    file = db['files'].get(file_id)
    if not file:
        return jsonify({'message': 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
    
    # Delete file from disk
    try:
        if os.path.exists(file['path']):
            os.unlink(file['path'])
    except Exception as e:
        logging.error(f"Error deleting file: {e}")
    
    # Delete from database
    del db['files'][file_id]
    return '', 204

# Download file
@app.route('/api/download/<int:file_id>')
def download_file(file_id):
    file = db['files'].get(file_id)
    
    if not file:
        return jsonify({'message': 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ'}), 404
    
    # Check if file exists on disk
    if not os.path.exists(file['path']):
        return jsonify({'message': 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ РЅР° СЃРµСЂРІРµСЂРµ'}), 404
    
    # Increment download count
    file['downloads'] += 1
    db['files'][file_id] = file
    
    # Set content type based on file type
    content_type = 'application/octet-stream'
    if file['type'] == 'ZIP':
        content_type = 'application/zip'
    elif file['type'] == 'RAR':
        content_type = 'application/x-rar-compressed'
    elif file['type'] == '7Z':
        content_type = 'application/x-7z-compressed'
    
    return send_file(
        file['path'],
        as_attachment=True,
        download_name=file['name'],
        mimetype=content_type
    )

# Statistics
@app.route('/api/stats')
def get_stats():
    if not is_admin():
        return jsonify({'message': 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ'}), 403
    
    categories = list(db['categories'].values())
    files = list(db['files'].values())
    
    # Calculate total downloads
    total_downloads = sum(f['downloads'] for f in files)
    
    # Category statistics
    category_stats = []
    for category in categories:
        category_files = [f for f in files if f['categoryId'] == category['id']]
        file_count = len(category_files)
        downloads = sum(f['downloads'] for f in category_files)
        
        category_stats.append({
            'id': category['id'],
            'name': category['name'],
            'fileCount': file_count,
            'downloads': downloads
        })
    
    # Popular files
    popular_files = sorted(files, key=lambda x: x['downloads'], reverse=True)[:5]
    popular_files = [
        {
            'id': f['id'],
            'name': f['name'],
            'downloads': f['downloads']
        } for f in popular_files
    ]
    
    return jsonify({
        'totalFiles': len(files),
        'totalCategories': len(categories),
        'totalDownloads': total_downloads,
        'categoryStats': category_stats,
        'popularFiles': popular_files
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
