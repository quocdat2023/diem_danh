from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from typing import List
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
from bson.objectid import ObjectId

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
import os
try:
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
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

    @classmethod
    def delete(cls, student_id):
        result = cls.collection.delete_one({'student_id': student_id})
        return result.deleted_count > 0

class Attendance:
    collection = db['attendance']

    @classmethod
    def create(cls, student_id, date, shift):
        cls.collection.insert_one({
            'student_id': student_id,
            'date': date,
            'shift': shift,
            'status': 'Present'
        })

    @classmethod
    def get_all(cls):
        return list(cls.collection.find().sort('date', -1))

    @classmethod
    def delete(cls, record_id):
        result = cls.collection.delete_one({'_id': ObjectId(record_id)})
        return result.deleted_count > 0

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
async def register(student_id: str = Form(...), name: str = Form(...), image_files: List[UploadFile] = File(...)):
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
async def checkin(file: UploadFile = File(...), shift: str = Form(...)):
    try:
        now = datetime.now()
        
        # 1. Check Day: Mon(0), Wed(2), Fri(4)
        if now.weekday() not in [0,1,2,3,4,5,6]:
             raise HTTPException(status_code=400, detail="Attendance is only allowed on Monday, Wednesday, and Friday.")

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
                    # 2. Check Duplicate for Shift/Day
                    start_of_day = datetime(now.year, now.month, now.day)
                    end_of_day = start_of_day + __import__('datetime').timedelta(days=1)
                    
                    existing = Attendance.collection.find_one({
                        'student_id': student['student_id'],
                        'shift': shift,
                        'date': {'$gte': start_of_day, '$lt': end_of_day}
                    })
                    
                    if existing:
                         raise HTTPException(status_code=400, detail=f"{student['name']} Already checked in for {shift} today.")

                    Attendance.create(student['student_id'], now, shift)
                    logger.info(f"Attendance recorded for student: {student['student_id']} in {shift}") 
                    return {"message": "Attendance recorded", "student": student['name'], "shift": shift}
        raise HTTPException(status_code=404, detail="Student not found")
    except HTTPException:
        raise
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
                'id': str(att['_id']),
                'id_student': att['student_id'],
                'student_name': student['name'] if student else 'Unknown',
                'date': att['date'].isoformat(),
                'shift': att.get('shift', 'Unknown'), # Handle legacy data
                'status': att['status']
            })
        logger.info("Fetched attendance list")
        return result
    except Exception as e:
        logger.error(f"Error in /api/attendance/list: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/attendance/{record_id}")
async def delete_attendance(record_id: str):
    try:
        if Attendance.delete(record_id):
             return {"message": "Record deleted"}
        raise HTTPException(status_code=404, detail="Record not found")
    except Exception as e:
        logger.error(f"Error in /api/attendance/{record_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/students")
async def get_students():
    try:
        students = Student.get_all()
        return [{"student_id": s['student_id'], "name": s['name']} for s in students]
    except Exception as e:
        logger.error(f"Error in /api/students: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/student/{student_id}")
async def delete_student(student_id: str):
    try:
        if Student.delete(student_id):
            logger.info(f"Deleted student: {student_id}")
            return {"message": "Student deleted successfully"}
        raise HTTPException(status_code=404, detail="Student not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in /api/student/{student_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/predict")
async def predict_identity(file: UploadFile = File(...)):
    try:
        if file.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds 5MB")
            
        contents = await file.read()
        image = Image.open(BytesIO(contents))
        image = image.resize((640, 480), Image.LANCZOS)
        image_array = np.array(image)
        
        # Get encodings
        encodings = face_recognition.face_encodings(image_array)
        if not encodings:
            return {"match": False, "name": "Unknown"}
            
        target_encoding = encodings[0]
        students = Student.get_all()
        
        best_match_name = "Unknown"
        min_dist = 0.5 # Strict threshold
        
        for student in students:
            for stored_encoding in student['face_encodings']:
                stored_encoding = np.array(stored_encoding)
                dist = face_recognition.face_distance([stored_encoding], target_encoding)[0]
                
                if dist < min_dist:
                    min_dist = dist
                    best_match_name = student['name']
                    
        return {"match": True, "name": best_match_name, "distance": float(min_dist)}

    except Exception as e:
        logger.error(f"Error in /api/predict: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/faces")
async def get_faces():
    try:
        students = Student.get_all()
        faces = []
        for s in students:
            if 'face_encodings' in s and s['face_encodings']:
                faces.append({
                    "label": s['name'],
                    "descriptors": s['face_encodings']
                })
        return faces
    except Exception as e:
        logger.error(f"Error in /api/faces: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)