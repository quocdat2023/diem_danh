from flask import Flask, render_template, request, jsonify
import requests
from werkzeug.utils import secure_filename
import base64
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

@app.route('/capture', methods=['POST'])
def capture():
    try:
        image_data = request.form.get('image')
        if not image_data:
            return jsonify({'error': 'No image provided'}), 400
        image_bytes = base64.b64decode(image_data.split(',')[1])
        response = requests.post(
            'http://localhost:8000/api/attendance/checkin',
            files={'file': ('image.jpg', image_bytes, 'image/jpeg')}
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to process capture: {str(e)}'}), 500

@app.route('/register_student', methods=['POST'])
def register_student():
    try:
        student_id = request.form.get('student_id')
        name = request.form.get('name')
        image_files = request.files.getlist('image_files')

        if not student_id or not name:
            return jsonify({'error': 'Student ID and name are required'}), 400
        if not image_files and not request.form.get('image_files'):
            return jsonify({'error': 'At least one image is required'}), 400

        # Check for duplicate student_id
        check_response = requests.get(f'http://localhost:8000/api/student/{student_id}')
        if check_response.status_code == 200:
            return jsonify({'error': 'Student ID already exists'}), 400

        files = [(f'image_files', (secure_filename(f.filename), f.stream, f.mimetype)) for f in image_files if f]
        response = requests.post(
            'http://localhost:8000/api/register',
            data={'student_id': student_id, 'name': name},
            files=files
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to register student: {str(e)}'}), 500

@app.route('/attendance')
def attendance():
    try:
        response = requests.get('http://localhost:8000/api/attendance/list')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to fetch attendance: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
