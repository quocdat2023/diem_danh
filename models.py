from pymongo import MongoClient
from bson.objectid import ObjectId

client = MongoClient('mongodb://localhost:27017/')
db = client['attendance-system']

class Student:
    collection = db['students']

    @staticmethod
    def create(student_id, name, face_encoding):
        return Student.collection.insert_one({
            'student_id': student_id,
            'name': name,
            'face_encoding': face_encoding.tolist()  # Lưu đặc trưng khuôn mặt
        })

    @staticmethod
    def find_by_id(student_id):
        return Student.collection.find_one({'student_id': student_id})

    @staticmethod
    def get_all():
        return list(Student.collection.find())

class Attendance:
    collection = db['attendance']

    @staticmethod
    def create(student_id, date, status='present'):
        return Attendance.collection.insert_one({
            'student_id': student_id,
            'date': date,
            'status': status
        })

    @staticmethod
    def get_all():
        return list(Attendance.collection.find())