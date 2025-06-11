from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import face_recognition
import numpy as np
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from io import BytesIO
from PIL import Image
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:8000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection with error handling
try:
    client = MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=5000)
    client.server_info()  # Test connection
    db = client['attendance_db']
    db['students'].create_index([('student_id', 1)], unique=True)  # Ensure unique student_id
    db['attendance'].create_index([('student_id', 1), ('date', 1)])
except ConnectionFailure as e:
    logger.error(f"Failed to connect to MongoDB: {str(e)}")
    raise Exception("Cannot connect to MongoDB")

class Student:
    collection = db['students']

    @classmethod
    def create(cls, student_id, name, encodings):
        try:
            cls.collection.insert_one({
                'student_id': student_id,
                'name': name,
                'face_encodings': [encoding.tolist() for encoding in encodings]
            })
        except Exception as e:
            logger.error(f"Failed to create student: {str(e)}")
            raise HTTPException(status_code=400, detail="Student ID already exists")

    @classmethod
    def get_all(cls):
        return list(cls.collection.find())

    @classmethod
    def find_by_id(cls, student_id):
        return cls.collection.find_one({'student_id': student_id})

class Attendance:
    collection = db['attendance']

    @classmethod
    def create(cls, student_id, date):
        cls.collection.insert_one({
            'student_id': student_id,
            'date': date,
            'status': 'Present'
        })

    @classmethod
    def get_all(cls):
        return list(cls.collection.find())

@app.get("/")
async def serve_frontend():
    return FileResponse("static/index.html")

@app.get("/api/student/{student_id}")
async def check_student(student_id: str):
    student = Student.find_by_id(student_id)
    if student:
        return {"student_id": student['student_id'], "name": student['name']}
    raise HTTPException(status_code=404, detail="Student not found")

@app.post("/api/register")
async def register(student_id: str = Form(...), name: str = Form(...), image_files: list[UploadFile] = File(...)):
    try:
        encodings = []
        for file in image_files:
            if file.size > 5 * 1024 * 1024:  # Limit file size to 5MB
                raise HTTPException(status_code=400, detail=f"File {file.filename} exceeds 5MB")
            contents = await file.read()
            image = Image.open(BytesIO(contents))
            # Resize image to speed up processing
            image = image.resize((640, 480), Image.LANCZOS)
            image_array = np.array(image)
            face_encodings = face_recognition.face_encodings(image_array)
            if not face_encodings:
                raise HTTPException(status_code=400, detail=f"No faces detected in image: {file.filename}")
            if len(face_encodings) > 1:
                raise HTTPException(status_code=400, detail=f"Multiple faces detected in image: {file.filename}")
            encodings.append(face_encodings[0])
            logger.info(f"Processed image: {file.filename}, size: {len(contents)} bytes")
        Student.create(student_id, name, encodings)
        logger.info(f"Registered student: {student_id}")
        return {"message": "Student registered successfully", "student_id": student_id, "name": name}
    except Exception as e:
        logger.error(f"Error in /api/register: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/attendance/checkin")
async def checkin(file: UploadFile = File(...)):
    try:
        if file.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds 5MB")
        contents = await file.read()
        image = Image.open(BytesIO(contents))
        image = image.resize((640, 480), Image.LANCZOS)
        image_array = np.array(image)
        encodings = face_recognition.face_encodings(image_array)
        if not encodings:
            raise HTTPException(status_code=400, detail="No faces detected")

        students = Student.get_all()
        for student in students:
            for stored_encoding in student['face_encodings']:
                stored_encoding = np.array(stored_encoding)
                results = face_recognition.compare_faces([stored_encoding], encodings[0])
                if results[0]:
                    Attendance.create(student['student_id'], datetime.now())
                    logger.info(f"Attendance recorded for student: {student['student_id']}")
                    return {"message": "Attendance recorded", "student": student['name']}
        raise HTTPException(status_code=404, detail="Student not found")
    except Exception as e:
        logger.error(f"Error in /api/attendance/checkin: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/attendance/list")
async def get_attendance():
    try:
        attendances = Attendance.get_all()
        result = []
        for att in attendances:
            student = Student.find_by_id(att['student_id'])
            result.append({
                'id_student': att['student_id'],
                'student_name': student['name'] if student else 'Unknown',
                'date': att['date'].isoformat(),
                'status': att['status']
            })
        logger.info("Fetched attendance list")
        return result
    except Exception as e:
        logger.error(f"Error in /api/attendance/list: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)