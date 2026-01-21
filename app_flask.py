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

@app.route('/train')
def train_page():
    return render_template('train.html')

@app.route('/capture', methods=['POST'])
def capture():
    try:
        image_data = request.form.get('image')
        shift = request.form.get('shift')
        if not image_data:
            return jsonify({'error': 'No image provided'}), 400
        if not shift:
            return jsonify({'error': 'Shift is required'}), 400
            
        image_bytes = base64.b64decode(image_data.split(',')[1])
        response = requests.post(
            'http://localhost:8000/api/attendance/checkin',
            files={'file': ('image.jpg', image_bytes, 'image/jpeg')},
            data={'shift': shift}
        )
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to process capture: {str(e)}'}), 500

@app.route('/stats')
def stats_page():
    return render_template('stats.html')

@app.route('/attendance/<record_id>', methods=['DELETE'])
def delete_attendance(record_id):
    try:
        response = requests.delete(f'http://localhost:8000/api/attendance/{record_id}')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to delete record: {str(e)}'}), 500



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

        # Read files into memory to avoid stream issues with requests
        files = []
        for f in image_files:
            if f:
                content = f.read()
                files.append(('image_files', (secure_filename(f.filename), content, f.mimetype)))

        # Send to FastAPI
        # FastAPI will handle duplicate check via MongoDB constraints
        response = requests.post(
            'http://localhost:8000/api/register',
            data={'student_id': student_id, 'name': name},
            files=files
        )
        
        # If FastAPI returns error (e.g. 400 duplicate), forward it
        return jsonify(response.json()), response.status_code

    except Exception as e:
        print(f"Error in register_student: {e}") # Debug log to console
        return jsonify({'error': f'Failed to register student: {str(e)}'}), 500

@app.route('/attendance')
def attendance():
    try:
        response = requests.get('http://localhost:8000/api/attendance/list')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to fetch attendance: {str(e)}'}), 500

@app.route('/students', methods=['GET'])
def get_students():
    try:
        response = requests.get('http://localhost:8000/api/students')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to fetch students: {str(e)}'}), 500

@app.route('/student/<student_id>', methods=['DELETE'])
def delete_student(student_id):
    try:
        response = requests.delete(f'http://localhost:8000/api/student/{student_id}')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to delete student: {str(e)}'}), 500

    except Exception as e:
        return jsonify({'error': f'Failed to delete student: {str(e)}'}), 500

@app.route('/predict_face', methods=['POST'])
def predict_face():
    try:
        image_data = request.form.get('image')
        if not image_data:
            return jsonify({'error': 'No image provided'}), 400

        # Decode base64
        header, encoded = image_data.split(',', 1)
        image_bytes = base64.b64decode(encoded)

        # Forward to FastAPI
        response = requests.post(
            'http://localhost:8000/api/predict',
            files={'file': ('capture.jpg', image_bytes, 'image/jpeg')}
        )
        
        return jsonify(response.json()), response.status_code

    except Exception as e:
        return jsonify({'error': f'Failed to predict: {str(e)}'}), 500

@app.route('/faces', methods=['GET'])
def get_faces():
    try:
        response = requests.get('http://localhost:8000/api/faces')
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({'error': f'Failed to fetch faces: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7860))
    app.run(host='0.0.0.0', port=port, debug=False)
