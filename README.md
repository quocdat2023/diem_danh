# Face Attendance System

A comprehensive face recognition attendance system built with Flask (as the frontend/BFF) and FastAPI (as the backend core), utilizing MongoDB for data storage.

## Features

- **User Registration**: Register new students with their name, ID, and face images. Automatic face encoding generation.
- **Real-time Attendance**: Check in students using their face via the webcam.
- **Duplicate Prevention**: Logic to prevent multiple check-ins for the same student in the same shift/day.
- **Attendance Management**: View list of attendance records and delete entries.
- **Hybrid Architecture**: Uses Flask for serving the UI and FastAPI for high-performance face recognition processing.
- **Docker Ready**: Includes configuration for deployment (compatible with Hugging Face Spaces).

## Tech Stack

- **Frontend**: HTML5, JavaScript (Face-API.js for client-side interactions), Jinja2 Templates.
- **Backend (UI & Proxy)**: Flask.
- **Backend (Core API)**: FastAPI, Uvicorn.
- **AI/ML**: `face_recognition` (dlib), NumPy, Pillow.
- **Database**: MongoDB.

## Prerequisites

- Python 3.8 or higher.
- MongoDB running locally on default port `27017` OR a valid `MONGO_URI`.
- C++ Build Tools (CMake) if installing `dlib` from source.

## Installation & Setup

### 1. Local Development

1.  **Clone the repository**:
    ```bash
    git clone <your-repo-url>
    cd diem_danh
    ```

2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
    *Note: If you encounter issues with dlib, ensure you have CMake installed or use the provided `.whl` file if on Windows.*

3.  **Run the Services**:
    You need to run both the FastAPI backend and the Flask frontend.

    **Terminal 1 (FastAPI Backend)**:
    ```bash
    uvicorn app_fastapi:app --host 0.0.0.0 --port 8000
    ```

    **Terminal 2 (Flask Frontend)**:
    ```bash
    python app_flask.py
    ```

4.  **Access the Application**:
    Open your browser to [http://localhost:7860](http://localhost:7860).

### 2. Docker / Deployment

The project includes a `Dockerfile` and `docker-compose.yml` for easy containerization.

1.  **Build and Run**:
    ```bash
    docker-compose up --build
    ```

2.  The application will start on port `7860`.

## Project Structure

- **app_flask.py**: The Flask application that serves the HTML pages and proxies requests to the FastAPI backend.
- **app_fastapi.py**: The FastAPI application handling the heavy lifting: face identification, database operations, and user management.
- **templates/**: HTML files (`index.html`, `register.html`, etc.).
- **static/**: Static assets including `face-api.min.js`, CSS, and images.
- **requirements.txt**: Python package dependencies.
- **Dockerfile**: Configuration for building the application container.

## API Endpoints (FastAPI)

- `GET /api/attendance/list`: Get all attendance records.
- `POST /api/attendance/checkin`: Check in with a face image.
- `POST /api/register`: Register a new student.
- `POST /api/predict`: Identify a face from an image.
- `GET /api/faces`: Get all face encodings (for debugging/client-side matching).

## License

[MIT](LICENSE)
